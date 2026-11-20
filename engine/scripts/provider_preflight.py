"""Read-only smoke test for the AI Invest Lab remote services.

- Supabase: SELECT only (no schema/data mutations).
- NH PLUG: one AAPL historical quote request; no order endpoint.
- OpenRouter: validate API key and fetch model catalog; no inference charges.

Credentials are read from GitHub Actions secrets and never printed.
"""
from __future__ import annotations

import os
import sys

import httpx
import psycopg

from ail import market_calendar as mc
from ail.config import Settings
from ail.llm import OpenRouterProvider
from ail.sources import NHQuoteSource

REQUIRED_SECRETS = (
    "DATABASE_URL",
    "NHPLUG_APP_KEY",
    "NHPLUG_APP_SECRET",
    "OPENROUTER_API_KEY",
)


def _db_check() -> bool:
    try:
        with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=15) as conn:
            row = conn.execute(
                "select count(*) from information_schema.tables "
                "where table_schema='public' and table_name in "
                "('ai_models','experiments','stock_prices','trades')"
            ).fetchone()
            if row is None or row[0] != 4:
                print("FAIL Supabase: expected AI Invest Lab schema not found")
                return False
        print("PASS Supabase: read-only query, project schema confirmed")
        return True
    except Exception as exc:
        # psycopg error strings can include connection strings; don't print them.
        print(f"FAIL Supabase: connection/query failed ({type(exc).__name__})")
        return False


def _nh_check() -> bool:
    try:
        # Previous completed NYSE session, including on weekends and holidays.
        end = mc.previous_session(mc.ny_today())
        bars = NHQuoteSource(max_retries=0).daily_bars("AAPL", end, 5)
        if not bars:
            print("FAIL NH PLUG: no AAPL daily bars returned")
            return False
        if any(b.trade_date > end for b in bars):
            print("FAIL NH PLUG: future-dated bar in response")
            return False
        print(f"PASS NH PLUG: AAPL, {len(bars)} valid historical daily bar(s)")
        return True
    except Exception as exc:
        print(f"FAIL NH PLUG: historical quote request failed ({type(exc).__name__})")
        return False


def _openrouter_check() -> bool:
    key = os.environ["OPENROUTER_API_KEY"]
    try:
        # /key verifies the credential without billable generation.
        with httpx.Client(base_url="https://openrouter.ai/api/v1", timeout=30) as client:
            response = client.get("/key", headers={"Authorization": f"Bearer {key}"})
            if response.status_code != 200:
                print(f"FAIL OpenRouter: credential check HTTP {response.status_code}")
                return False
        participants = Settings().participants()
        ids = [p["model"] for p in participants]
        # Query the catalog only. Do not create chat completions here.
        catalog = OpenRouterProvider(api_key=key).prices(ids)
        if set(catalog) != set(ids):
            print("FAIL OpenRouter: missing configured model")
            return False
        print("PASS OpenRouter: API key valid; 4 configured model IDs/prices found")
        return True
    except RuntimeError as exc:
        message = str(exc)
        if message.startswith("model not in OpenRouter catalog:"):
            # Model IDs are public configuration, not credentials.
            print("FAIL OpenRouter: configured model absent from catalog: "
                  + message.partition(": ")[2])
        else:
            print("FAIL OpenRouter: model catalog validation failed")
        return False
    except Exception as exc:
        print(f"FAIL OpenRouter: credential/catalog check failed ({type(exc).__name__})")
        return False


def main() -> int:
    missing = [name for name in REQUIRED_SECRETS if not os.environ.get(name)]
    if missing:
        print("MISSING GitHub Actions Secrets: " + ", ".join(missing))
        print("No API requests or database connections were attempted.")
        return 2

    print("AI Invest Lab connection preflight (READ ONLY; no trades or AI inference)")
    results = [_db_check(), _nh_check(), _openrouter_check()]
    if all(results):
        print("PASS All three providers verified. Automatic investing remains DISABLED.")
        return 0
    print("FAIL One or more providers require attention. Automatic investing remains DISABLED.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
