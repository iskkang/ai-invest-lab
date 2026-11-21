"""Real NH PLUG price ingestion before the first paper-trading session.

Provider calls run in isolated child processes: a timed-out NH request cannot
interrupt or poison an in-flight psycopg transaction. Each verified ticker is
committed independently, making the warmup resumable without fabricated bars.

No AI inference, no simulated orders, and no real brokerage orders.
"""
from __future__ import annotations

import multiprocessing as mp
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from ail import market_calendar as mc
from ail.config import Settings
from ail.db import connect
from ail.market_data import active_universe, ingest, sync_sessions
from ail.sources import NHQuoteSource


def _retrieve_history(source, symbol, through, count):
    """Page backwards by date to avoid oversized NH period requests.

    The normal nhplug.call() wrapper returns a single page; no historical
    records may be fabricated when the provider truncates one response.
    """
    unique = {}
    end_date = through
    for page in range(14):
        batch = source.daily_bars(symbol, end_date, min(60, count - len(unique) + 5))
        batch = [bar for bar in batch if bar.trade_date <= end_date]
        if not batch:
            raise ValueError("NH period returned empty historical page")
        for bar in batch:
            prior = unique.get(bar.trade_date)
            if prior is not None and prior != bar:
                raise ValueError("NH period revised a bar while paginating")
            unique[bar.trade_date] = bar
        if len(unique) >= count:
            break
        oldest = min(bar.trade_date for bar in batch)
        next_end = oldest - timedelta(days=1)
        if next_end >= end_date:
            raise ValueError("NH period did not advance to an older page")
        end_date = next_end
    if len(unique) < max(200, count - 15):
        raise ValueError("NH period returned insufficient genuine historical sessions")
    rows = sorted(unique.values(), key=lambda bar: bar.trade_date)
    if not rows or rows[-1].trade_date != through:
        raise ValueError("NH period has no confirmed final session bar")
    return rows


def _fetch_in_child(symbol, through, count, sender):
    """Fetch one genuine NH PLUG series without touching a database connection."""
    try:
        bars = _retrieve_history(NHQuoteSource(), symbol, through, count)
        sender.send(("ok", bars))
    except Exception as exc:
        try:
            sender.send(("error", type(exc).__name__))
        except Exception:
            pass
    finally:
        sender.close()


def fetch_with_deadline(symbol, through, count, seconds):
    """Isolate NH network calls from the caller's PostgreSQL connection."""
    context = mp.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    child = context.Process(target=_fetch_in_child, args=(symbol, through, count, sender))
    try:
        child.start()
        sender.close()
        if not receiver.poll(seconds):
            raise TimeoutError("NH period endpoint exceeded per-symbol deadline")
        try:
            status, value = receiver.recv()
        except EOFError:
            raise RuntimeError("NH subprocess ended without an outcome") from None
        if status != "ok":
            raise RuntimeError("NH quote request failed: " + str(value))
        return value
    finally:
        receiver.close()
        sender.close()
        if child.pid is not None:
            if child.is_alive():
                child.terminate()
                child.join(timeout=3)
                if child.is_alive():
                    child.kill()
            child.join(timeout=3)


class RetrievedNHSource:
    """An in-memory quote source: DB ingestion never waits on a provider call."""
    name = "nh_plug"

    def __init__(self, symbol, bars):
        self.symbol = symbol
        self.bars = bars

    def daily_bars(self, symbol, end, count):
        if symbol != self.symbol:
            raise ValueError("Unexpected ticker in NH ingestion")
        return self.bars


def main() -> int:
    required = ("DATABASE_URL", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET")
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        print("MISSING secrets: " + ", ".join(missing), flush=True)
        return 2

    settings = Settings()
    settings.mode = "live"
    max_symbols = max(1, min(31, int(os.environ.get("AIL_WARMUP_MAX_SYMBOLS", "12"))))
    symbol_timeout = max(15, min(300, int(os.environ.get("AIL_WARMUP_SYMBOL_TIMEOUT", "140"))))

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
                print("STOP: warmup cannot backdate official investment history", flush=True)
                return 1

            with conn.transaction():
                sync_sessions(conn, through - timedelta(days=550), through + timedelta(days=10))

            rows = conn.execute(
                "select symbol,count(*) n,max(trade_date) latest "
                "from stock_prices where source='nh_plug' group by symbol"
            ).fetchall()
            complete = {
                r["symbol"] for r in rows
                if r["n"] >= 200 and r["latest"] >= through
            }
            pending = [symbol for symbol in symbols if symbol not in complete]
            print(
                f"NH live prices through={through}: complete={len(complete)}/31, "
                f"pending={len(pending)}, bars={settings.history_bars}",
                flush=True,
            )
            if not pending:
                print("PASS: all 31 genuine price series already saved", flush=True)
                return 0

            succeeded, failed = 0, 0
            for symbol in pending[:max_symbols]:
                started = time.monotonic()
                try:
                    # Fetch and timeout isolated from DB write transactions.
                    bars = fetch_with_deadline(
                        symbol, through, settings.history_bars, symbol_timeout
                    )
                    with conn.transaction():
                        report = ingest(
                            conn, RetrievedNHSource(symbol, bars), [symbol],
                            through, datetime.now(timezone.utc), settings.history_bars,
                        )
                    succeeded += 1
                    print(
                        f"OK {symbol}: committed {report['inserted']} genuine bars "
                        f"in {time.monotonic()-started:.1f}s",
                        flush=True,
                    )
                except Exception as exc:
                    failed += 1
                    # Sanitized errors, no response bodies, tokens or connection strings.
                    print(
                        f"FAILED {symbol}: {type(exc).__name__}; continuing",
                        flush=True,
                    )

            check = conn.execute(
                "select symbol,count(*) n,max(trade_date) latest "
                "from stock_prices where source='nh_plug' group by symbol"
            ).fetchall()
            complete = {r["symbol"] for r in check if r["n"] >= 200 and r["latest"] >= through}
            remaining = len(set(symbols) - complete)
            print(
                f"RESULT: {succeeded} succeeded, {failed} failed in this run, "
                f"{remaining} symbols remain; no AI calls or trades",
                flush=True,
            )
            return 0 if remaining == 0 else 1
    except Exception as exc:
        print(f"FAIL NH warmup: {type(exc).__name__}", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
