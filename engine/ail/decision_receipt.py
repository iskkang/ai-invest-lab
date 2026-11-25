"""Read-only evidence of a complete official decision round for this NYSE session."""
from datetime import date

from . import market_calendar as mc
from .config import DEFAULT_PARTICIPANTS

OFFICIAL_MODEL_IDS = frozenset(p["id"] for p in DEFAULT_PARTICIPANTS)


def decision_receipt(conn, settings, session: date) -> dict:
    row = conn.execute(
        """select r.id, r.status, r.snapshot_id, r.decision_at, r.data_as_of
           from experiment_rounds r join experiments e on e.id=r.experiment_id
           where e.name=%s and e.mode=%s and r.session_date=%s""",
        (settings.experiment_name, settings.mode, session),
    ).fetchone()
    detail = {"session": session.isoformat(), "verified": False,
              "round_id": None, "round_status": "missing", "valid_model_ids": []}
    if row is None:
        return detail
    lo = mc.ny_time(session, settings.decision_earliest)
    hi = mc.ny_time(session, settings.decision_latest)
    decisions = conn.execute(
        """select ai_model_id, status, completed_at, jsonb_typeof(parsed) as parsed_type
           from ai_decisions where round_id=%s order by ai_model_id""",
        (row["id"],),
    ).fetchall()
    valid = sorted(d["ai_model_id"] for d in decisions
                   if d["status"] == "valid" and d["parsed_type"] == "object"
                   and d["completed_at"] is not None and lo <= d["completed_at"] <= hi)
    return {**detail, "round_id": row["id"], "round_status": row["status"],
            "valid_model_ids": valid, "verified": (
                row["status"] in ("decided", "settled") and row["snapshot_id"] is not None
                and row["data_as_of"] == mc.previous_session(session)
                and lo <= row["decision_at"] <= hi and len(decisions) == 4
                and len(valid) == 4 and set(valid) == OFFICIAL_MODEL_IDS
            )}
