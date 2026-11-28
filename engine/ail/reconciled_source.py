"""Quote-only, explicitly sourced reconciliation for live market data.

The legacy NH adapter remains strict and unchanged. This adapter selects one
complete provider history per symbol, never grafts alternate-provider volume
onto an NH series, and never repairs an OHLC value by guessing. The dataset
name is distinct from either provider name; every returned bar and batch keeps
the provider that actually reported it.
"""
from __future__ import annotations

import json
import re
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

import httpx

from . import market_calendar as mc
from .common import D, PRICE_Q, DataIntegrityError, LabError, sha256, to_jsonable
from .config import BENCHMARK_SYMBOL
from .sources import Bar, NHQuoteSource, NH_PERIOD_PATH, _NHInconsistentOHLC, _NHRefetchError, _NHRequestError


RECONCILED_SOURCE = "reconciled_live_v1"
NASDAQ_PROVIDER = "nasdaq_historical"
NASDAQ_ORIGIN = "https://api.nasdaq.com"
MAX_HISTORY_BARS = 300
_SYMBOL = re.compile(r"[A-Z][A-Z0-9.-]{0,19}\Z")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _observed(clock) -> datetime:
    now = clock()
    if not isinstance(now, datetime) or now.tzinfo is None:
        raise ValueError("quote observation clock must return an aware datetime")
    return now.astimezone(timezone.utc)


def _validate_request(symbol: str, end: date, count: int, clock) -> list[date]:
    if not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol):
        raise DataIntegrityError("invalid quote symbol")
    if type(count) is not int or not 1 <= count <= MAX_HISTORY_BARS:
        raise DataIntegrityError(f"quote history count must be between 1 and {MAX_HISTORY_BARS}")
    if not isinstance(end, date) or isinstance(end, datetime) or not mc.is_session(end):
        raise DataIntegrityError("quote end must be an NYSE session")
    if _observed(clock) < mc.session_times(end)[1]:
        raise DataIntegrityError("cannot use an unclosed or future daily session")
    days = [end]
    for _ in range(count - 1):
        days.append(mc.previous_session(days[-1]))
    return list(reversed(days))


class ReconciliationUnavailable(DataIntegrityError):
    """A sanitized, bounded secondary quote request failure."""

    def __init__(self, category: str):
        self.provider = NASDAQ_PROVIDER
        self.request_category = category if category in {"network", "http", "rate_limit"} else "unknown"
        super().__init__(f"Nasdaq historical quote request failed [{self.request_category}]")


def _public_json(url: str) -> dict:
    # Only a fixed public quote origin is constructed by this module. Redirects
    # are not followed; this client never has brokerage or other credentials.
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, msg, headers, newurl):
            return None

    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with build_opener(NoRedirect).open(request, timeout=12.0) as response:
        content = response.read(2_000_001)
    if len(content) > 2_000_000:
        raise DataIntegrityError("Nasdaq historical response exceeds size limit")
    return json.loads(content)


