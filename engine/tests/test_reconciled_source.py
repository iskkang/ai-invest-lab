"""Offline provider fixtures: provenance, strict price validation, bounded recovery."""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from ail.common import DataIntegrityError
from ail.reconciled_source import (
    NASDAQ_PROVIDER, RECONCILED_SOURCE, NasdaqHistoricalSource,
    ReconciledQuoteSource, ReconciliationUnavailable,
)
from ail.sources import Bar, _NHInconsistentOHLC, _NHRefetchError, _NHRequestError

END = date(2026, 11, 25)
NOW = datetime(2026, 11, 26, 6, tzinfo=timezone.utc)


def row(day="11/25/2026", **changes):
    return {"date": day, "open": "$100.25", "high": "$102.27", "low": "$99.3003",
            "close": "$101.29", "volume": "12,609,860", **changes}


def response(rows=None, symbol="TEST"):
    return {"status": {"rCode": 200}, "data": {"symbol": symbol,
            "tradesTable": {"rows": rows if rows is not None else [row()]}}}


class Requests:
    def __init__(self, *results):
        self.results = iter(results)
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        result = next(self.results)
        if isinstance(result, Exception):
            raise result
        return deepcopy(result)


def secondary(requests, **kwargs):
    return NasdaqHistoricalSource(request_json=requests, clock=lambda: NOW, sleep=lambda _: None, **kwargs)


def nh_bar(day=END):
    return Bar("TEST", day, Decimal("100.25"), Decimal("102.27"), Decimal("99.3"),
               Decimal("101.29"), 12609, "nh_plug", raw={"trade_date": day.strftime("%Y%m%d")})


class Primary:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def daily_bars(self, symbol, end, count):
        self.calls.append((symbol, end, count))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def invalid_nh():
    raw = tuple(Decimal(x) for x in ("103", "102", "99", "101"))
    return _NHInconsistentOHLC("TEST", END, raw, raw)


def test_nasdaq_preserves_complete_bar_provider_units_and_receipt_evidence():
    requests = Requests(response([row(open="$1,100.1234", high="$1,102.50", low="$1,099.25", close="$1,101.45")]))
    source = secondary(requests)
    bar = source.daily_bars("TEST", END, 1)[0]
    assert bar.open == Decimal("1100.1234")
    assert bar.volume == 12609860 and bar.source == NASDAQ_PROVIDER
    assert bar.raw["row"]["open"] == "$1,100.1234"
    batch = source.last_batch
    assert batch["provider"] == NASDAQ_PROVIDER and batch["volume_unit"] == "shares"
    assert batch["observed_at"] == NOW
    assert len(batch["queries"][0]["response_hash"]) == 64
    query = parse_qs(urlparse(requests.urls[0]).query)
    assert query == {"assetclass": ["stocks"], "fromdate": ["2026-11-25"],
                     "todate": ["2026-11-25"], "limit": ["1"]}


@pytest.mark.parametrize("payload", [
    response(symbol="WRONG"),
    response([row(), row()]),
    response([row(day="11/27/2026")]),
    response([row(day="11/22/2026")]),
    response([row(open="$103")]),
    response([row(open="$102.27003", close="$102.27")]),
    response([row(close="NaN")]),
    response([row(close="Infinity")]),
    response([row(volume="12.5")]),
    response([row(volume="-1")]),
    response([row(open="$10,0.25")]),
    {"status": {"rCode": 400}, "data": None, "message": "private-body"},
])
def test_nasdaq_rejects_bad_symbol_dates_duplicates_and_original_price_precision(payload):
    requests = Requests(payload)
    source = secondary(requests)
    with pytest.raises(DataIntegrityError) as caught:
        source.daily_bars("TEST", END, 1)
    assert "private-body" not in str(caught.value)
    assert source.last_batch == {} and len(requests.urls) == 1


def test_lagged_broad_response_gets_one_bounded_same_provider_tail_query():
    requests = Requests(response([row("11/23/2026")]),
                        response([row("11/25/2026"), row("11/24/2026")]))
    source = secondary(requests)
    bars = source.daily_bars("TEST", END, 3)
    assert [b.trade_date for b in bars] == [date(2026, 11, d) for d in (23, 24, 25)]
    assert {b.source for b in bars} == {NASDAQ_PROVIDER}
    assert len(source.last_batch["queries"]) == 2
    tail = parse_qs(urlparse(requests.urls[-1]).query)
    assert tail["fromdate"] == ["2026-11-24"] and tail["todate"] == ["2026-11-25"]
    assert tail["limit"] == ["2"]


def test_tail_query_must_not_blend_conflicting_observations():
    requests = Requests(response([row("11/24/2026")]),
                        response([row("11/25/2026"), row("11/24/2026", close="$101.30")]))
    with pytest.raises(DataIntegrityError, match="conflict"):
        secondary(requests).daily_bars("TEST", END, 2)
    assert len(requests.urls) == 2


