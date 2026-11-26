"""Bounded, audited activation before the first official AI round."""
from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from ail import admin
from ail.common import D, sha256, to_jsonable
from ail.config import LIVE_PRICE_SOURCE, Settings
from ail.db import advisory_lock, connect
from ail.market_data import build_market_payload
from ail.pipeline import run_settle
from ail.reconciled_source import ReconciledQuoteSource


EXPECTED_SHA = "c3463c40fffa64eecb0e8194142d10b2bbc7295c"
EXPECTED_BRANCH = "refs/heads/ops/reconciled-recovery-20261126"
TARGET = date(2026, 11, 25)
EXPIRES = datetime(2026, 11, 26, 9, 0, tzinfo=timezone.utc)
MIGRATION = "20261126000007_reconciled_price_history.sql"
EVENTS = (
    ("COST", "30.00", "https://www.cmegroup.com/notices/clearing/2026/11/26-368.html",
     "Issuer declaration https://investor.costco.com/news/news-details/2026/Costco-Wholesale-Corporation-Declares-30-Special-Cash-Dividend-and-Reauthorizes-Stock-Repurchase-Program/default.aspx ; payable 2026-12-04. Existing simulation credits on ex-date."),
    ("JNJ", "1.34", "https://www.jnj.com/media-center/press-releases/johnson-johnson-announces-quarterly-dividend-for-fourth-quarter-2026",
     "Issuer declared 2026-10-13; ex-date 2026-11-24; payable 2026-12-08. Existing simulation credits on ex-date."),
)


def emit(kind, value):
    print(json.dumps(to_jsonable({"event": kind, **value}), ensure_ascii=False), flush=True)


def guard():
    required = {"GITHUB_REPOSITORY": "iskkang/ai-invest-lab", "GITHUB_EVENT_NAME": "push",
                "GITHUB_REF": EXPECTED_BRANCH, "GITHUB_RUN_ATTEMPT": "1",
                "EXPECTED_SOURCE_SHA": EXPECTED_SHA, "AIL_EXPERIMENT": "season-1",
                "AIL_MODE": "live", "AIL_ENGINE_ENABLED": "true"}
    if any(os.environ.get(key) != value for key, value in required.items()):
        raise RuntimeError("recovery activation guard rejected context")
    if datetime.now(timezone.utc) >= EXPIRES:
        raise RuntimeError("recovery activation expired")


def legacy_fingerprint(conn):
    rows = conn.execute("select symbol,trade_date,open,high,low,close,volume,source,fetched_at,raw"
                        " from stock_prices where source='nh_plug' order by symbol,trade_date").fetchall()
    return {"count": len(rows), "sha256": sha256(rows)}


def official_counts(conn, exp_id):
    result = {}
    for table in ("experiment_rounds",):
        result[table] = conn.execute(f"select count(*) as n from {table} where experiment_id=%s", (exp_id,)).fetchone()["n"]
    for table in ("orders", "trades", "portfolio_snapshots", "benchmark_snapshots"):
        result[table] = conn.execute(f"select count(*) as n from {table} t join portfolio_accounts a on a.id=t.account_id"
                                    " where a.experiment_id=%s", (exp_id,)).fetchone()["n"]
    result["ai_decisions"] = conn.execute("select count(*) as n from ai_decisions d join experiment_rounds r on r.id=d.round_id"
                                         " where r.experiment_id=%s", (exp_id,)).fetchone()["n"]
    result["non_initial_ledger"] = conn.execute("select count(*) as n from ledger_entries l join portfolio_accounts a on a.id=l.account_id"
                                               " where a.experiment_id=%s and l.entry_type<>'initial'", (exp_id,)).fetchone()["n"]
    return result