class NasdaqHistoricalSource:
    """Public Nasdaq historical OHLCV, with explicit query and receipt evidence.

    `basis` describes the provider's published historical table. No split or
    dividend factor is inferred from a ratio, and adjusted-close fields from
    other feeds are never substituted for the table's Close/Last value.
    """

    name = NASDAQ_PROVIDER
    basis = "nasdaq_reported_historical_ohlcv"
    volume_unit = "shares"

    def __init__(self, request_json=None, *, clock=None, sleep=time.sleep, max_retries=1):
        if type(max_retries) is not int or not 0 <= max_retries <= 2:
            raise ValueError("secondary quote retry count must be between 0 and 2")
        self._request_json = request_json or _public_json
        self._clock = clock or _utc_now
        self._sleep = sleep
        self._max_retries = max_retries
        self.last_batch: dict = {}

    def _request(self, symbol: str, start: date, end: date, limit: int) -> tuple[dict, dict]:
        asset_class = "etf" if symbol == BENCHMARK_SYMBOL[0] else "stocks"
        query = {"assetclass": asset_class, "fromdate": start.isoformat(),
                 "todate": end.isoformat(), "limit": str(limit)}
        url = f"{NASDAQ_ORIGIN}/api/quote/{symbol}/historical?{urlencode(query)}"
        started = _observed(self._clock)
        for attempt in range(self._max_retries + 1):
            try:
                payload = self._request_json(url)
                received = _observed(self._clock)
                if received < started:
                    raise DataIntegrityError("quote receipt clock moved backwards")
                if not isinstance(payload, dict):
                    raise DataIntegrityError("Nasdaq historical response must be an object")
                return payload, {"url": url, "query": query, "requested_at": started,
                                 "received_at": received, "response_hash": sha256(payload)}
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                category = "rate_limit" if status == 429 else "http"
                retryable = status == 429 or 500 <= status <= 599
                if not retryable or attempt >= self._max_retries:
                    raise ReconciliationUnavailable(category) from None
            except HTTPError as exc:
                category = "rate_limit" if exc.code == 429 else "http"
                retryable = exc.code == 429 or 500 <= exc.code <= 599
                if not retryable or attempt >= self._max_retries:
                    raise ReconciliationUnavailable(category) from None
            except (httpx.TransportError, URLError, TimeoutError, OSError):
                if attempt >= self._max_retries:
                    raise ReconciliationUnavailable("network") from None
            except (ValueError, TypeError):
                # Do not include response bodies or arbitrary exception text.
                raise DataIntegrityError("Nasdaq historical response is not valid JSON") from None
            self._sleep(1.0 * (2 ** attempt))
        raise AssertionError("unreachable")

    @staticmethod
    def _number(value, *, money=False) -> Decimal:
        if not isinstance(value, (str, int, float, Decimal)) or isinstance(value, bool):
            raise DataIntegrityError("Nasdaq historical numeric field is malformed")
        text = str(value).strip()
        if money and text.startswith("$"):
            text = text[1:]
        if "," in text and not re.fullmatch(r"[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?", text):
            raise DataIntegrityError("Nasdaq historical numeric field is malformed")
        text = text.replace(",", "")
        try:
            return D(text)
        except (LabError, ArithmeticError, ValueError):
            raise DataIntegrityError("Nasdaq historical numeric field is malformed") from None

    def _bars(self, symbol: str, payload: dict, evidence: dict, start: date, end: date) -> dict[date, Bar]:
        status = payload.get("status")
        data = payload.get("data")
        if (not isinstance(status, dict) or status.get("rCode") not in (200, "200")
                or not isinstance(data, dict) or data.get("symbol") != symbol):
            raise DataIntegrityError("Nasdaq historical response status or symbol mismatch")
        table = data.get("tradesTable")
        rows = table.get("rows") if isinstance(table, dict) else None
        if not isinstance(rows, list):
            raise DataIntegrityError("Nasdaq historical response has no price rows")
        bars = {}
        for row in rows:
            if not isinstance(row, dict):
                raise DataIntegrityError("Nasdaq historical row must be an object")
            try:
                trade_date = datetime.strptime(row["date"], "%m/%d/%Y").date()
                prices = tuple(self._number(row[k], money=True) for k in ("open", "high", "low", "close"))
                volume = self._number(row["volume"])
            except (KeyError, TypeError, ValueError):
                raise DataIntegrityError("Nasdaq historical row is malformed") from None
            if not start <= trade_date <= end or not mc.is_session(trade_date):
                raise DataIntegrityError("Nasdaq historical row is outside requested sessions")
            if trade_date in bars:
                raise DataIntegrityError("duplicate Nasdaq historical session")
            if (volume < 0 or volume != volume.to_integral_value()
                    or volume > Decimal("9223372036854775807")):
                raise DataIntegrityError("Nasdaq historical volume must be a nonnegative integer")
            # Test original precision before the canonical four-decimal rounding.
            raw_bar = Bar(symbol, trade_date, *prices, int(volume), self.name)
            raw_bar.check()
            if any(p >= Decimal("10000000000000000") for p in prices):
                raise DataIntegrityError("Nasdaq historical price exceeds storage precision")
            normalized = Bar(
                symbol, trade_date, *(p.quantize(PRICE_Q) for p in prices), int(volume), self.name,
                raw={"provider": self.name, "query_url": evidence["url"],
                     "received_at": evidence["received_at"].isoformat(), "row": dict(row)},
            )
            normalized.check()
            bars[trade_date] = normalized
        return bars

    def daily_bars(self, symbol: str, end: date, count: int) -> list[Bar]:
        self.last_batch = {}
        sessions = _validate_request(symbol, end, count, self._clock)
        payload, evidence = self._request(symbol, sessions[0], end, count)
        bars = self._bars(symbol, payload, evidence, sessions[0], end)
        queries = [evidence]
        if end not in bars:
            # A broad cached response can lag the requested final session. One
            # bounded query for the final two actual sessions can complete it.
            # Overlap must agree exactly; conflicting histories are not blended.
            narrow_start = max(sessions[0], mc.previous_session(end))
            payload, evidence = self._request(symbol, narrow_start, end, 2)
            recent = self._bars(symbol, payload, evidence, narrow_start, end)
            for day, bar in recent.items():
                if day in bars and bars[day] != bar:
                    raise DataIntegrityError("Nasdaq historical queries conflict on an overlapping session")
                bars[day] = bar
            queries.append(evidence)
        if end not in bars:
            raise DataIntegrityError(f"Nasdaq historical missing requested session {end}")
        selected = [bars[day] for day in sorted(bars)][-count:]
        self.last_batch = {"provider": self.name, "basis": self.basis, "volume_unit": self.volume_unit,
                           "observed_at": queries[-1]["received_at"], "queries": queries,
                           "requested_count": count, "received_count": len(selected)}
        return selected


