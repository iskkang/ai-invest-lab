"""Real PostgreSQL tests: report all known failures without committing partial data."""
from datetime import date, datetime, timezone
from decimal import Decimal

import psycopg
import pytest

from ail.common import DataIntegrityError
from ail.config import DEFAULT_UNIVERSE
from ail.market_data import IngestionBlocked, _store, ingest
from ail.sources import Bar

THROUGH = date(2026, 11, 25)
OBSERVED = datetime(2026, 11, 26, 5, tzinfo=timezone.utc)
STORED_AT = datetime(2026, 11, 21, 3, 41, tzinfo=timezone.utc)


def bar(symbol, day=THROUGH, open_="100", high="102", low="99", close="101", volume=1000):
    return Bar(symbol, day, *(Decimal(v) for v in (open_, high, low, close)), volume, "nh_plug")


class Source:
    name = "nh_plug"

    def __init__(self, failures=None):
        self.failures, self.calls = failures or {}, []

    def daily_bars(self, symbol, through, count):
        self.calls.append(symbol)
        outcome = self.failures.get(symbol, [bar(symbol, through)])
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def prices(db):
    return db.execute("select * from stock_prices order by symbol,trade_date,source").fetchall()


def test_revision_and_invalid_source_reported_together_and_all_inserts_rolled_back(db):
    original = bar("COST", date(2026, 11, 16), "1111.18", "1117", "1104.886", "1113.74", 3059)
    _store(db, "COST", "nh_plug", [original], STORED_AT, {"inserted": 0})
    before = prices(db)
    revised = bar("COST", original.trade_date, "1080.8170", "1086.4780", "1074.6950", "1083.3071", 3059)
    source = Source({"COST": [revised], "MRK": DataIntegrityError("MRK: inconsistent OHLC")})
    symbols = sorted([s[0] for s in DEFAULT_UNIVERSE] + ["SPY"])

    # No caller transaction: ingest must enforce atomicity by itself.
    with pytest.raises(IngestionBlocked) as caught:
        ingest(db, source, symbols, THROUGH, OBSERVED, 300)

    assert source.calls == symbols and len(source.calls) == 31
    assert prices(db) == before
    detail = caught.value.detail
    assert detail["committed_bars"] == 0 and detail["symbols_checked"] == 31
    assert len(detail["issues"]) == 2
    issues = {issue["symbol"]: issue for issue in detail["issues"]}
    cost = issues["COST"]
    assert cost["code"] == "stored_bar_revision"
    assert cost["changed_fields"] == ["open", "high", "low", "close"]
    assert Decimal(cost["stored"]["open"]) == original.open
    assert Decimal(cost["observed"]["open"]) == revised.open
    assert cost["stored"]["volume"] == cost["observed"]["volume"] == 3059
    assert cost["stored_fetched_at"] == STORED_AT.isoformat()
    assert issues["MRK"]["code"] == "invalid_ohlc"


def test_missing_final_bar_rolls_back_other_symbols_and_reports_each_missing_symbol(db):
    source = Source({"MISSING": [], "OLD": [bar("OLD", date(2026, 11, 24))]})
    with pytest.raises(IngestionBlocked, match="missing bars") as caught:
        ingest(db, source, ["GOOD", "MISSING", "OLD"], THROUGH, OBSERVED, 300)
    assert source.calls == ["GOOD", "MISSING", "OLD"]
    assert prices(db) == []
    assert {i["symbol"] for i in caught.value.detail["issues"]} == {"MISSING", "OLD"}
    assert all(i["code"] == "missing_bar" for i in caught.value.detail["issues"])


def test_valid_batch_commits_and_repeat_does_not_change_canonical_rows(db):
    source = Source()
    assert ingest(db, source, ["AAPL", "SPY"], THROUGH, OBSERVED, 300)["inserted"] == 2
    before = prices(db)
    assert ingest(db, source, ["AAPL", "SPY"], THROUGH, OBSERVED, 300)["inserted"] == 0
    assert prices(db) == before and source.calls == ["AAPL", "SPY"]


def test_unexpected_database_exception_propagates_without_becoming_a_source_issue(db, monkeypatch):
    from ail import market_data
    real_store = market_data._store
    failure = psycopg.OperationalError("database failure")

    def store(conn, symbol, *args):
        if symbol == "DBERROR":
            raise failure
        return real_store(conn, symbol, *args)

    monkeypatch.setattr(market_data, "_store", store)
    with pytest.raises(psycopg.OperationalError) as caught:
        ingest(db, Source(), ["GOOD", "DBERROR"], THROUGH, OBSERVED, 300)
    assert caught.value is failure and prices(db) == []


def test_unknown_source_error_body_is_not_logged(db):
    source = Source({"BAD": DataIntegrityError("private-response-body-must-not-be-logged")})
    with pytest.raises(IngestionBlocked) as caught:
        ingest(db, source, ["BAD"], THROUGH, OBSERVED, 300)
    assert "private-response" not in str(caught.value) + str(caught.value.detail)
    assert caught.value.detail["issues"][0]["code"] == "source_integrity_error"


def test_failed_job_retains_all_findings_after_price_transaction_rolls_back(db):
    from ail.pipeline import _job

    source = Source({"BAD": DataIntegrityError("BAD: inconsistent OHLC")})
    with pytest.raises(IngestionBlocked) as caught:
        _job(db, "post_close_settle", THROUGH.isoformat(),
             lambda: ingest(db, source, ["GOOD", "BAD"], THROUGH, OBSERVED, 300))
    job = db.execute("select status,detail from job_runs").fetchone()
    assert job["status"] == "failed" and prices(db) == []
    assert job["detail"]["market_data"] == caught.value.detail
