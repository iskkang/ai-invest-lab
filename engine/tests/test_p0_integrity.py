"""P0 regressions: demo/live data isolation, point-in-time splits and source safety."""
from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from ail import admin, portfolio
from ail.common import LabError
from ail.market_data import adjusted_history, recorded_splits
from ail.pipeline import bootstrap, run_decision_round, settle_through
from conftest import ScriptedProvider, START, at


def test_corporate_action_sources_are_independent_in_same_database(db, settings):
    demo_exp = bootstrap(db, settings)
    live_settings = replace(settings, mode="live", experiment_name=settings.experiment_name + "-live")
    live_exp = bootstrap(db, live_settings)
    synthetic_date = date(2026, 9, 14)
    assert recorded_splits(db, "NVDA", "demo", synthetic_date)[synthetic_date] == Decimal(4)
    assert recorded_splits(db, "NVDA", "nh_plug", synthetic_date) == {}

    # Previously impossible because of the global (symbol, kind, ex_date) key:
    # a real action on a DEMO event's date can now coexist independently.
    admin.add_corporate_action(db, "NVDA", "split", synthetic_date, 2, None, "official filing", "", "test", "nh_plug")
    assert recorded_splits(db, "NVDA", "nh_plug", synthetic_date)[synthetic_date] == Decimal(2)
    assert recorded_splits(db, "NVDA", "demo", synthetic_date)[synthetic_date] == Decimal(4)

    demo_aid = db.execute("select id from portfolio_accounts where experiment_id=%s and ai_model_id='gpt'",
                          (demo_exp["id"],)).fetchone()["id"]
    live_aid = db.execute("select id from portfolio_accounts where experiment_id=%s and ai_model_id='gpt'",
                          (live_exp["id"],)).fetchone()["id"]
    portfolio._set_holding(db, demo_aid, "NVDA", 3, Decimal(400))
    portfolio._set_holding(db, live_aid, "NVDA", 3, Decimal(400))
    portfolio.apply_corporate_actions(db, demo_exp, synthetic_date, "demo")
    assert portfolio.holdings_of(db, demo_aid)["NVDA"]["qty"] == 12
    assert portfolio.holdings_of(db, live_aid)["NVDA"]["qty"] == 3
    portfolio.apply_corporate_actions(db, live_exp, synthetic_date, "nh_plug")
    assert portfolio.holdings_of(db, live_aid)["NVDA"]["qty"] == 6


def test_future_and_late_registered_splits_never_enter_earlier_snapshot(db):
    before, ex_date = date(2026, 11, 16), date(2026, 11, 17)
    now = datetime.now(timezone.utc)
    for d, price in [(before, 100), (ex_date, 50)]:
        db.execute(
            "insert into stock_prices(symbol, trade_date, open, high, low, close, volume, source, fetched_at)"
            " values ('TEST',%s,%s,%s,%s,%s,1000,'nh_plug',%s)",
            (d, price, price, price, price, now - timedelta(days=1)),
        )
    admin.add_corporate_action(db, "TEST", "split", ex_date, 2, None, "official filing", "", "test", "nh_plug")

    after_registration = datetime.now(timezone.utc) + timedelta(minutes=2)
    before_registration = now - timedelta(minutes=2)
    # A future split cannot rewrite any data_as_of prior to its ex-date.
    old = adjusted_history(db, "TEST", "nh_plug", before, after_registration)
    assert [h["close"] for h in old] == [100.0]
    # A split retroactively registered after a historical decision also cannot leak backward.
    old_cutoff = adjusted_history(db, "TEST", "nh_plug", ex_date, before_registration)
    assert [h["close"] for h in old_cutoff] == [100.0, 50.0]
    valid = adjusted_history(db, "TEST", "nh_plug", ex_date, after_registration)
    assert [h["close"] for h in valid] == [50.0, 50.0]
    # A similarly named demo action cannot affect nh_plug prices.
    assert recorded_splits(db, "TEST", "demo", ex_date) == {}


def test_cross_source_decisions_and_settlement_fail_closed(db, settings, source):
    exp = bootstrap(db, settings)
    with pytest.raises(LabError, match="cannot use nh_plug"):
        run_decision_round(db, exp, START, at(START, "08:30"), "nh_plug", ScriptedProvider(), settings)
    wrong = type("BadSource", (), {"name": "nh_plug"})()
    with pytest.raises(LabError, match="cannot use nh_plug"):
        settle_through(db, exp, wrong, START, at(START, "18:00"), settings)


def test_contaminated_legacy_ledger_blocks_future_runs(db, settings):
    demo_exp = bootstrap(db, settings)
    live_settings = replace(settings, mode="live", experiment_name=settings.experiment_name + "-live")
    live_exp = bootstrap(db, live_settings)
    synthetic_id = db.execute("select id from corporate_actions where price_source='demo' limit 1").fetchone()["id"]
    live_aid = db.execute("select id from portfolio_accounts where experiment_id=%s and ai_model_id='gpt'",
                          (live_exp["id"],)).fetchone()["id"]
    portfolio.post(db, live_aid, "dividend", "corporate_action", synthetic_id, "KO", 1, 0, START)
    with pytest.raises(LabError, match="pre-migration cross-source"):
        bootstrap(db, live_settings)
