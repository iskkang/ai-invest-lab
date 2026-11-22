"""PostgreSQL dry run of schedule -> official round -> Journal rows -> benchmark rebalance."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from ail import admin, market_calendar as mc
from ail.common import D
from ail.decision import InvalidDecision, validate
from ail.pipeline import bootstrap, run_daily, run_settle
from conftest import START, ScriptedProvider, at, hold_all, orders_json

NEXT = mc.next_session(START)


def _count(conn, sql, *values):
    return conn.execute(sql, values).fetchone()["n"]


def test_schedule_publishes_before_effect_and_rebalances_on_valid_round(db, settings, source):
    bootstrap(db, settings)
    buys = ScriptedProvider({
        "gpt": lambda p: orders_json(p, [("AAPL", "BUY", 1)]),
        "claude": hold_all, "gemini": hold_all, "deepseek": hold_all,
    })
    assert run_daily(db, settings, source, buys, at(START, "08:30"))["round"]["status"] == "decided"
    run_settle(db, settings, source, at(START, "17:30"))
    exp = db.execute("select * from experiments").fetchone()
    gpt = db.execute("select id from portfolio_accounts where ai_model_id='gpt'").fetchone()["id"]
    benchmark = db.execute(
        "select id from portfolio_accounts where benchmark_code='EQUAL_WEIGHT'"
    ).fetchone()["id"]
    assert _count(db, "select count(*) as n from holdings where account_id=%s and symbol='AAPL'", gpt) == 1

    removal = admin.universe_remove(
        db, "AAPL", "operator", "Constituent replacement", settings.experiment_name, at(START, "18:05")
    )
    addition = admin.universe_add(
        db, "ZZZZ", "Test Substitute", "Information Technology", "operator",
        "Constituent replacement", settings.experiment_name, at(START, "18:06")
    )
    assert removal["effective_session"] == NEXT
    assert addition["effective_session"] == NEXT
    assert _count(db, "select count(*) as n from stock_universe where symbol='AAPL' and removed_at is null") == 1
    assert _count(db, "select count(*) as n from stock_universe where symbol='ZZZZ' and removed_at is null") == 0
    # The Journal's public projection requires no unpublished round.
    journal = db.execute(
        "select action,symbol,reason,scheduled_at,effective_session,status"
        " from universe_change_requests where experiment_id=%s order by id",
        (exp["id"],),
    ).fetchall()
    assert len(journal) == 2
    assert {x["action"] for x in journal} == {"add", "remove"}
    assert all(x["status"] == "scheduled" and x["scheduled_at"] and x["reason"] for x in journal)

    wait = ScriptedProvider({k: hold_all for k in ("gpt", "claude", "gemini", "deepseek")})
    result = run_daily(db, settings, source, wait, at(NEXT, "08:30"))
    assert result["round"]["status"] == "decided"
    market = wait.calls[0][1]["market"]
    symbols = {row["symbol"] for row in market["investable"]}
    assert "ZZZZ" in symbols and "AAPL" not in symbols
    assert "AAPL" in {h["symbol"] for h in wait.calls[0][1]["account"]["holdings"]}
    assert _count(db, "select count(*) as n from universe_change_requests where status='applied'") == 2
    assert _count(db, "select count(*) as n from stock_universe where symbol='AAPL' and removed_at is null") == 0
    assert _count(db, "select count(*) as n from stock_universe where symbol='ZZZZ' and removed_at is null") == 1
    assert all(row["applied_round_id"] == result["round"]["round_id"] for row in db.execute(
        "select applied_round_id from universe_change_requests"
    ).fetchall())
    run_settle(db, settings, source, at(NEXT, "17:30"))
    # AI holdings are not force-sold; their price and valuation continue.
    assert _count(db, "select count(*) as n from holdings where account_id=%s and symbol='AAPL'", gpt) == 1
    valuation = db.execute("select holdings from portfolio_snapshots where account_id=%s and session_date=%s",
                           (gpt, NEXT)).fetchone()["holdings"]
    assert any(h["symbol"] == "AAPL" and Decimal(str(h["market_value"])) > 0 for h in valuation)
    assert _count(db, "select count(*) as n from trades where account_id=%s and trade_date=%s", gpt, NEXT) == 0
    # Equal-weight benchmark responds; SPY and cash benchmarks do not rebalance.
    assert _count(db, "select count(*) as n from universe_rebalance_runs where session_date=%s", NEXT) == 1
    holdings = {r["symbol"] for r in db.execute("select symbol from holdings where account_id=%s", (benchmark,)).fetchall()}
    assert "AAPL" not in holdings and "ZZZZ" in holdings
    assert _count(db, "select count(*) as n from orders where account_id=%s and session_date=%s", benchmark, NEXT) > 0
    for bench in ("SPY_BUY_HOLD", "CASH"):
        assert _count(db, "select count(*) as n from orders o join portfolio_accounts a on a.id=o.account_id"
                      " where a.benchmark_code=%s and o.session_date=%s", bench, NEXT) == 0
    assert not admin.verify(db, settings.experiment_name, "demo")
    # Idempotency: no second rebalance or journal duplication.
    run_settle(db, settings, source, at(NEXT, "18:30"))
    assert _count(db, "select count(*) as n from universe_rebalance_runs") == 1


def test_aborted_round_does_not_apply_scheduled_universe(db, settings, source):
    bootstrap(db, settings)
    exp = db.execute("select * from experiments").fetchone()
    change = admin.universe_remove(
        db, "AAPL", "operator", "Dry-run scheduled removal",
        settings.experiment_name, at(mc.previous_session(START), "18:00"),
    )
    assert change["effective_session"] == START
    broken = ScriptedProvider({"claude": lambda _p: "invalid JSON"})
    result = run_daily(db, settings, source, broken, at(START, "08:30"))
    assert result["round"]["status"] == "aborted"
    assert _count(db, "select count(*) as n from universe_change_requests where status='scheduled'") == 1
    assert _count(db, "select count(*) as n from stock_universe where symbol='AAPL' and removed_at is null") == 1
    # The next valid official session consumes the still-pending queue.
    run_settle(db, settings, source, at(START, "17:30"))
    good = ScriptedProvider({k: hold_all for k in ("gpt", "claude", "gemini", "deepseek")})
    next_result = run_daily(db, settings, source, good, at(NEXT, "08:30"))
    assert next_result["round"]["status"] == "decided"
    assert _count(db, "select count(*) as n from universe_change_requests where status='applied'") == 1
    assert _count(db, "select count(*) as n from stock_universe where symbol='AAPL' and removed_at is null") == 0


def test_removed_holding_can_be_sold_but_never_rebought():
    from ail.decision import validate
    import json
    context = {
        "participant_id": "gpt", "data_as_of": "2026-11-20",
        "investable": {"MSFT": Decimal("200")}, "marks": {"AAPL": Decimal("100")},
        "holdings": {"AAPL": 5}, "cash": Decimal("1000"),
        "max_weight": Decimal("0.20"), "fee_bps": Decimal("0"), "slippage_bps": Decimal("0"),
    }
    def document(action):
        return json.dumps({
            "participant_id": "gpt", "decision_at": "test", "data_as_of": "2026-11-20",
            "summary": "test", "actions": [{
                "symbol": "AAPL", "action": action, "quantity": 1, "reason": "test",
                "risks": [], "indicators_used": [], "expected_return_pct": None, "confidence": None
            }]
        })
    assert validate(document("SELL"), context).orders[0].status == "PENDING"
    with pytest.raises(InvalidDecision, match="non-investable"):
        validate(document("BUY"), context)
