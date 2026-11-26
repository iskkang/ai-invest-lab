"""Real database recovery: complete histories evolve while economic records freeze."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from ail import admin, portfolio
from ail.common import sha256
from ail.config import LIVE_PRICE_SOURCE
from ail.market_data import (
    IngestionBlocked, _store, adjusted_history, build_market_payload, ingest, store_snapshot,
)
from ail.pipeline import bootstrap
from ail.reconciled_source import NasdaqHistoricalSource, ReconciledQuoteSource
from ail.sources import Bar, NHQuoteSource, _NHInconsistentOHLC

FIRST = date(2026, 11, 24)
SECOND = date(2026, 11, 25)
FIRST_AT = datetime(2026, 11, 25, 5, tzinfo=timezone.utc)
SECOND_AT = datetime(2026, 11, 26, 5, tzinfo=timezone.utc)
STORED_AT = datetime(2026, 11, 24, 5, tzinfo=timezone.utc)
FIRST_DAYS = [date(2026, 11, d) for d in (20, 23, 24)]
SECOND_DAYS = [date(2026, 11, d) for d in (23, 24, 25)]


def bar(symbol, day, provider="nh_plug", *, open_="100", close="101", volume=1000):
    return Bar(symbol, day, Decimal(open_), Decimal("105"), Decimal("85"),
               Decimal(close), volume, provider, raw={"observed_fixture": True})


def history(symbol, days=FIRST_DAYS, provider="nh_plug", **kwargs):
    return [bar(symbol, day, provider, **kwargs) for day in days]


def nasdaq_payload(symbol, bars):
    return {"status": {"rCode": 200}, "data": {"symbol": symbol, "tradesTable": {"rows": [
        {"date": b.trade_date.strftime("%m/%d/%Y"), "open": str(b.open), "high": str(b.high),
         "low": str(b.low), "close": str(b.close), "volume": str(b.volume)} for b in bars
    ]}}}


class Primary:
    name = "nh_plug"

    def __init__(self, outcomes):
        self.outcomes = outcomes
        self.calls = []

    def daily_bars(self, symbol, through, count):
        self.calls.append((symbol, through, count))
        result = self.outcomes[symbol]
        if isinstance(result, Exception):
            raise result
        return result


def source(primary, secondary_payloads, at):
    responses = iter(secondary_payloads)
    requests = []

    def request(url):
        requests.append(url)
        return next(responses)

    result = ReconciledQuoteSource(
        primary=primary,
        secondary=NasdaqHistoricalSource(request_json=request, clock=lambda: at, max_retries=0),
        clock=lambda: at,
    )
    result.test_requests = requests
    return result


def seed(db, symbol="COST"):
    original = bar(symbol, date(2026, 11, 23))
    _store(db, symbol, LIVE_PRICE_SOURCE, [original], STORED_AT, {"inserted": 0})
    return db.execute("select * from stock_prices where symbol=%s and source=%s",
                      (symbol, LIVE_PRICE_SOURCE)).fetchone()


def canonical(db, symbol="COST"):
    return db.execute("select * from stock_prices where symbol=%s and source=%s order by trade_date",
                      (symbol, LIVE_PRICE_SOURCE)).fetchall()


def test_nh_revision_selects_one_complete_alternate_history_and_preserves_old_canonical(db):
    before = seed(db)
    reported = history("COST", open_="90", close="91")
    alternate = history("COST", provider="nasdaq_historical", volume=1_000_000)
    primary = Primary({"COST": reported})
    quotes = source(primary, [nasdaq_payload("COST", alternate)], FIRST_AT)

    report = ingest(db, quotes, ["COST"], FIRST, FIRST_AT - timedelta(minutes=1), 3)

    assert primary.calls == [("COST", FIRST, 3)] and len(quotes.test_requests) == 1
    assert report["providers"] == {"COST": "nasdaq_historical"}
    stored = canonical(db)
    assert next(row for row in stored if row["trade_date"] == before["trade_date"]) == before
    new = [row for row in stored if row["trade_date"] != before["trade_date"]]
    assert len(new) == 2 and all(row["provider"] == "nasdaq_historical" for row in new)
    assert all(row["fetched_at"] == FIRST_AT and row["volume"] == 1_000_000 for row in new)
    assert adjusted_history(db, "COST", LIVE_PRICE_SOURCE, FIRST, FIRST_AT - timedelta(microseconds=1)) == []
    analytical = adjusted_history(db, "COST", LIVE_PRICE_SOURCE, FIRST, FIRST_AT)
    assert [row["date"] for row in analytical] == FIRST_DAYS
    assert [row["volume"] for row in analytical] == [1_000_000] * 3
    assert all(row["close"] == 101 for row in analytical)
    batch = db.execute("select * from price_history_batches where dataset=%s", (LIVE_PRICE_SOURCE,)).fetchone()
    assert batch["provider"] == "nasdaq_historical" and batch["volume_unit"] == "shares"
    assert batch["evidence"]["reconciliation_reason"] == "stored_bar_revision"


def test_next_day_retains_verified_provider_and_revisions_do_not_mutate_old_snapshots(db):
    seed(db)
    initial = source(Primary({"COST": history("COST", close="91")}), [nasdaq_payload(
        "COST", history("COST", provider="nasdaq_historical", volume=1_000_000))], FIRST_AT)
    ingest(db, initial, ["COST"], FIRST, FIRST_AT, 3)
    db.execute("insert into stock_universe(symbol,name,role) values ('COST','Costco','investable')")
    market = build_market_payload(db, LIVE_PRICE_SOURCE, FIRST, FIRST_AT)
    snapshot_id, snapshot_hash = store_snapshot(db, market, FIRST, FIRST_AT)
    before = canonical(db)

    primary = Primary({"COST": AssertionError("retained provider must not query NH again")})
    revised = history("COST", SECOND_DAYS, "nasdaq_historical", open_="100.50", close="102", volume=1_100_000)
    later = source(primary, [nasdaq_payload("COST", revised)], SECOND_AT)
    report = ingest(db, later, ["COST"], SECOND, SECOND_AT, 3)

    assert primary.calls == [] and len(later.test_requests) == 1
    assert report["canonical_revisions"] >= 2
    current = canonical(db)
    assert [row for row in current if row["trade_date"] <= FIRST] == before
    assert current[-1]["provider"] == "nasdaq_historical" and current[-1]["trade_date"] == SECOND
    assert db.execute("select count(*) as n from price_history_batches where dataset=%s",
                      (LIVE_PRICE_SOURCE,)).fetchone()["n"] == 2
    old = adjusted_history(db, "COST", LIVE_PRICE_SOURCE, FIRST, FIRST_AT)
    revised_history = adjusted_history(db, "COST", LIVE_PRICE_SOURCE, FIRST, SECOND_AT)
    assert old[-1]["close"] == 101 and revised_history[-1]["close"] == 102
    assert [row["volume"] for row in revised_history] == [1_100_000] * 2
    frozen = db.execute("select payload,snapshot_hash from market_snapshots where id=%s", (snapshot_id,)).fetchone()
    assert frozen["payload"] == market and frozen["snapshot_hash"] == snapshot_hash == sha256(market)


def test_actual_invalid_mrk_shape_recovers_from_complete_coherent_secondary_history(db):
    primary_rows = [
        {"trade_date": d.strftime("%Y%m%d"), "open_prc": "140", "high": "143", "low": "138",
         "close_prc": "141", "movolume": "12609"} for d in SECOND_DAYS
    ]
    primary_rows[-1].update(open_prc="142.49", high="142.27", low="138.3003", close_prc="140.29")
    primary = NHQuoteSource(call=lambda *_: {"Output_1": primary_rows}, sleep=lambda _: None)
    alternate = [Bar("MRK", d, Decimal("142.24"), Decimal("142.27"), Decimal("138.3003"),
                     Decimal("140.29"), 12_609_860, "nasdaq_historical") for d in SECOND_DAYS]
    quotes = source(primary, [nasdaq_payload("MRK", alternate)], SECOND_AT)

    ingest(db, quotes, ["MRK"], SECOND, SECOND_AT, 3)

    stored = canonical(db, "MRK")
    assert len(stored) == 3
    assert all(row["open"] == Decimal("142.2400") and row["high"] == Decimal("142.2700") for row in stored)
    assert all(row["provider"] == "nasdaq_historical" for row in stored)
    evidence = db.execute("select evidence from price_history_batches where dataset=%s",
                          (LIVE_PRICE_SOURCE,)).fetchone()["evidence"]
    issue = evidence["primary_issue"]
    assert issue["code"] == "invalid_ohlc" and len(issue["observations"]) == 2
    assert all(item["ohlc"]["raw"]["open_prc"] == "142.49" for item in issue["observations"])
    assert db.execute("select count(*) as n from trades").fetchone()["n"] == 0


def test_bad_secondary_rolls_back_other_symbol_prices_and_batches_without_financial_writes(db):
    original = seed(db)
    raw = tuple(Decimal(v) for v in ("142.49", "142.27", "138.3003", "140.29"))
    primary = Primary({"GOOD": history("GOOD", SECOND_DAYS),
                       "MRK": _NHInconsistentOHLC("MRK", SECOND, raw, raw)})
    broken = nasdaq_payload("MRK", history("MRK", SECOND_DAYS, "nasdaq_historical"))
    broken["data"]["tradesTable"]["rows"][-1]["open"] = "106"
    quotes = source(primary, [broken], SECOND_AT)
    before_financial = {table: db.execute(f"select count(*) as n from {table}").fetchone()["n"]
                        for table in ("trades", "orders", "ledger_entries", "portfolio_snapshots", "benchmark_snapshots")}

    with pytest.raises(IngestionBlocked) as caught:
        ingest(db, quotes, ["GOOD", "MRK"], SECOND, SECOND_AT, 3)

    assert caught.value.detail["committed_bars"] == 0
    assert db.execute("select * from stock_prices").fetchall() == [original]
    assert db.execute("select count(*) as n from price_history_batches").fetchone()["n"] == 0
    for table, count in before_financial.items():
        assert db.execute(f"select count(*) as n from {table}").fetchone()["n"] == count


def test_revised_analytical_open_does_not_rewrite_an_existing_fill_reference(db, settings):
    settings.mode = "live"
    settings.start_session = "2026-11-23"
    exp = bootstrap(db, settings)
    original = seed(db)
    aid = db.execute("select id from portfolio_accounts where experiment_id=%s and ai_model_id='gpt'",
                     (exp["id"],)).fetchone()["id"]
    with db.transaction():
        db.execute("insert into orders(round_id,account_id,session_date,symbol,side,quantity)"
                   " values (null,%s,%s,'COST','BUY',1)", (aid, date(2026, 11, 23)))
        assert portfolio.settle_session(db, exp, date(2026, 11, 23), LIVE_PRICE_SOURCE)["filled"] == 1
        portfolio.value_session(db, exp, date(2026, 11, 23), LIVE_PRICE_SOURCE)
    trade_before = db.execute("select * from trades").fetchone()
    marks_before = db.execute("select * from portfolio_snapshots order by account_id").fetchall()
    assert trade_before["ref_open_price"] == original["open"] == Decimal("100")

    alternate = history("COST", provider="nasdaq_historical", open_="99.50", close="100.50", volume=1_000_000)
    quotes = source(Primary({"COST": history("COST", open_="90", close="91")}),
                    [nasdaq_payload("COST", alternate)], FIRST_AT)
    report = ingest(db, quotes, ["COST"], FIRST, FIRST_AT, 3)

    assert report["canonical_revisions"] >= 1
    assert db.execute("select * from trades").fetchone() == trade_before
    assert db.execute("select * from portfolio_snapshots order by account_id").fetchall() == marks_before
    assert next(row for row in canonical(db) if row["trade_date"] == original["trade_date"]) == original
    revised_history = adjusted_history(db, "COST", LIVE_PRICE_SOURCE, FIRST, FIRST_AT)
    assert next(row for row in revised_history if row["date"] == original["trade_date"])["open"] == 99.5
    assert admin.verify(db, settings.experiment_name, LIVE_PRICE_SOURCE) == []
