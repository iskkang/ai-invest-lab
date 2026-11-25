from datetime import date, datetime, timezone
from types import SimpleNamespace

from ail.decision_receipt import decision_receipt

SESSION = date(2026, 11, 25)
SETTINGS = SimpleNamespace(experiment_name="test", mode="live", decision_earliest="08:00", decision_latest="09:15")
START = datetime(2026, 11, 25, 13, 30, tzinfo=timezone.utc)
END = datetime(2026, 11, 25, 14, 0, tzinfo=timezone.utc)
ROW = {"id": 62, "status": "settled", "snapshot_id": 7, "decision_at": START, "data_as_of": date(2026, 11, 24)}
DECISIONS = [{"ai_model_id": x, "status": "valid", "parsed_type": "object", "completed_at": END}
             for x in ("gpt", "claude", "gemini", "deepseek")]


def database(row, decisions):
    def select(sql, params):
        if "experiment_rounds" in sql:
            assert params == ("test", "live", SESSION)
            return SimpleNamespace(fetchone=lambda: row)
        assert "ai_decisions" in sql and params == (62,)
        return SimpleNamespace(fetchall=lambda: decisions)
    return SimpleNamespace(execute=select)


def test_four_saved_models_in_settled_all_hold_or_decided_round():
    for status in ("settled", "decided"):
        r = decision_receipt(database({**ROW, "status": status}, DECISIONS), SETTINGS, SESSION)
        assert r["verified"] and r["round_status"] == status and r["round_id"] == 62


def test_job_green_is_not_proof_of_saved_round():
    bad_cases = [
        (None, DECISIONS),
        ({**ROW, "status": "aborted"}, DECISIONS),
        (ROW, DECISIONS[:-1]),
        (ROW, DECISIONS[:-1] + [DECISIONS[0]]),
        (ROW, DECISIONS[:-1] + [{**DECISIONS[-1], "status": "invalid"}]),
        (ROW, DECISIONS[:-1] + [{**DECISIONS[-1], "parsed_type": None}]),
        (ROW, DECISIONS[:-1] + [{**DECISIONS[-1], "completed_at": END.replace(minute=16)}]),
        ({**ROW, "snapshot_id": None}, DECISIONS),
        ({**ROW, "data_as_of": SESSION}, DECISIONS),
    ]
    for row, decisions in bad_cases:
        assert decision_receipt(database(row, decisions), SETTINGS, SESSION)["verified"] is False
