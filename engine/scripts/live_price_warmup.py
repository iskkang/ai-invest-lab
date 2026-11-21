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
    """Fetch actual NH PLUG quotes; commit each verified symbol independently."""
    import signal
    import time

    required = ("DATABASE_URL", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print("MISSING secrets: " + ", ".join(missing), flush=True)
        return 2
    settings = Settings()
    settings.mode = "live"
    max_symbols = max(1, min(31, int(os.environ.get("AIL_WARMUP_MAX_SYMBOLS", "31"))))
    symbol_timeout = max(15, min(300, int(os.environ.get("AIL_WARMUP_SYMBOL_TIMEOUT", "70"))))

    try:
        with connect(settings.database_url) as conn:
            exp = conn.execute(
                "select id,mode,start_session from experiments where name=%s",
                (settings.experiment_name,),
            ).fetchone()
            if not exp or exp["mode"] != "live":
                print("FAIL: live experiment not initialized", flush=True)
                return 1

            symbols = sorted({row["symbol"] for row in active_universe(conn)})
            if len(symbols) != 31 or "SPY" not in symbols:
                print("FAIL: expected 30 stocks plus SPY", flush=True)
                return 1
            through = mc.previous_session(mc.ny_today())
            if through >= exp["start_session"]:
                print("STOP: warmup is restricted to before the first live session", flush=True)
                return 1

            with conn.transaction():
                sync_sessions(conn, through - timedelta(days=550), through + timedelta(days=10))

            rows = conn.execute(
                "select symbol,count(*) n,max(trade_date) latest"
                " from stock_prices where source='nh_plug' group by symbol"
            ).fetchall()
            complete = {r["symbol"] for r in rows if r["n"] >= 200 and r["latest"] >= through}
            pending = [sym for sym in symbols if sym not in complete]
            print(
                f"NH real quote warmup: through={through}, "
                f"complete={len(complete)}/{len(symbols)}, "
                f"pending={len(pending)}, requested_bars={settings.history_bars}",
                flush=True,
            )
            if not pending:
                print("COMPLETE: verified real prices available for all symbols", flush=True)
                return 0

            src = NHQuoteSource()
            ok = 0
            failed = 0

            def alarm_handler(signum, frame):
                raise TimeoutError("NH symbol request exceeded deadline")

            previous_handler = signal.signal(signal.SIGALRM, alarm_handler)
            try:
                for symbol in pending[:max_symbols]:
                    start = time.monotonic()
                    signal.alarm(symbol_timeout)
                    try:
                        with conn.transaction():
                            report = ingest(
                                conn, src, [symbol], through,
                                datetime.now(timezone.utc), settings.history_bars,
                            )
                        ok += 1
                        print(
                            f"OK {symbol}: saved {report['inserted']} verified bars "
                            f"in {time.monotonic()-start:.1f}s",
                            flush=True,
                        )
                    except Exception as exc:
                        failed += 1
                        # Never emit credentials, SQL connection strings or provider payloads.
                        print(f"FAILED {symbol}: {type(exc).__name__}; continuing", flush=True)
                    finally:
                        signal.alarm(0)
            finally:
                signal.signal(signal.SIGALRM, previous_handler)

            new_rows = conn.execute(
                "select symbol,count(*) n,max(trade_date) latest"
                " from stock_prices where source='nh_plug' group by symbol"
            ).fetchall()
            completed = {r["symbol"] for r in new_rows if r["n"] >= 200 and r["latest"] >= through}
            remaining = len(set(symbols) - completed)
            print(
                f"RESULT: succeeded={ok}, failed={failed}, remaining={remaining}; "
                "NO AI decisions, NO orders, NO brokerage trades",
                flush=True,
            )
            # Mark partial runs non-successful; successful per-symbol rows are safely committed.
            return 0 if remaining == 0 else 1
    except Exception as exc:
        print(f"FAIL live NH price warmup: {type(exc).__name__}", flush=True)
        return 1

if __name__ == "__main__":
    sys.exit(main())
