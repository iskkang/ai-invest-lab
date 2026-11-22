"""Queue universe edits without touching active stocks until a valid official decision round.

Every request is recorded before effective_session, appears in the Journal,
and is applied atomically with publication of a valid AI decision round.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from . import market_calendar as mc
from .common import LabError
from .db import audit
from .market_data import active_universe

SYMBOL = re.compile(r"^[A-Z][A-Z0-9.\-]{0,14}$")


def next_effective_session(conn, experiment: dict, now: datetime):
    today = mc.ny_today(now)
    target = mc.next_session(today)  # Always future; never silently switch today's input.
    if experiment["start_session"] > target:
        target = experiment["start_session"]
    latest = conn.execute(
        "select max(session_date) as d from experiment_rounds where experiment_id=%s",
        (experiment["id"],),
    ).fetchone()["d"]
    if latest is not None and target <= latest:
        target = mc.next_session(latest)
    return target


def schedule_change(conn, experiment_name: str, action: str, symbol: str,
                    actor: str, reason: str, *, name=None, sector=None,
                    now: datetime | None = None):
    now = now or datetime.now(timezone.utc)
    symbol = symbol.strip().upper()
    reason = reason.strip()
    if action not in ("add", "remove") or not SYMBOL.fullmatch(symbol):
        raise LabError("invalid universe action or ticker")
    if not reason or len(reason) > 2000:
        raise LabError("nonempty change reason (max 2000 chars) is required")
    if action == "add" and (not name or not name.strip()):
        raise LabError("new ticker must have a name")
    with conn.transaction():
        exp = conn.execute(
            "select * from experiments where name=%s for update",
            (experiment_name,),
        ).fetchone()
        if not exp:
            raise LabError("experiment missing: initialize it first")
        # Universe membership is currently shared; never silently change another experiment.
        if conn.execute("select count(*) as n from experiments").fetchone()["n"] != 1:
            raise LabError("universe edits require one isolated experiment")
        if symbol == "SPY":
            raise LabError("SPY is a fixed benchmark, not an investable ticker")
        current = conn.execute(
            "select 1 from stock_universe where symbol=%s and removed_at is null"
            " and role='investable'", (symbol,),
        ).fetchone()
        if action == "add" and current:
            raise LabError("ticker already active")
        if action == "remove" and not current:
            raise LabError("ticker not active")
        if conn.execute(
            "select 1 from universe_change_requests where experiment_id=%s"
            " and symbol=%s and status='scheduled'",
            (exp["id"], symbol),
        ).fetchone():
            raise LabError("ticker already has an unapplied change")
        effective = next_effective_session(conn, exp, now)
        change = conn.execute(
            "insert into universe_change_requests"
            " (experiment_id,action,symbol,name,sector,reason,requested_by,scheduled_at,effective_session)"
            " values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning *",
            (exp["id"], action, symbol, name, sector, reason, actor, now, effective),
        ).fetchone()
        audit(conn, actor, "universe.scheduled", "universe_change_requests",
              change["id"], {"action": action, "symbol": symbol, "reason": reason,
                              "effective_session": effective.isoformat()})
        return change


def pending_for_round(conn, experiment_id: int, session):
    return conn.execute(
        "select * from universe_change_requests where experiment_id=%s"
        " and status='scheduled' and effective_session<=%s"
        " order by effective_session,id",
        (experiment_id, session),
    ).fetchall()


def candidate_universe(conn, changes):
    rows = {r["symbol"]: r for r in active_universe(conn)}
    for change in changes:
        sym = change["symbol"]
        if change["action"] == "add":
            if sym in rows:
                raise LabError(f"scheduled ADD already active: {sym}")
            rows[sym] = {"symbol": sym, "name": change["name"],
                         "sector": change["sector"], "role": "investable"}
        else:
            if sym not in rows or rows[sym]["role"] != "investable":
                raise LabError(f"scheduled REMOVE no longer investable: {sym}")
            del rows[sym]
    return sorted(rows.values(), key=lambda row: row["symbol"])


def apply_for_round(conn, changes, round_id: int, session, actor="engine"):
    """Called only in the same transaction that marks the official round decided."""
    count = 0
    for c in changes:
        sym = c["symbol"]
        if c["action"] == "add":
            conn.execute(
                "insert into stock_universe(symbol,name,sector,role,changed_by,change_reason)"
                " values (%s,%s,%s,'investable',%s,%s)",
                (sym, c["name"], c["sector"], c["requested_by"], c["reason"]),
            )
        else:
            result = conn.execute(
                "update stock_universe set removed_at=now(),changed_by=%s,change_reason=%s"
                " where symbol=%s and role='investable' and removed_at is null",
                (c["requested_by"], c["reason"], sym),
            )
            if result.rowcount != 1:
                raise LabError("universe membership changed before round: " + sym)
        result = conn.execute(
            "update universe_change_requests set status='applied',effective_session=%s,"
            " applied_at=now(),applied_round_id=%s where id=%s and status='scheduled'",
            (session, round_id, c["id"]),
        )
        if result.rowcount != 1:
            raise LabError("change already applied: " + sym)
        audit(conn, actor, "universe.applied", "universe_change_requests", c["id"],
              {"action": c["action"], "symbol": sym,
               "effective_session": session.isoformat(),
               "round_id": round_id, "reason": c["reason"]})
        count += 1
    return count