def test_missing_target_never_becomes_an_earlier_session_success():
    requests = Requests(response([row("11/24/2026")]), response([row("11/24/2026")]))
    with pytest.raises(DataIntegrityError, match="missing requested session"):
        secondary(requests).daily_bars("TEST", END, 2)
    assert len(requests.urls) == 2


def test_secondary_retries_transient_requests_with_fixed_limit_only():
    requests = Requests(httpx.ReadTimeout("private-request"), response())
    delays = []
    source = NasdaqHistoricalSource(request_json=requests, clock=lambda: NOW, sleep=delays.append)
    assert len(source.daily_bars("TEST", END, 1)) == 1
    assert len(requests.urls) == 2 and delays == [1.0]
    request = httpx.Request("GET", "https://api.nasdaq.com/")
    denied = httpx.HTTPStatusError("private-body", request=request, response=httpx.Response(403, request=request))
    requests = Requests(denied)
    with pytest.raises(ReconciliationUnavailable) as caught:
        secondary(requests).daily_bars("TEST", END, 1)
    assert len(requests.urls) == 1 and "private-body" not in str(caught.value)


@pytest.mark.parametrize("symbol,end,count", [
    ("../orders", END, 1), ("TEST", date(2026, 11, 26), 1),
    ("TEST", date(2026, 11, 27), 1), ("TEST", END, 0),
    ("TEST", END, 301), ("TEST", END, True),
])
def test_invalid_or_unclosed_request_never_reaches_network(symbol, end, count):
    requests = Requests()
    with pytest.raises(DataIntegrityError):
        secondary(requests).daily_bars(symbol, end, count)
    assert requests.urls == []


def test_reconciled_dataset_keeps_nh_provider_and_unspecified_volume_unit_explicit():
    requests = Requests()
    source = ReconciledQuoteSource(Primary([nh_bar()]), secondary(requests), clock=lambda: NOW)
    bars = source.daily_bars("TEST", END, 1)
    assert source.name == RECONCILED_SOURCE
    assert bars[0].source == "nh_plug" and bars[0].volume == 12609
    assert source.last_batch["provider"] == "nh_plug"
    assert source.last_batch["volume_unit"] == "provider_native_unspecified"
    assert requests.urls == []


def test_invalid_nh_replaces_whole_symbol_history_and_preserves_bad_observation():
    requests = Requests(response([row(), row("11/24/2026")]))
    source = ReconciledQuoteSource(Primary(invalid_nh()), secondary(requests), clock=lambda: NOW)
    bars = source.daily_bars("TEST", END, 2)
    assert len(bars) == 2 and {b.source for b in bars} == {NASDAQ_PROVIDER}
    assert all(b.volume == 12609860 for b in bars)
    assert source.last_batch["reconciliation_reason"] == "primary_data_integrity"
    assert source.last_batch["primary_issue"]["code"] == "invalid_ohlc"
    assert source.last_batch["primary_issue"]["ohlc"]["raw"]["open_prc"] == "103"


@pytest.mark.parametrize("failure", [
    _NHRequestError("auth"),
    _NHRequestError("network"),
    _NHRefetchError(invalid_nh(), "request_failed", request_error=_NHRequestError("network")),
])
def test_nh_request_failures_do_not_turn_into_a_silent_provider_switch(failure):
    requests = Requests()
    source = ReconciledQuoteSource(Primary(failure), secondary(requests), clock=lambda: NOW)
    with pytest.raises(DataIntegrityError) as caught:
        source.daily_bars("TEST", END, 1)
    assert caught.value is failure and requests.urls == [] and source.last_batch == {}


def test_explicit_revision_reconciliation_keeps_actual_new_receipt_time():
    state = {"now": NOW}
    def fetch(url):
        state["now"] += timedelta(seconds=3)
        return response()
    source = ReconciledQuoteSource(
        Primary([nh_bar()]), NasdaqHistoricalSource(request_json=fetch, clock=lambda: state["now"]),
        clock=lambda: state["now"],
    )
    source.secondary_bars("TEST", END, 1)
    assert source.last_batch["observed_at"] == NOW + timedelta(seconds=3)
    assert source.last_batch["reconciliation_reason"] == "stored_bar_revision"


def test_primary_receipt_time_is_after_the_response_not_the_job_start():
    state = {"now": NOW}
    class SlowPrimary:
        def daily_bars(self, *_):
            state["now"] += timedelta(seconds=4)
            return [nh_bar()]
    source = ReconciledQuoteSource(SlowPrimary(), secondary(Requests()), clock=lambda: state["now"])
    source.daily_bars("TEST", END, 1)
    query = source.last_batch["queries"][0]
    assert query["requested_at"] == NOW
    assert query["received_at"] == source.last_batch["observed_at"] == NOW + timedelta(seconds=4)
