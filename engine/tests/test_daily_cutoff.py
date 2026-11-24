"""Scheduler safety using an injected clock; no DB, pricing, or provider calls."""
from contextlib import nullcontext
from datetime import datetime, timezone
from types import SimpleNamespace

from ail import pipeline


def test_prep_crosses_cutoff_without_starting_decision(monkeypatch):
    ticks = iter([0, 0, 20])
    monkeypatch.setattr(pipeline.time, "monotonic", lambda: next(ticks))
    monkeypatch.setattr(pipeline, "advisory_lock", lambda *args: nullcontext())
    today = datetime(2026, 11, 24, 14, 14, 50, tzinfo=timezone.utc)
    exp = {"start_session": today.date(), "id": 1}
    monkeypatch.setattr(pipeline, "bootstrap", lambda *args: exp)
    monkeypatch.setattr(pipeline, "settle_through", lambda *args: {"settled": []})
    monkeypatch.setattr(pipeline, "_job", lambda conn, name, key, fn: fn())
    monkeypatch.setattr(pipeline, "run_decision_round", lambda *a: (_ for _ in ()).throw(
        AssertionError("should not start a late decision")))
    conn = SimpleNamespace(execute=lambda *a: SimpleNamespace(fetchone=lambda: exp))
    out = pipeline.run_daily(conn, SimpleNamespace(decision_earliest="08:00", decision_latest="09:15"),
                             SimpleNamespace(name="nh_plug"), None, today)
    assert out["_status"] == "skipped"
    assert "pre-decision preparation" in out["reason"]
    assert "round" not in out
