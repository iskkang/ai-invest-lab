from contextlib import nullcontext
from copy import deepcopy
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from psycopg import OperationalError
from psycopg.errors import UniqueViolation

from ail import market_calendar as mc, pipeline
from ail.config import BENCHMARK_SYMBOL, DEFAULT_PARTICIPANTS, DEFAULT_UNIVERSE, LIVE_PRICE_SOURCE
from ail.settlement_receipt import EXPECTED_ACCOUNTS, settlement_receipt

SESSION = date(2026, 11, 25)
SETTINGS = SimpleNamespace(experiment_name="receipt-test", mode="live")
SYMBOLS = sorted([row[0] for row in DEFAULT_UNIVERSE] + [BENCHMARK_SYMBOL[0]])


class EvidenceDB:
    """Independent saved evidence; no engine writes or provider calls."""

    def __init__(self):
        self.exp = {"id": 42, "start_session": date(2026, 11, 16)}
        self.prices = {symbol: Decimal("100.0000") for symbol in SYMBOLS}
        self.pending = 0
        identities = [("ai", p["id"], None) for p in DEFAULT_PARTICIPANTS]
        identities += [("benchmark", None, code) for code in ("SPY_BUY_HOLD", "EQUAL_WEIGHT", "CASH")]
        self.rows = [dict(id=i, kind=kind, ai_model_id=ai, benchmark_code=benchmark,
                          snapshot_account_id=i, cash=Decimal("100000"), holdings_value=Decimal(0),
                          equity=Decimal("100000"), holdings=[], stale_marks=[])
                     for i, (kind, ai, benchmark) in enumerate(identities, 1)]
        self.ledger = [dict(account_id=row["id"], symbol="", cash=Decimal("100000"), quantity=0)
                       for row in self.rows]

    def add_holding(self, index, symbol="AAPL"):
        row = self.rows[index]
        row.update(cash=Decimal("99000"), holdings_value=Decimal("1000"),
                   holdings=[dict(symbol=symbol, quantity=10, close="100", market_value="1000")])
        self.ledger.append(dict(account_id=row["id"], symbol=symbol, cash=Decimal("-1000"), quantity=10))

    def execute(self, sql, params=()):
        if "from experiments" in sql:
            assert params == (SETTINGS.experiment_name, "live")
            return SimpleNamespace(fetchone=lambda: self.exp)
        if "from stock_universe" in sql:
            return SimpleNamespace(fetchall=lambda: [{"symbol": symbol} for symbol in SYMBOLS])
        if "select distinct h.symbol" in sql or "from universe_change_requests" in sql:
            assert params == (42,)
            return SimpleNamespace(fetchall=lambda: [])
        if "left join portfolio_snapshots" in sql:
            assert "left join benchmark_snapshots" in sql
            assert params == (SESSION, 42, SESSION, 42)
            return SimpleNamespace(fetchall=lambda: deepcopy(self.rows))
        if "from stock_prices" in sql:
            assert params == (LIVE_PRICE_SOURCE, SESSION, SYMBOLS)
            return SimpleNamespace(fetchall=lambda: [{"symbol": symbol, "close": close}
                                                     for symbol, close in self.prices.items()])
        if "from orders o" in sql:
            assert "o.session_date<=%s" in sql and params == (42, SESSION)
            return SimpleNamespace(fetchone=lambda: {"n": self.pending})
        if "from ledger_entries l" in sql:
            assert "l.effective_date<=%s" in sql and params == (42, SESSION)
            return SimpleNamespace(fetchall=lambda: deepcopy(self.ledger))
        raise AssertionError(f"unexpected query: {sql}")


def test_receipt_requires_exact_session_prices_and_all_account_valuations():
    db = EvidenceDB()
    db.add_holding(0)
    db.add_holding(4, "SPY")
    result = settlement_receipt(db, SETTINGS, SESSION)
    assert result["verified"]
    assert result["phase"] == "settlement"
    assert result["price_count"] == result["expected_price_count"] == len(SYMBOLS) == 31
    assert result["valuation_count"] == result["expected_valuation_count"] == len(EXPECTED_ACCOUNTS) == 7


def test_receipt_missing_unheld_symbol_still_fails():
    db = EvidenceDB()
    del db.prices["COST"]
    result = settlement_receipt(db, SETTINGS, SESSION)
    assert not result["verified"] and result["missing_price_symbols"] == ["COST"]