def _primary_issue(exc: DataIntegrityError) -> dict:
    detail = {"code": "primary_data_integrity", "error_class": type(exc).__name__}
    if isinstance(exc, _NHInconsistentOHLC):
        detail.update(code="invalid_ohlc", trade_date=exc.trade_date, ohlc=exc.ohlc)
    elif isinstance(exc, _NHRefetchError):
        detail.update(code="invalid_ohlc", refetch_reason=exc.reason, observations=exc.observations)
    return to_jsonable(detail)


class ReconciledQuoteSource:
    """NH primary quotes with an explicit complete-history secondary path."""

    name = RECONCILED_SOURCE

    def __init__(self, primary=None, secondary=None, *, clock=None):
        self._clock = clock or _utc_now
        self.primary = primary or NHQuoteSource()
        self.secondary = secondary or NasdaqHistoricalSource(clock=self._clock)
        self.last_batch: dict = {}

    def daily_bars(self, symbol: str, end: date, count: int) -> list[Bar]:
        self.last_batch = {}
        _validate_request(symbol, end, count, self._clock)
        started = _observed(self._clock)
        try:
            bars = self.primary.daily_bars(symbol, end, count)
            if not bars or bars[-1].trade_date != end:
                raise DataIntegrityError("primary missing requested final session")
            seen = set()
            for bar in bars:
                bar.check()
                if (bar.symbol != symbol or bar.source != "nh_plug" or bar.trade_date > end
                        or not mc.is_session(bar.trade_date) or bar.trade_date in seen):
                    raise DataIntegrityError("primary quote session or provider mismatch")
                seen.add(bar.trade_date)
        except _NHRequestError:
            raise
        except _NHRefetchError as exc:
            if exc.request_category is not None:
                raise
            issue = {**_primary_issue(exc), "observed_at": _observed(self._clock).isoformat()}
            bars = self.secondary_bars(symbol, end, count, reason="primary_data_integrity")
            self.last_batch["primary_issue"] = issue
            return bars
        except DataIntegrityError as exc:
            issue = {**_primary_issue(exc), "observed_at": _observed(self._clock).isoformat()}
            bars = self.secondary_bars(symbol, end, count, reason="primary_data_integrity")
            self.last_batch["primary_issue"] = issue
            return bars
        received = _observed(self._clock)
        if received < started:
            raise DataIntegrityError("quote receipt clock moved backwards")
        self.last_batch = {
            "provider": "nh_plug", "basis": "nh_reported_regular_session_ohlcv_adjustment_unspecified",
            "volume_unit": "provider_native_unspecified", "observed_at": received,
            "queries": [{"endpoint": NH_PERIOD_PATH, "query": {
                "iem_cd": symbol, "end_dt": end.strftime("%Y%m%d"), "count": str(count),
                "maxavg": "0", "gubun": "3", "xtick": "0001", "today_cls": "0", "market_cls": "1",
            }, "requested_at": started, "received_at": received,
                "response_hash": sha256([bar.raw for bar in bars])}],
            "requested_count": count, "received_count": len(bars),
            "reconciliation_reason": None,
        }
        return bars

    def secondary_bars(self, symbol: str, end: date, count: int,
                       reason: str = "stored_bar_revision") -> list[Bar]:
        self.last_batch = {}
        # The reason is an internal classification, not arbitrary exception text.
        if reason not in {"stored_bar_revision", "primary_data_integrity", "explicit_reconciliation",
                          "retained_verified_provider"}:
            reason = "explicit_reconciliation"
        bars = self.secondary.daily_bars(symbol, end, count)
        self.last_batch = {**self.secondary.last_batch, "reconciliation_reason": reason}
        return bars
