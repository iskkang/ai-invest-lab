"""Single bounded production settlement replay; delete after the observed run.

Copy this file to engine/scripts/settlement_replay_helper.py on the replay
branch only. Replace 44f7ef821df1e9a1d73a6a9401a92594abf18438 in BOTH this file and the
workflow after the engine CI has passed. No production engine code is changed.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg


TESTED_SHA = "44f7ef821df1e9a1d73a6a9401a92594abf18438"
REPOSITORY = "iskkang/ai-invest-lab"
REPLAY_REF = "refs/heads/ops/settlement-replay-20261126"
TARGET_SESSION = "2026-11-25"
EXPERIMENT = "season-1"
EXPIRES_AT = datetime(2026, 11, 26, 6, 30, tzinfo=timezone.utc)
SECRET_NAMES = (
    "DATABASE_URL", "OPENROUTER_API_KEY", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET",
)

# Full persisted row contents are hashed in memory and never printed. The price
# scope includes ALL NH PLUG rows; other scopes include only this experiment.
# Operational job/audit/calendar rows intentionally are not financial records.
FINGERPRINT_QUERIES = {
    "stock_prices": (
        "select to_jsonb(p)::text from stock_prices p"
        " where p.source='nh_plug' order by p.symbol,p.trade_date,p.source",
        False,
    ),
    "experiment_rounds": (
        "select to_jsonb(r)::text from experiment_rounds r"
        " where r.experiment_id=%s order by r.id",
        True,
    ),
    "ai_decisions": (
        "select to_jsonb(d)::text from ai_decisions d"
        " join experiment_rounds r on r.id=d.round_id"
        " where r.experiment_id=%s order by d.id",
        True,
    ),
    "orders": (
        "select to_jsonb(o)::text from orders o"
        " join portfolio_accounts a on a.id=o.account_id"
        " where a.experiment_id=%s order by o.id",
        True,
    ),
    "trades": (
        "select to_jsonb(t)::text from trades t"
        " join portfolio_accounts a on a.id=t.account_id"
        " where a.experiment_id=%s order by t.id",
        True,
    ),
    "ledger_entries": (
        "select to_jsonb(l)::text from ledger_entries l"
        " join portfolio_accounts a on a.id=l.account_id"
        " where a.experiment_id=%s order by l.id",
        True,
    ),
    "holdings": (
        "select to_jsonb(h)::text from holdings h"
        " join portfolio_accounts a on a.id=h.account_id"
        " where a.experiment_id=%s order by h.account_id,h.symbol",
        True,
    ),
    "portfolio_snapshots": (
        "select to_jsonb(s)::text from portfolio_snapshots s"
        " join portfolio_accounts a on a.id=s.account_id"
        " where a.experiment_id=%s order by s.account_id,s.session_date",
        True,
    ),
    "benchmark_snapshots": (
        "select to_jsonb(s)::text from benchmark_snapshots s"
        " join portfolio_accounts a on a.id=s.account_id"
        " where a.experiment_id=%s order by s.account_id,s.session_date",
        True,
    ),
}


class ReplayRejected(Exception):
    pass


def emit(value: dict) -> None:
    # GitHub masks configured secrets too. This additionally redacts a value if
    # an unexpected engine JSON string happens to contain one of the four keys.
    payload = json.dumps(value, ensure_ascii=False, indent=2)
    for name in SECRET_NAMES:
        secret = os.environ.get(name)
        if secret:
            payload = payload.replace(json.dumps(secret, ensure_ascii=False)[1:-1], "[REDACTED]")
    print(payload, flush=True)


def guard() -> Path:
    if not re.fullmatch(r"[0-9a-f]{40}", TESTED_SHA):
        raise ReplayRejected("tested SHA must be replaced with the passing full commit")
    required = {
        "GITHUB_REPOSITORY": REPOSITORY,
        "GITHUB_EVENT_NAME": "push",
        "GITHUB_REF": REPLAY_REF,
        "GITHUB_RUN_ATTEMPT": "1",
        "REPLAY_BEFORE": TESTED_SHA,
        "AIL_ENGINE_ENABLED": "true",
        "AIL_MODE": "live",
        "AIL_EXPERIMENT": EXPERIMENT,
        "AIL_EXPECTED_SESSION": TARGET_SESSION,
    }
    if any(os.environ.get(key) != value for key, value in required.items()):
        raise ReplayRejected("replay event or production scope did not match the fixed guard")
    if any(not os.environ.get(name) for name in SECRET_NAMES):
        raise ReplayRejected("a required production secret is missing")
    if datetime.now(timezone.utc) >= EXPIRES_AT:
        raise ReplayRejected("one-time replay has expired")
    tested_dir = Path(os.environ["AIL_TESTED_DIR"]).resolve(strict=True)
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=tested_dir,
        capture_output=True, text=True, check=True, timeout=10,
    ).stdout.strip()
    if head != TESTED_SHA:
        raise ReplayRejected("checked-out engine commit does not match the passing SHA")
    return tested_dir


def fingerprints() -> dict:
    result = {}
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, connect_timeout=15) as conn:
        # Each complete before/after view is consistent and explicitly unable
        # to write, independently of the CLI connection used for settlement.
        with conn.transaction():
            conn.execute("set transaction isolation level repeatable read, read only")
            conn.execute("set local statement_timeout = '30s'")
            conn.execute("set local timezone = 'UTC'")
            rows = conn.execute(
                "select id from experiments where name=%s and mode='live'", (EXPERIMENT,),
            ).fetchall()
            if len(rows) != 1:
                raise ReplayRejected("expected live experiment was not found uniquely")
            experiment_id = rows[0][0]
            for name, (sql, scoped) in FINGERPRINT_QUERIES.items():
                digest, count = hashlib.sha256(), 0
                with conn.cursor(name=f"replay_{name}") as cursor:
                    cursor.execute(sql, (experiment_id,) if scoped else None)
                    for row in cursor:
                        encoded = row[0].encode("utf-8")
                        digest.update(len(encoded).to_bytes(8, "big"))
                        digest.update(encoded)
                        count += 1
                result[name] = {"rows": count, "sha256": digest.hexdigest()}
    return result


def main() -> int:
    try:
        tested_dir = guard()
        before = fingerprints()
    except ReplayRejected as exc:
        emit({"status": "replay_rejected", "reason": str(exc)})
        return 1
    except Exception as exc:
        # Neither connection strings nor provider/raw exception messages belong
        # in this diagnostic log. No CLI invocation has happened at this point.
        emit({"status": "before_fingerprint_failed", "error_class": type(exc).__name__})
        return 1
    emit({"phase": "before", "tested_sha": TESTED_SHA, "session": TARGET_SESSION,
          "observed_at": datetime.now(timezone.utc).isoformat(), "fingerprints": before})

    remaining = int((EXPIRES_AT - datetime.now(timezone.utc)).total_seconds())
    if remaining < 60:
        emit({"status": "replay_rejected", "reason": "replay window is closing"})
        return 1
    started_at = datetime.now(timezone.utc).isoformat()
    engine_result, engine_exit = {}, None
    try:
        # Exactly one settlement invocation. Its real clock is untouched. No
        # run-daily, model smoke test, budget probe, or alternate source is used.
        process = subprocess.run(
            ["ail", "run-settle"], cwd=tested_dir, env=os.environ.copy(),
            capture_output=True, text=True, timeout=min(900, remaining),
        )
        engine_exit = process.returncode
        try:
            parsed = json.loads(process.stdout)
            if not isinstance(parsed, dict):
                raise ValueError("engine JSON is not an object")
            engine_result = parsed
        except (ValueError, TypeError):
            engine_result = {"status": "unparseable_engine_output",
                             "stdout_bytes": len(process.stdout.encode("utf-8")),
                             "stderr_bytes": len(process.stderr.encode("utf-8"))}
    except subprocess.TimeoutExpired:
        engine_result = {"status": "replay_timeout"}
    except Exception as exc:
        engine_result = {"status": "engine_invocation_failed", "error_class": type(exc).__name__}

    emit({"phase": "engine_result", "started_at": started_at,
          "finished_at": datetime.now(timezone.utc).isoformat(),
          "session": TARGET_SESSION, "cli_exit": engine_exit, "result": engine_result})
    try:
        after = fingerprints()
    except Exception as exc:
        emit({"status": "after_fingerprint_failed", "error_class": type(exc).__name__})
        return 1
    changed = sorted(name for name in before if before[name] != after[name])
    receipt = engine_result.get("settlement_receipt") or {}
    market_data = engine_result.get("market_data") or {}
    blocked_unchanged = (
        engine_exit == 1 and engine_result.get("status") == "blocked"
        and market_data.get("kind") == "ingestion_blocked"
        and market_data.get("source") == "nh_plug"
        and market_data.get("through") == TARGET_SESSION
        and market_data.get("committed_bars") == 0
        and bool(market_data.get("issues")) and not changed
    )
    settled_verified = (
        engine_exit == 0 and receipt.get("verified") is True
        and receipt.get("session") == TARGET_SESSION
        and receipt.get("source") == "nh_plug"
        and receipt.get("phase") == "settlement"
        and "ai_decisions" not in changed
    )
    emit({"phase": "after", "fingerprints": after,
          "changed_tables": changed, "business_tables_unchanged": not changed,
          "ai_decisions_unchanged": "ai_decisions" not in changed,
          "blocked_without_partial_business_writes": blocked_unchanged,
          "settled_with_verified_receipt": settled_verified,
          "exit_code": 0 if settled_verified else 1})
    # A proven blocked source remains a failed workflow. Only actual settlement
    # with a complete receipt may return success; diagnostics never turn it green.
    return 0 if settled_verified else 1


if __name__ == "__main__":
    sys.exit(main())