@pytest.mark.parametrize("index", [0, 4, 6])
def test_receipt_missing_ai_or_benchmark_valuation_fails(index):
    db = EvidenceDB()
    row = db.rows[index]
    row.update(snapshot_account_id=None, holdings=None, cash=None, equity=None, holdings_value=None)
    result = settlement_receipt(db, SETTINGS, SESSION)
    assert not result["verified"] and result["valuation_count"] == 6
    assert result["missing_accounts"] == [f"{row['kind']}:{row['ai_model_id'] or row['benchmark_code']}"]


def test_receipt_account_identity_and_pending_order_checks():
    missing = EvidenceDB()
    missing.rows.pop()
    assert not settlement_receipt(missing, SETTINGS, SESSION)["verified"]
    wrong = EvidenceDB()
    wrong.rows[0]["ai_model_id"] = "unrelated-model"
    result = settlement_receipt(wrong, SETTINGS, SESSION)
    assert not result["verified"] and result["invalid_accounts"] == ["ai:unrelated-model"]
    pending = EvidenceDB()
    pending.pending = 1
    result = settlement_receipt(pending, SETTINGS, SESSION)
    assert not result["verified"] and result["pending_orders"] == 1


@pytest.mark.parametrize("index", [0, 4])
def test_receipt_requires_exact_marks_for_ai_and_benchmark(index):
    db = EvidenceDB()
    db.add_holding(index)
    db.rows[index]["holdings"][0]["close"] = "99"
    result = settlement_receipt(db, SETTINGS, SESSION)
    assert not result["verified"] and result["valuation_count"] == 6


def test_receipt_rejects_stale_marks_wrong_cash_or_wrong_quantity():
    stale = EvidenceDB()
    stale.rows[0]["stale_marks"] = ["AAPL"]
    wrong_cash = EvidenceDB()
    wrong_cash.rows[0].update(cash=Decimal("100001"), equity=Decimal("100001"))
    wrong_qty = EvidenceDB()
    wrong_qty.add_holding(0)
    wrong_qty.ledger[-1]["quantity"] = 9
    for db in (stale, wrong_cash, wrong_qty):
        result = settlement_receipt(db, SETTINGS, SESSION)
        assert not result["verified"] and result["valuation_count"] == 6


def test_pre_start_receipt_verifies_ingestion_without_claiming_valuations():
    db = EvidenceDB()
    db.exp["start_session"] = date(2026, 11, 27)
    for row in db.rows:
        row.update(snapshot_account_id=None, holdings=None, cash=None, equity=None, holdings_value=None)
    result = settlement_receipt(db, SETTINGS, SESSION)
    assert result["verified"] and result["phase"] == "pre_start_ingestion"
    assert result["expected_valuation_count"] == result["valuation_count"] == 0
    del db.prices["COST"]
    assert not settlement_receipt(db, SETTINGS, SESSION)["verified"]


@pytest.mark.parametrize("target, now", [
    ("2026-02-30", mc.ny_time(date(2026, 11, 26), "00:05")),
    ("20261125", mc.ny_time(date(2026, 11, 26), "00:05")),
    ("2026-W48-3", mc.ny_time(date(2026, 11, 26), "00:05")),
    ("2026-11-25 ", mc.ny_time(date(2026, 11, 26), "00:05")),
    ("2026-11-27", mc.ny_time(date(2026, 11, 26), "00:05")),
    ("2026-11-26", mc.ny_time(date(2026, 11, 26), "00:05")),
    ("2026-11-25", mc.ny_time(SESSION, "16:59")),
    ("2026-11-27", mc.ny_time(date(2026, 11, 27), "13:59")),
])
def test_explicit_invalid_future_holiday_or_unclosed_session_rejected_before_db(target, now):
    with pytest.raises(pipeline.InvalidSettlementSession):
        pipeline.run_settle(object(), SETTINGS, object(), now, expected_session=target)


def test_default_holiday_or_unclosed_session_still_skips_without_db():
    assert pipeline.run_settle(object(), SETTINGS, object(), mc.ny_time(date(2026, 11, 26), "17:30"))["status"] == "skipped"
    assert pipeline.run_settle(object(), SETTINGS, object(), mc.ny_time(SESSION, "16:59"))["status"] == "skipped"


