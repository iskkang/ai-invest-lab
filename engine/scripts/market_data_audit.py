"""Read-only, quote-only audit of stored NH bars against two fresh observations.

Never bootstraps the experiment, changes prices, settles orders, or calls an AI.
Output is bounded JSON Lines containing only quote fields and aggregate counts.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from ail import market_calendar as mc
from ail.common import D
from ail.sources import NH_GUBUN_DAY, NH_PERIOD_PATH, NHQuoteSource

FIELDS = ("open", "high", "low", "close", "volume")
RAW_FIELDS = ("trade_date", "trade_time", "bsop_date", "open_prc", "high", "low", "close_prc", "movolume")
MAX_DIFF_OUTPUT = 80
SAFE_CATEGORIES = {"rate_limit", "network", "http", "auth", "config"}


def _json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    raise TypeError(type(value).__name__)


def emit(event, **detail):
    print(json.dumps({"event": event, **detail}, default=_json_value,
                     ensure_ascii=True, allow_nan=False), flush=True)


def safe_error(exc):
    category = getattr(exc, "category", None)
    return {"error_class": type(exc).__name__,
            "category": category if category in SAFE_CATEGORIES else "unknown"}


def raw_quote(raw):
    if not isinstance(raw, dict):
        return {}
    # Even whitelisted quote fields must contain only bounded numeric/date text.
    return {key: str(raw[key]) if re.fullmatch(r"[0-9+.,:/ -]{1,48}", str(raw[key])) else "[non-numeric]"
            for key in RAW_FIELDS if key in raw}


def values(row):
    if row is None:
        return None
    get = row.get if isinstance(row, dict) else lambda field: getattr(row, field)
    return {field: int(get(field)) if field == "volume" else D(get(field)) for field in FIELDS}


def latest_completed(now):
    today = mc.ny_today(now)
    if mc.is_session(today) and mc.after_close(today, now):
        return today
    return mc.previous_session(today)


def read_observation(source, symbol, query, number, label):
    started = datetime.now(timezone.utc)
    bars, errors = {}, 0
    try:
        response = source._request(NH_PERIOD_PATH, query.copy())
        rows = response.get("Output_1") if isinstance(response, dict) else None
        if not isinstance(rows, list) or len(rows) > 1000:
            raise ValueError("invalid quote row container")
        for row in rows:
            try:
                bar = source.parse_row(symbol, row)
                if bar.trade_date in bars:
                    raise ValueError("duplicate quote date")
                bars[bar.trade_date] = bar
            except Exception as exc:
                errors += 1
                if errors <= 3:
                    emit("quote_row_error", symbol=symbol, observation=number, query_kind=label,
                         quote=raw_quote(row), **safe_error(exc))
    except Exception as exc:
        errors += 1
        emit("quote_request_error", symbol=symbol, observation=number, query_kind=label, **safe_error(exc))
    emit("observation_complete", symbol=symbol, observation=number, query_kind=label,
         started_at=started, completed_at=datetime.now(timezone.utc), rows=len(bars), errors=errors)
    return bars, errors


def reference_summary(conn, experiment_id):
    rounds = conn.execute(
        "select status,count(*) as count,min(session_date) as first_session,max(session_date) as latest_session "
        "from experiment_rounds where experiment_id=%s group by status order by status", (experiment_id,)
    ).fetchall()
    accounts = conn.execute(
        "select a.kind,a.benchmark_code,count(distinct a.id) as accounts,count(t.id) as trades,"
        "min(t.trade_date) as first_trade,max(t.trade_date) as latest_trade "
        "from portfolio_accounts a left join trades t on t.account_id=a.id "
        "where a.experiment_id=%s group by a.kind,a.benchmark_code order by a.kind,a.benchmark_code",
        (experiment_id,),
    ).fetchall()
    marks = {}
    for table in ("portfolio_snapshots", "benchmark_snapshots"):
        marks[table] = conn.execute(
            f"select count(*) as count,min(s.session_date) as first_session,max(s.session_date) as settled_through "
            f"from {table} s join portfolio_accounts a on a.id=s.account_id where a.experiment_id=%s",
            (experiment_id,),
        ).fetchone()
    snapshots = conn.execute(
        "select count(distinct r.snapshot_id) as used_market_snapshots,min(r.data_as_of) as first_data_as_of,"
        "max(r.data_as_of) as latest_data_as_of from experiment_rounds r "
        "where r.experiment_id=%s and r.snapshot_id is not null", (experiment_id,),
    ).fetchone()
    emit("reference_summary", rounds=rounds, accounts_and_trades=accounts, marks=marks, snapshots=snapshots)


def audit(conn, through, history_bars):
    exp = conn.execute("select id,mode,start_session,status from experiments where name=%s",
                       (os.environ.get("AIL_EXPERIMENT", "season-1"),)).fetchone()
    if not exp or exp["mode"] != "live":
        emit("audit_error", category="live_experiment_unavailable")
        return 1
    reference_summary(conn, exp["id"])
    rows = conn.execute(
        "select symbol from stock_universe where removed_at is null union "
        "select h.symbol from holdings h join portfolio_accounts a on a.id=h.account_id where a.experiment_id=%s union "
        "select symbol from universe_change_requests where experiment_id=%s and status='scheduled' and action='add' "
        "order by symbol", (exp["id"], exp["id"]),
    ).fetchall()
    symbols = [row["symbol"] for row in rows]
    if len(symbols) > 100 or any(not re.fullmatch(r"[A-Za-z0-9.^=_/-]{1,24}", s) for s in symbols):
        emit("audit_error", category="unexpected_universe")
        return 1
    # Two deliberate observations; no automatic inconsistent-OHLC reread.
    source = NHQuoteSource(max_retries=0)
    total_errors = price_diffs = volume_diffs = unstable_rows = shown = 0
    emit("universe", experiment=exp, symbols=symbols)
    for index, symbol in enumerate(symbols, 1):
        latest = conn.execute(
            "select count(*) as count,min(trade_date) as first_session,max(trade_date) as latest_session "
            "from stock_prices where symbol=%s and source='nh_plug'", (symbol,),
        ).fetchone()
        last = latest["latest_session"]
        incremental_count = history_bars if last is None else len(mc.sessions_between(last, through)) + 5
        count = min(history_bars, incremental_count)
        emit("symbol_start", symbol=symbol, index=index, total=len(symbols), stored=latest,
             ingest_would_skip=last is not None and last >= through,
             incremental_count=incremental_count, audit_count=count, count_capped=count != incremental_count)
        variants = [("incremental", count)]
        if symbol == "COST" and count < 10:
            variants.append(("cost_extended_diagnostic", 10))
        for label, request_count in variants:
            query = {"iem_cd": symbol, "end_dt": through.strftime("%Y%m%d"), "count": str(request_count),
                     "maxavg": "0", "gubun": NH_GUBUN_DAY, "xtick": "0001", "today_cls": "0", "market_cls": "1"}
            emit("quote_query", symbol=symbol, query_kind=label, parameters=query)
            first, errors1 = read_observation(source, symbol, query, 1, label)
            second, errors2 = read_observation(source, symbol, query, 2, label)
            total_errors += errors1 + errors2
            dates = sorted(d for d in set(first) | set(second) if d <= through)
            stored_rows = conn.execute(
                "select trade_date,open,high,low,close,volume,fetched_at,raw from stock_prices "
                "where symbol=%s and source='nh_plug' and trade_date=any(%s) order by trade_date",
                (symbol, dates),
            ).fetchall() if dates else []
            stored = {r["trade_date"]: r for r in stored_rows}
            differences = unstable = 0
            for day in dates:
                old, a, b = stored.get(day), first.get(day), second.get(day)
                av, bv = values(a), values(b)
                stable = av == bv and av is not None
                unstable += not stable
                if not old:
                    continue
                oldv = values(old)
                changed = [field for field in FIELDS if any(v is not None and v[field] != oldv[field] for v in (av, bv))]
                if not changed:
                    continue
                differences += 1
                if label == "incremental":
                    if changed == ["volume"]:
                        volume_diffs += 1
                    else:
                        price_diffs += 1
                if shown < MAX_DIFF_OUTPUT:
                    shown += 1
                    emit("stored_bar_difference", symbol=symbol, trade_date=day, query_kind=label,
                         stored_fetched_at=old["fetched_at"], changed_fields=changed, stable=stable,
                         classification="volume_only" if changed == ["volume"] else "ohlc_revision",
                         stored={f: oldv[f] for f in changed},
                         observation_1={f: av[f] for f in changed} if av else None,
                         observation_2={f: bv[f] for f in changed} if bv else None,
                         raw_stored=raw_quote(old["raw"]), raw_1=raw_quote(a.raw) if a else None,
                         raw_2=raw_quote(b.raw) if b else None)
            if label == "incremental":
                unstable_rows += unstable
            if symbol == "COST" and label == variants[-1][0]:
                overlap = [d for d in dates if d in stored and d in first and d in second][-8:]
                for day in overlap:
                    emit("cost_overlap", trade_date=day, stored_fetched_at=stored[day]["fetched_at"],
                         stored=values(stored[day]), observation_1=values(first[day]), observation_2=values(second[day]),
                         raw_stored=raw_quote(stored[day]["raw"]), raw_1=raw_quote(first[day].raw), raw_2=raw_quote(second[day].raw))
            missing_through = through not in first or through not in second
            total_errors += missing_through
            emit("symbol_result", symbol=symbol, query_kind=label, stored_overlap=len(stored), differences=differences,
                 unstable_rows=unstable, through_present_both=not missing_through, compared_rows=len(dates))
    emit("audit_complete", symbols=len(symbols), request_or_row_errors=total_errors,
         price_revision_rows=price_diffs, volume_only_revision_rows=volume_diffs,
         unstable_rows=unstable_rows, difference_records_shown=shown, difference_record_limit=MAX_DIFF_OUTPUT,
         database_writes=0, ai_calls=0)
    return 1 if total_errors or price_diffs or volume_diffs or unstable_rows else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--through", type=date.fromisoformat)
    args = parser.parse_args(argv)
    now = datetime.now(timezone.utc)
    try:
        completed = latest_completed(now)
        through = args.through or completed
        if not mc.is_session(through) or through > completed:
            emit("audit_error", category="through_not_completed_nyse_session")
            return 2
        missing = [k for k in ("DATABASE_URL", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET") if not os.environ.get(k)]
        if missing:
            emit("audit_error", category="missing_required_configuration", fields=missing)
            return 2
        history_bars = min(300, max(10, int(os.environ.get("AIL_HISTORY_BARS", "300"))))
        emit("audit_start", observed_at=now, through=through, latest_completed_session=completed,
             close_buffer_minutes=60, history_limit=history_bars, read_only=True)
        with psycopg.connect(os.environ["DATABASE_URL"], options="-c default_transaction_read_only=on",
                              connect_timeout=15, row_factory=dict_row, autocommit=True) as conn:
            if conn.execute("show transaction_read_only").fetchone()["transaction_read_only"] != "on":
                emit("audit_error", category="read_only_guard_not_active")
                return 2
            return audit(conn, through, history_bars)
    except Exception as exc:
        emit("audit_error", **safe_error(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
