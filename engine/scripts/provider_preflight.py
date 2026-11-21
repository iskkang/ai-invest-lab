"""Read-only smoke test for the AI Invest Lab remote services.

- Supabase: SELECT only (no schema/data mutations).
- NH PLUG: one AAPL historical quote request; no order endpoint.
- OpenRouter: validate API key and fetch model catalog; no inference charges.

Credentials are read from GitHub Actions secrets and never printed.
"""
from __future__ import annotations

import os
import sys
from urllib.parse import urlsplit

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


def _db_dsn_hint(dsn: str) -> str:
    """Classify only the connection URI shape, never print the URI or its parts."""
    if not dsn.startswith(("postgresql://", "postgres://")):
        return (
            "DATABASE_URL is not a PostgreSQL URI. Use Supabase Connect > "
            "Session pooler (port 5432), not the HTTPS Project URL."
        )
    try:
        uri = urlsplit(dsn)
        if not uri.hostname or not uri.username or not uri.password:
            return (
                "DATABASE_URL is missing host, username or password; "
                "copy the complete Session pooler URI and substitute the DB password."
            )
        if uri.port not in (5432, 6543):
            return "DATABASE_URL has an unexpected port; choose Session pooler port 5432."
        from psycopg.conninfo import conninfo_to_dict
        conninfo_to_dict(dsn)
    except (ValueError, psycopg.ProgrammingError):
        return (
            "DATABASE_URL URI is malformed; copy the Session pooler URI again. "
            "Percent-encode special characters in the database password."
        )
    return (
        "DATABASE_URL looks like a PostgreSQL URI, but libpq rejected it. "
        "Copy Supabase Connect > Session pooler port 5432, remove any quotes "
        "or DATABASE_URL= prefix, and URL-encode password special characters."
    )


def _db_check() -> bool:
    # Validate DSN separately from connecting/querying, without printing its value.
    dsn = os.environ["DATABASE_URL"]
    try:
        from psycopg.conninfo import conninfo_to_dict
        conninfo_to_dict(dsn)
    except psycopg.ProgrammingError:
        print("FAIL Supabase: invalid PostgreSQL connection URI (ProgrammingError)")
        print("HINT Supabase: " + _db_dsn_hint(dsn))
        return False

    # A Supabase Session pooler uses postgres.<project-ref>, NOT bare postgres.
    # Log only whether the structure is correct. Never log the actual URI/password.
    try:
        uri = urlsplit(dsn)
        host = (uri.hostname or "").lower()
        user = uri.username or ""
        if "pooler.supabase.com" in host:
            if user == "postgres":
                print("FAIL Supabase: Session pooler username is missing the project reference")
                print(
                    "HINT Supabase: copy Connect > Session pooler URI unchanged; "
                    "username must be postgres.ykhewuumkymjgpvqfpuo, not postgres"
                )
                return False
            if user != "postgres.ykhewuumkymjgpvqfpuo":
                print("FAIL Supabase: Session pooler username does not match AI Invest Lab")
                print("HINT Supabase: choose AI Invest Lab project, then Connect > Session pooler URI")
                return False
            if uri.port != 5432:
                print("FAIL Supabase: Session pooler must use port 5432")
                return False
        else:
            print("HINT Supabase: use the Supabase IPv4 Session pooler URI, not Direct connection")
    except ValueError:
        print("FAIL Supabase: malformed database connection URI")
        return False

    try:
        with psycopg.connect(dsn, connect_timeout=15) as conn:
            try:
                row = conn.execute(
                    "select count(*) from information_schema.tables "
                    "where table_schema='public' and table_name in "
                    "('ai_models','experiments','stock_prices','trades')"
                ).fetchone()
                if row is None or row[0] != 4:
                    print("FAIL Supabase: connected, but AI Invest Lab tables not found")
                    return False
            except psycopg.Error as exc:
                print(f"FAIL Supabase: connected, SQL error ({type(exc).__name__}, SQLSTATE={exc.sqlstate or 'N/A'})")
                return False
        print("PASS Supabase: read-only query, project schema confirmed")
        return True
    except psycopg.ProgrammingError:
        print("FAIL Supabase: malformed PostgreSQL connection settings (ProgrammingError)")
        print("HINT Supabase: " + _db_dsn_hint(dsn))
        return False
    except psycopg.OperationalError as exc:
        # libpq errors can include host/user/URI; expose only a fixed classification.
        msg = str(exc).lower()
        if "password authentication failed" in msg:
            print("FAIL Supabase: PostgreSQL password authentication rejected")
            print("HINT Supabase: copy the Session pooler URI again; check DB password and URL-encoding of reserved characters.")
        elif "could not translate host name" in msg or "name or service not known" in msg:
            print("FAIL Supabase: database hostname cannot be resolved")
            print("HINT Supabase: copy the Session pooler URI directly from the correct project.")
        elif "timeout" in msg or "connection refused" in msg:
            print("FAIL Supabase: connection timeout/refused")
            print("HINT Supabase: check host, port 5432 and Supabase service status.")
        else:
            print("FAIL Supabase: connection failed (OperationalError)")
            print("HINT Supabase: verify the entire Session pooler URI; credentials are never logged.")
        return False
    except psycopg.Error as exc:
        print(f"FAIL Supabase: connection failed ({type(exc).__name__}, SQLSTATE={exc.sqlstate or 'N/A'})")
        return False
    except Exception as exc:
        print(f"FAIL Supabase: unexpected connection error ({type(exc).__name__})")
        return False

def _nh_check() -> bool:
    try:
        # Previous completed NYSE session, including on weekends and holidays.
        end = mc.previous_session(mc.ny_today())
        # Retry only transient SDK rate-limit/network failures; no other API endpoints.
        bars = NHQuoteSource(max_retries=2).daily_bars("AAPL", end, 5)
        if not bars:
            print("FAIL NH PLUG: no AAPL daily bars returned")
            return False
        if any(b.trade_date > end for b in bars):
            print("FAIL NH PLUG: future-dated bar in response")
            return False
        print(f"PASS NH PLUG: AAPL, {len(bars)} valid historical daily bar(s)")
        return True
    except Exception as exc:
        # The NH adapter intentionally strips credentials/HTTP payloads.
        msg = str(exc)
        if msg.startswith("NH request failed [") and "]" in msg:
            category = msg.split("[", 1)[1].split("]", 1)[0]
            if category in ("rate_limit", "network", "auth", "http", "config"):
                print(f"FAIL NH PLUG: AAPL quote request failed (category={category})")
            else:
                print("FAIL NH PLUG: AAPL quote request failed (provider/SDK error)")
        elif msg.startswith("NH period: no Output_1"):
            print("FAIL NH PLUG: historical quote response missing expected Output_1 rows")
        elif msg.startswith("NH period: malformed row"):
            print("FAIL NH PLUG: historical quote response format invalid")
        else:
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
