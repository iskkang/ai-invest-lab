from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from ail import cli

NOW = datetime(2026, 11, 26, 5, 5, tzinfo=timezone.utc)


def setup_cli(monkeypatch):
    settings = SimpleNamespace(database_url="unused", validate=lambda: None, is_demo=False, mode="live")
    monkeypatch.setattr(cli, "Settings", lambda: settings)
    monkeypatch.setattr(cli, "connect", lambda _: object())
    monkeypatch.setattr(cli, "datetime", SimpleNamespace(now=lambda _: NOW))
    monkeypatch.setattr(cli, "_source_provider", lambda _: (object(), object()))
    monkeypatch.delenv("AIL_EXPECTED_SESSION", raising=False)


def test_cli_passes_explicit_settlement_date_without_changing_now(monkeypatch, capsys):
    setup_cli(monkeypatch)
    monkeypatch.setenv("AIL_EXPECTED_SESSION", "2026-11-25")
    def settle(conn, settings, source, now, expected_session=None):
        assert now is NOW and expected_session == "2026-11-25"
        return {"status": "succeeded", "settlement_receipt": {"verified": True}}
    monkeypatch.setattr(cli, "run_settle", settle)
    assert cli.main(["run-settle"]) == 0
    assert '"verified": true' in capsys.readouterr().out


@pytest.mark.parametrize("status, verified, code", [
    ("succeeded", True, 0), ("succeeded", False, 1), ("duplicate", True, 0), ("duplicate", False, 1),
])
def test_cli_settlement_exit_requires_saved_evidence(monkeypatch, capsys, status, verified, code):
    setup_cli(monkeypatch)
    monkeypatch.setenv("AIL_EXPECTED_SESSION", "2026-11-25")
    monkeypatch.setattr(cli, "run_settle", lambda *a, **k: {
        "status": status, "settlement_receipt": {"verified": verified}})
    assert cli.main(["run-settle"]) == code
    assert '"settlement_receipt"' in capsys.readouterr().out


def test_cli_default_holiday_is_expected_skip(monkeypatch, capsys):
    setup_cli(monkeypatch)
    assert cli.main(["run-settle"]) == 0
    assert '"reason": "holiday"' in capsys.readouterr().out


@pytest.mark.parametrize("target", ["bad-date", "20261125", "2026-11-26", "2026-11-27"])
def test_cli_invalid_explicit_recovery_is_rejected(monkeypatch, capsys, target):
    setup_cli(monkeypatch)
    monkeypatch.setenv("AIL_EXPECTED_SESSION", target)
    assert cli.main(["run-settle"]) == 1
    result = capsys.readouterr().out
    assert '"status": "rejected"' in result and '"verified": false' in result


def test_cli_pre_start_ingestion_succeeds_with_its_explicit_phase(monkeypatch, capsys):
    setup_cli(monkeypatch)
    monkeypatch.setattr(cli, "run_settle", lambda *a, **k: {
        "status": "succeeded", "settlement_receipt": {
            "verified": True, "phase": "pre_start_ingestion", "expected_valuation_count": 0}})
    assert cli.main(["run-settle"]) == 0
    assert '"phase": "pre_start_ingestion"' in capsys.readouterr().out


def test_scheduled_settlement_targets_latest_closed_session_across_midnight():
    from ail import market_calendar as mc
    from datetime import date

    friday = date(2026, 11, 27)
    assert mc.latest_settleable_session(mc.ny_time(friday, "13:40")) == date(2026, 11, 25)
    assert mc.latest_settleable_session(mc.ny_time(friday, "17:30")) == friday
    assert mc.latest_settleable_session(mc.ny_time(date(2026, 11, 28), "06:20")) == friday
    assert mc.latest_settleable_session(mc.ny_time(date(2026, 11, 30), "08:00")) == friday
