"""시세 수집·정합성 검사·판단용 스냅샷 생성."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from . import indicators
from . import market_calendar as mc
from .common import D, DataIntegrityError, sha256, to_jsonable
from .db import jsonb
from .sources import Bar, _NHInconsistentOHLC, _NHRefetchError, _NHRequestError

SPLIT_GAP_LOW, SPLIT_GAP_HIGH = Decimal("0.6"), Decimal("1.6")
BAR_FIELDS = ("open", "high", "low", "close", "volume")


class IngestionBlocked(DataIntegrityError):
    """All symbol failures from an ingestion attempt whose writes roll back."""

    def __init__(self, source: str, through: date, issues: list[dict], symbols_checked: int):
        self.detail = to_jsonable({"kind": "ingestion_blocked", "source": source,
                                  "through": through, "symbols_checked": symbols_checked,
                                  "committed_bars": 0, "issues": issues})
        super().__init__("market-data ingestion blocked: " + "; ".join(issue["message"] for issue in issues))


class _StoredBarRevision(DataIntegrityError):
    def __init__(self, symbol: str, source: str, bar: Bar, stored: dict, observed_at: datetime):
        old = {field: int(stored[field]) if field == "volume" else D(stored[field]) for field in BAR_FIELDS}
        new = {field: getattr(bar, field) for field in BAR_FIELDS}
        message = f"{symbol} {bar.trade_date}: source revised a stored bar (basis unverified)"
        self.detail = to_jsonable({
            "symbol": symbol, "source": source, "trade_date": bar.trade_date,
            "code": "stored_bar_revision", "error_class": "DataIntegrityError", "message": message,
            "changed_fields": [field for field in BAR_FIELDS if old[field] != new[field]],
            "stored": old, "observed": new, "stored_fetched_at": stored["fetched_at"],
            "observed_at": observed_at,
        })
        super().__init__(message)


def _integrity_issue(symbol: str, source: str, exc: DataIntegrityError) -> dict:
    if isinstance(exc, _StoredBarRevision):
        return exc.detail
    # Classify known quote failures without copying an arbitrary exception body.
    message = str(exc)
    code, reason = "source_integrity_error", "source data failed integrity validation"
    for marker, candidate, description in (
        ("inconsistent OHLC", "invalid_ohlc", "inconsistent OHLC"),
        ("non-positive price", "non_positive_price", "non-positive price"),
        ("negative volume", "negative_volume", "negative volume"),
        ("unrecorded split", "unrecorded_split_or_bad_tick", "unrecorded split or bad tick"),
        ("non-session date", "non_session_bar", "bar on a non-session date"),
        ("duplicate NH bar", "duplicate_source_bar", "duplicate source bar"),
        ("NH request failed", "quote_request_failed", "NH quote request failed"),
        ("NH period:", "invalid_source_response", "invalid NH quote response"),
    ):
        if marker in message:
            code, reason = candidate, description
            break
    issue = {"symbol": symbol, "source": source, "code": code,
             "error_class": type(exc).__name__, "message": f"{symbol}: {reason}"}
    trade_date = getattr(exc, "trade_date", None)
    if isinstance(trade_date, date):
        issue["trade_date"] = trade_date.isoformat()
    if isinstance(exc, _NHInconsistentOHLC):
        issue["ohlc"] = to_jsonable(exc.ohlc)
    elif isinstance(exc, _NHRefetchError):
        issue["refetch_reason"] = exc.reason
        issue["observations"] = to_jsonable(exc.observations)
        if exc.request_category is not None:
            issue["request_category"] = exc.request_category
    elif isinstance(exc, _NHRequestError):
        issue["request_category"] = exc.category
    return issue


def active_universe(conn, role: str | None = None) -> list[dict]:
    sql = "select symbol, name, sector, role from stock_universe where removed_at is null"
    params: tuple = ()
    if role:
        sql += " and role = %s"
        params = (role,)
    return conn.execute(sql + " order by role desc, symbol", params).fetchall()


def sync_sessions(conn, start: date, end: date) -> int:
    n = 0
    for s in mc.sessions_between(start, end):
        o, c, early = mc.session_times(s)
        n += conn.execute(
            "insert into market_sessions values (%s,%s,%s,%s) on conflict do nothing", (s, o, c, early)
        ).rowcount
    return n


def recorded_splits(conn, symbol: str, source_name: str, through: date, cutoff: datetime | None = None) -> dict[date, Decimal]:
    """Only split events applicable to this source and known by the requested as-of.

    DEMO events have a fixed synthetic schedule (they may be generated during
    a historical replay), so DB insertion time is intentionally ignored there.
    Real events must have been registered no later than the decision cutoff.
    """
    sql = ("select ex_date, ratio from corporate_actions"
           " where symbol=%s and kind='split' and price_source=%s and ex_date<=%s")
    params: tuple = (symbol, source_name, through)
    if cutoff is not None and source_name != "demo":
        sql += " and created_at<=%s"
        params += (cutoff,)
    rows = conn.execute(sql, params).fetchall()
    return {r["ex_date"]: D(r["ratio"]) for r in rows}


def ingest(conn, source, symbols: list[str], through: date, now: datetime, history_bars: int) -> dict:
    """through(확정된 거래일)까지 일봉을 수집한다.

    - through 이후 봉은 저장하지 않는다(미래 데이터 차단).
    - 모든 종목의 알려진 정합성 오류를 모아 보고하고, 하나라도 있으면 이번 수집 전체를 롤백한다.
    - 이미 저장된 봉과 값이 다르면 조용히 덮어쓰지 않고 중단한다(사후 수정 감지).
    - 분할로 보이는 시가 갭이 있는데 corporate_actions 에 기록이 없으면 중단한다.
    - through 일자 봉이 하나라도 없으면 중단한다(이전 가격으로 위장하지 않음).
    """
    report = {"inserted": 0, "symbols": len(symbols), "through": through.isoformat()}
    issues, failed, checked = [], set(), 0
    # Own the transaction even when a caller has not opened one. Inside a caller's
    # transaction psycopg uses a savepoint. A failed batch cannot publish a subset.
    with conn.transaction():
        for symbol in symbols:
            checked += 1
            last = conn.execute(
                "select max(trade_date) as d from stock_prices where symbol=%s and source=%s", (symbol, source.name)
            ).fetchone()["d"]
            if last is not None and last >= through:
                continue
            count = history_bars if last is None else len(mc.sessions_between(last, through)) + 5
            try:
                bars = [b for b in source.daily_bars(symbol, through, count) if b.trade_date <= through]
                _store(conn, symbol, source.name, bars, now, report)
            except DataIntegrityError as exc:
                failed.add(symbol)
                issues.append(_integrity_issue(symbol, source.name, exc))
                if isinstance(exc, _NHRequestError) or (
                    isinstance(exc, _NHRefetchError) and exc.request_category is not None
                ):
                    # Exhausted transport/auth failures may affect every symbol.
                    # Do not repeat the full retry budget until the workflow is killed.
                    raise IngestionBlocked(source.name, through, issues, checked) from None
        for symbol in symbols:
            if symbol in failed:
                continue  # Its missing final bar is already explained by the recorded failure.
            if not conn.execute(
                "select 1 from stock_prices where symbol=%s and trade_date=%s and source=%s",
                (symbol, through, source.name),
            ).fetchone():
                issues.append({"symbol": symbol, "source": source.name, "trade_date": through.isoformat(),
                               "code": "missing_bar", "error_class": "DataIntegrityError",
                               "message": f"missing bars for {through}: {symbol}"})
        if issues:
            raise IngestionBlocked(source.name, through, issues, checked)
    return report


def _store(conn, symbol: str, source_name: str, bars: list[Bar], now: datetime, report: dict) -> None:
    splits = recorded_splits(conn, symbol, source_name, bars[-1].trade_date) if bars else {}
    prev_close = None
    first = bars[0].trade_date if bars else None
    if first is not None:
        row = conn.execute(
            "select close from stock_prices where symbol=%s and source=%s and trade_date<%s order by trade_date desc limit 1",
            (symbol, source_name, first),
        ).fetchone()
        prev_close = D(row["close"]) if row else None
    for bar in bars:
        bar.check()
        if not mc.is_session(bar.trade_date):
            raise DataIntegrityError(f"{symbol}: bar on non-session date {bar.trade_date}")
        existing = conn.execute(
            "select open, high, low, close, volume, fetched_at from stock_prices where symbol=%s and trade_date=%s and source=%s",
            (symbol, bar.trade_date, source_name),
        ).fetchone()
        if existing:
            same = (D(existing["open"]) == bar.open and D(existing["high"]) == bar.high and D(existing["low"]) == bar.low
                    and D(existing["close"]) == bar.close and int(existing["volume"]) == bar.volume)
            if not same:
                raise _StoredBarRevision(symbol, source_name, bar, existing, now)
            prev_close = bar.close
            continue
        if prev_close is not None:
            gap = bar.open / prev_close
            if (gap < SPLIT_GAP_LOW or gap > SPLIT_GAP_HIGH) and bar.trade_date not in splits:
                raise DataIntegrityError(
                    f"{symbol} {bar.trade_date}: open/prev_close={gap:.3f} looks like an unrecorded split or bad tick")
        conn.execute(
            "insert into stock_prices(symbol,trade_date,open,high,low,close,volume,source,fetched_at,raw)"
            " values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (symbol, bar.trade_date, bar.open, bar.high, bar.low, bar.close, bar.volume, source_name, now,
             jsonb(bar.raw) if bar.raw else None),
        )
        report["inserted"] += 1
        prev_close = bar.close


def adjusted_history(conn, symbol: str, source_name: str, through: date, cutoff: datetime) -> list[dict]:
    """through/cutoff 시점까지 확정된 봉과 해당 시점에 유효한 분할만 조정한다."""
    rows = conn.execute(
        "select trade_date, open, high, low, close, volume from stock_prices"
        " where symbol=%s and source=%s and trade_date<=%s and fetched_at<=%s order by trade_date",
        (symbol, source_name, through, cutoff),
    ).fetchall()
    splits = sorted(recorded_splits(conn, symbol, source_name, through, cutoff).items())
    out = []
    for r in rows:
        factor = Decimal(1)
        for ex, ratio in splits:
            if r["trade_date"] < ex:
                factor *= ratio
        out.append({
            "date": r["trade_date"],
            "open": float(D(r["open"]) / factor), "high": float(D(r["high"]) / factor),
            "low": float(D(r["low"]) / factor), "close": float(D(r["close"]) / factor),
            "volume": float(D(r["volume"]) * factor),
        })
    return out


def build_market_payload(conn, source_name: str, data_as_of: date, cutoff: datetime, universe_rows=None) -> dict:
    """모든 AI가 공유하는 공통 시장 데이터. 결정적(deterministic)이어야 해시가 재현된다."""
    rows = []
    for u in (universe_rows if universe_rows is not None else active_universe(conn)):
        hist = adjusted_history(conn, u["symbol"], source_name, data_as_of, cutoff)
        if not hist or hist[-1]["date"] != data_as_of:
            raise DataIntegrityError(f"{u['symbol']}: no confirmed bar for {data_as_of}")
        closes = [h["close"] for h in hist]
        ind = indicators.compute(closes, [h["high"] for h in hist], [h["low"] for h in hist],
                                 [h["volume"] for h in hist])
        ind["closes_last_10"] = [round(c, 4) for c in closes[-10:]]
        rows.append({"symbol": u["symbol"], "name": u["name"], "sector": u["sector"], "role": u["role"], **ind})
    investable = [r for r in rows if r["role"] == "investable"]
    benchmark = [r for r in rows if r["role"] == "benchmark"]
    for r in rows:
        del r["role"]
    return {
        "schema_version": 1,
        "data_as_of": data_as_of.isoformat(),
        "price_basis": "daily regular-session bars, point-in-time source-scoped split-adjusted",
        "source": source_name,
        "investable": investable,
        "benchmark": benchmark,
    }


def store_snapshot(conn, payload: dict, data_as_of: date, cutoff: datetime) -> tuple[int, str]:
    h = sha256(payload)
    conn.execute(
        "insert into market_snapshots(snapshot_hash, data_as_of, cutoff_at, payload) values (%s,%s,%s,%s)"
        " on conflict (snapshot_hash) do nothing",
        (h, data_as_of, cutoff, jsonb(payload)),
    )
    row = conn.execute("select id from market_snapshots where snapshot_hash=%s", (h,)).fetchone()
    return row["id"], h


def bar_on(conn, symbol: str, source_name: str, d: date):
    return conn.execute(
        "select * from stock_prices where symbol=%s and source=%s and trade_date=%s", (symbol, source_name, d)
    ).fetchone()


def has_later_bar(conn, symbol: str, source_name: str, d: date) -> bool:
    return bool(conn.execute(
        "select 1 from stock_prices where symbol=%s and source=%s and trade_date>%s limit 1", (symbol, source_name, d)
    ).fetchone())