@pytest.mark.parametrize("target, now", [
    (SESSION, mc.ny_time(date(2026, 11, 26), "00:05")),
    (date(2026, 11, 27), mc.ny_time(date(2026, 11, 27), "14:00")),
])
def test_explicit_closed_session_uses_actual_now_and_target_job_key(monkeypatch, target, now):
    seen = {}
    monkeypatch.setattr(pipeline, "advisory_lock", lambda *a: nullcontext())
    monkeypatch.setattr(pipeline, "bootstrap", lambda *a: {"id": 42})
    def settle(conn, exp, source, through, actual, settings):
        seen.update(target=through, now=actual)
        return {"settled": []}
    def job(conn, name, key, fn):
        seen.update(name=name, key=key)
        result = fn()
        return {"status": result.pop("_status"), **result}
    monkeypatch.setattr(pipeline, "settle_through", settle)
    monkeypatch.setattr(pipeline, "_job", job)
    monkeypatch.setattr(pipeline, "settlement_receipt", lambda *a: {"verified": True})
    result = pipeline.run_settle(object(), SETTINGS, object(), now, expected_session=target.isoformat())
    assert result["status"] == "succeeded"
    assert seen == {"target": target, "now": now, "name": "post_close_settle", "key": target.isoformat()}


def test_duplicate_settlement_rechecks_evidence(monkeypatch):
    monkeypatch.setattr(pipeline, "advisory_lock", lambda *a: nullcontext())
    monkeypatch.setattr(pipeline, "bootstrap", lambda *a: {"id": 42})
    monkeypatch.setattr(pipeline, "_job", lambda *a: {"status": "duplicate"})
    monkeypatch.setattr(pipeline, "settlement_receipt", lambda *a: {"verified": False})
    result = pipeline.run_settle(object(), SETTINGS, object(), mc.ny_time(SESSION, "17:30"))
    assert result["status"] == "duplicate" and not result["settlement_receipt"]["verified"]


def test_job_only_treats_unique_violation_as_duplicate():
    def broken(error):
        def execute(*args):
            raise error
        return SimpleNamespace(execute=execute)
    assert pipeline._job(broken(UniqueViolation()), "test", "key", lambda: None)["status"] == "duplicate"
    with pytest.raises(OperationalError):
        pipeline._job(broken(OperationalError("database unavailable")), "test", "key", lambda: None)


def test_db_midnight_recovery_and_verified_duplicate_are_idempotent(db, settings, source):
    now = mc.ny_time(date(2026, 11, 26), "00:05")
    result = pipeline.run_settle(db, settings, source, now, expected_session=SESSION.isoformat())
    receipt = result["settlement_receipt"]
    assert result["status"] == "succeeded" and receipt["verified"]
    assert receipt["price_count"] == 31 and receipt["valuation_count"] == 7
    assert db.execute("select count(*) as n from ai_decisions").fetchone()["n"] == 0
    assert db.execute("select distinct fetched_at from stock_prices where trade_date=%s", (SESSION,)).fetchone()["fetched_at"] == now
    tables = ("trades", "ledger_entries", "portfolio_snapshots", "benchmark_snapshots", "stock_prices")
    before = {table: db.execute(f"select count(*) as n from {table}").fetchone()["n"] for table in tables}
    again = pipeline.run_settle(db, settings, source, mc.ny_time(date(2026, 11, 26), "00:06"),
                                expected_session=SESSION.isoformat())
    assert again["status"] == "duplicate" and again["settlement_receipt"]["verified"]
    assert before == {table: db.execute(f"select count(*) as n from {table}").fetchone()["n"] for table in tables}


def test_db_duplicate_job_without_benchmark_valuation_is_not_verified(db, settings, source):
    now = mc.ny_time(SESSION, "17:30")
    assert pipeline.run_settle(db, settings, source, now)["settlement_receipt"]["verified"]
    db.execute("delete from benchmark_snapshots where session_date=%s and benchmark_code='CASH'", (SESSION,))
    result = pipeline.run_settle(db, settings, source, now)
    assert result["status"] == "duplicate" and not result["settlement_receipt"]["verified"]
    assert result["settlement_receipt"]["missing_accounts"] == ["benchmark:CASH"]
