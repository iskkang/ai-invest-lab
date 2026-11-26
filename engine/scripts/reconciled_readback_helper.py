"""Independent read-only confirmation after the activation connection commits."""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from urllib.parse import urlsplit

from ail import admin
from ail.common import D, cents, sha256, to_jsonable
from ail.config import BENCHMARK_SYMBOL, DEFAULT_UNIVERSE, LIVE_PRICE_SOURCE, Settings
from ail.db import connect
from ail.settlement_receipt import settlement_receipt


EXPECTED_SHA = "c4820b297f62fa168088ec481ffc226ae80d6401"
EXPECTED_LEGACY_SHA = "5338ce87a2d20464e693603d5a676ef3b8bf9a4633943a37fb8133f09595d7bb"


def main():
    required = {
        "GITHUB_REPOSITORY": "iskkang/ai-invest-lab",
        "GITHUB_EVENT_NAME": "push",
        "GITHUB_REF": "refs/heads/ops/reconciled-recovery-20261126",
        "GITHUB_RUN_ATTEMPT": "1",
        "EXPECTED_SOURCE_SHA": EXPECTED_SHA,
        "AIL_EXPERIMENT": "season-1",
        "AIL_MODE": "live",
    }
    if any(os.environ.get(key) != value for key, value in required.items()):
        raise RuntimeError("readback context mismatch")
    if datetime.now(timezone.utc) >= datetime(2026, 11, 26, 9, 0, tzinfo=timezone.utc):
        raise RuntimeError("readback expired")
    settings = Settings()
    settings.validate()
    connection_url = urlsplit(settings.database_url)
    with connect(settings.database_url) as conn, conn.transaction():
        conn.execute("set transaction read only")
        exp = conn.execute("select id from experiments where name=%s and mode='live'", (settings.experiment_name,)).fetchone()
        if not exp:
            raise RuntimeError("expected experiment missing")
        receipts = [settlement_receipt(conn, settings, date(2026, 11, day)) for day in (23, 24, 25)]
        problems = admin.verify(conn, settings.experiment_name, LIVE_PRICE_SOURCE)
        decisions = conn.execute("select count(*) as n from ai_decisions d join experiment_rounds r on r.id=d.round_id"
                                 " where r.experiment_id=%s", (exp["id"],)).fetchone()["n"]
        rounds = conn.execute("select count(*) as n from experiment_rounds where experiment_id=%s", (exp["id"],)).fetchone()["n"]
        legacy = conn.execute("select symbol,trade_date,open,high,low,close,volume,source,fetched_at,raw"
                              " from stock_prices where source='nh_plug' order by symbol,trade_date").fetchall()
        histories = conn.execute("select symbol,provider,bar_count,through_date,observed_at from ("
                                 " select distinct on(symbol) * from price_history_batches where dataset=%s"
                                 " order by symbol,observed_at desc,id desc) q order by symbol", (LIVE_PRICE_SOURCE,)).fetchall()
        dividends = conn.execute("select l.symbol,l.effective_date,l.cash_delta,a.benchmark_code"
                                 " from ledger_entries l join portfolio_accounts a on a.id=l.account_id"
                                 " where a.experiment_id=%s and l.entry_type='dividend' order by l.symbol", (exp["id"],)).fetchall()
        prior_benchmark = conn.execute("select s.holdings from benchmark_snapshots s join portfolio_accounts a on a.id=s.account_id"
                                       " where a.experiment_id=%s and a.benchmark_code='EQUAL_WEIGHT'"
                                       " and s.session_date='2026-11-23'", (exp["id"],)).fetchone()
        prior_quantities = {h["symbol"]: D(h["quantity"]) for h in prior_benchmark["holdings"]} if prior_benchmark else {}
        dividend_rates = {"COST": D("30"), "JNJ": D("1.34")}
        dividends_verified = (len(dividends) == 2 and {row["symbol"] for row in dividends} == set(dividend_rates)
                              and all(row["effective_date"] == date(2026, 11, 24)
                                      and row["benchmark_code"] == "EQUAL_WEIGHT"
                                      and prior_quantities.get(row["symbol"], 0) > 0
                                      and D(row["cash_delta"]) == cents(prior_quantities[row["symbol"]] * dividend_rates[row["symbol"]])
                                      for row in dividends))
        legacy_hash = sha256(legacy)
        legacy_unchanged = len(legacy) == 6820 and legacy_hash == EXPECTED_LEGACY_SHA
        expected_symbols = {row[0] for row in DEFAULT_UNIVERSE} | {BENCHMARK_SYMBOL[0]}
        verified = (all(r["verified"] for r in receipts) and not problems and decisions == 0 and rounds == 0
                    and legacy_unchanged and len(histories) == 31
                    and {h["symbol"] for h in histories} == expected_symbols
                    and all(200 <= h["bar_count"] <= 300 and h["through_date"] == date(2026, 11, 25) for h in histories)
                    and dividends_verified)
        print(json.dumps(to_jsonable({"event": "committed_readback", "verified": verified,
              "read_only_transaction": True, "source_sha": EXPECTED_SHA,
              "database_port": connection_url.port or 5432,
              "database_is_pooler": "pooler" in (connection_url.hostname or ""),
              "receipts": receipts, "ledger_problems": problems,
              "official_rounds": rounds, "ai_decisions": decisions,
              "legacy_prices_unchanged": legacy_unchanged,
              "legacy_prices": {"count": len(legacy), "sha256": legacy_hash},
              "histories": histories, "dividend_ledger": dividends,
              "dividends_verified": dividends_verified}), ensure_ascii=False), flush=True)
        if not verified:
            raise RuntimeError("committed readback verification failed")


if __name__ == "__main__":
    main()
