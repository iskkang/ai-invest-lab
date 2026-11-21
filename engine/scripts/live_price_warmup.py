"""Manual market-data warmup for the live paper-trading experiment.

Fetches historical daily quotes for the configured 30 US stocks and SPY using
NH PLUG. Stores verified market prices only; NEVER invokes AI, creates rounds,
places paper orders, or executes real brokerage orders.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta

from ail import market_calendar as mc
from ail.config import Settings
from ail.db import connect
from ail.market_data import active_universe, ingest, sync_sessions
from ail.sources import NHQuoteSource


def main() -> int:
    required = ("DATABASE_URL", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print("MISSING secrets: " + ", ".join(missing))
        return 2

    settings = Settings()
    settings.mode = "live"
    # This workflow does not create / change the experiment. It requires that
    # the verified, genuine "live" experiment has already been initialized.
    try:
        with connect(settings.database_url) as conn:
            exp = conn.execute(
                "select id,mode,start_session from experiments where name=%s",
                (settings.experiment_name,),
            ).fetchone()
            if not exp or exp["mode"] != "live":
                print("FAIL: requested real-data experiment has not been initialized")
                return 1

            symbols = sorted({row["symbol"] for row in active_universe(conn)})
            if len(symbols) != 31 or "SPY" not in symbols:
                print("FAIL: expected 30 active stocks and SPY; check the universe")
                return 1
            through = mc.previous_session(mc.ny_today())
            if through >= exp["start_session"]:
                # Warmup must never create or mutate official experiment history.
                print("FAIL: warmup is only allowed BEFORE the first real session")
                return 1

            print(
                f"NH PLUG price warmup: {len(symbols)} symbols, "
                f"through {through.isoformat()}, history up to {settings.history_bars} bars"
            )
            before = conn.execute(
                "select "
                "(select count(*) from experiment_rounds) AS rounds,"
                "(select count(*) from orders) AS orders,"
                "(select count(*) from trades) AS trades,"
                "(select count(*) from ai_decisions) AS decisions"
            ).fetchone()
            with conn.transaction():
                sync_sessions(
                    conn,
                    through - timedelta(days=550),
                    through + timedelta(days=10),
                )
                report = ingest(
                    conn, NHQuoteSource(), symbols, through,
                    datetime.now(timezone.utc), settings.history_bars
                )
            after = conn.execute(
                "select "
                "(select count(*) from experiment_rounds) AS rounds,"
                "(select count(*) from orders) AS orders,"
                "(select count(*) from trades) AS trades,"
                "(select count(*) from ai_decisions) AS decisions"
            ).fetchone()
            if before != after:
                print("FAIL: unexpected change in trade/decision counts; review immediately")
                return 1
            count = conn.execute(
                "select count(*) AS n from stock_prices where source='nh_plug'"
            ).fetchone()["n"]
            print(
                f"PASS: stored {report['inserted']} validated historical bars "
                f"({count} total real-source rows) for {len(symbols)} symbols."
            )
            print("NO AI inference; NO paper trades; NO real brokerage orders.")
        return 0
    except Exception as exc:
        # Don't print connection strings or provider response payloads.
        print(f"FAIL market data warmup: {type(exc).__name__}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