def main():
    guard()
    settings = Settings()
    settings.validate()
    root = Path(os.environ["TESTED_SOURCE_PATH"]).resolve()
    script = root / "supabase" / "migrations" / MIGRATION
    migration_text = script.read_text(encoding="utf-8")
    conn = connect(settings.database_url)
    # Pin one PostgreSQL backend through migration, ingestion and verification.
    # This also makes activation atomic when DATABASE_URL is a transaction pooler.
    with conn, conn.transaction(), advisory_lock(conn, "ail.daily"):
        exp = conn.execute("select * from experiments where name=%s and mode='live'", (settings.experiment_name,)).fetchone()
        if not exp or exp["start_session"] != date(2026, 11, 23):
            raise RuntimeError("unexpected experiment identity or start session")
        before = official_counts(conn, exp["id"])
        if any(before.values()):
            raise RuntimeError("activation requires no pre-existing official economic results")
        legacy_before = legacy_fingerprint(conn)
        if legacy_before["count"] != 6820:
            raise RuntimeError("legacy canonical price count changed; inspect before activation")
        emit("before", {"legacy_prices": legacy_before, "official_counts": before})
        if conn.execute("select to_regclass('public.price_history_batches') as t").fetchone()["t"] is not None:
            raise RuntimeError("reconciled migration already present; do not blindly repeat activation")
        with conn.transaction():
            conn.execute(migration_text)
            conn.execute("create table if not exists _ail_migrations(name text primary key, applied_at timestamptz default now())")
            conn.execute("insert into _ail_migrations(name) values (%s)", (MIGRATION,))
        emit("migration", {"name": MIGRATION, "sha256": hashlib.sha256(migration_text.encode()).hexdigest()})
        with conn.transaction():
            for symbol, amount, url, note in EVENTS:
                existing = conn.execute("select * from corporate_actions where symbol=%s and kind='cash_dividend'"
                                        " and ex_date='2026-11-24' and price_source=%s", (symbol, LIVE_PRICE_SOURCE)).fetchone()
                if existing:
                    if D(existing["amount"]) != D(amount):
                        raise RuntimeError("conflicting corporate-action amount")
                else:
                    admin.add_corporate_action(conn, symbol, "cash_dividend", date(2026, 11, 24), None,
                                               amount, url, note, "reconciled-recovery", LIVE_PRICE_SOURCE)
        emit("corporate_actions", {"events": [{"symbol": s, "amount": a, "ex_date": "2026-11-24", "source": u}
                                              for s, a, u, _ in EVENTS]})
        result = run_settle(conn, settings, ReconciledQuoteSource(), datetime.now(timezone.utc),
                            expected_session=TARGET.isoformat())
        emit("settlement", result)
        problems = admin.verify(conn, settings.experiment_name, LIVE_PRICE_SOURCE)
        market = build_market_payload(conn, LIVE_PRICE_SOURCE, TARGET, datetime.now(timezone.utc))
        after = official_counts(conn, exp["id"])
        legacy_after = legacy_fingerprint(conn)
        counts = conn.execute("select provider,count(*) as symbols from (select distinct on(symbol) symbol,provider"
                              " from price_history_batches where dataset=%s order by symbol,observed_at desc,id desc) q"
                              " group by provider order by provider", (LIVE_PRICE_SOURCE,)).fetchall()
        verified = (result.get("settlement_receipt", {}).get("verified") is True and not problems
                    and legacy_before == legacy_after and after["experiment_rounds"] == 0
                    and after["ai_decisions"] == 0 and len(market["investable"]) == 30
                    and len(market["benchmark"]) == 1)
        emit("verification", {"verified": verified, "legacy_prices_unchanged": legacy_before == legacy_after,
                              "legacy_prices": legacy_after, "official_counts": after,
                              "ledger_problems": problems, "analysis_symbols": len(market["investable"]) + len(market["benchmark"]),
                              "analysis_hash": sha256(market), "providers": counts,
                              "paid_model_calls": 0, "historical_ai_decisions_created": 0})
        if not verified:
            raise RuntimeError("recovery verification failed; activation transaction rolled back")
        return 0


if __name__ == "__main__":
    sys.exit(main())
