from datetime import datetime, timezone
from types import SimpleNamespace

from ail import cli


def test_delayed_dispatch_does_not_run_for_a_different_day(monkeypatch, capsys):
    settings = SimpleNamespace(database_url="unused", validate=lambda: None, is_demo=False, mode="live")
    monkeypatch.setattr(cli, "Settings", lambda: settings)
    monkeypatch.setattr(cli, "connect", lambda _: object())
    monkeypatch.setattr(cli, "datetime", SimpleNamespace(now=lambda _: datetime(2026, 11, 25, 13, 17, tzinfo=timezone.utc)))
    monkeypatch.setattr(cli, "run_daily", lambda *a: (_ for _ in ()).throw(AssertionError("unexpected run")))
    monkeypatch.setenv("AIL_EXPECTED_SESSION", "2026-11-24")
    assert cli.main(["run-daily"]) == 1
    assert '"verified": false' in capsys.readouterr().out


def test_trading_day_cli_uses_receipt_not_pipeline_exit(monkeypatch, capsys):
    settings = SimpleNamespace(database_url="unused", validate=lambda: None, is_demo=False, mode="live")
    monkeypatch.setattr(cli, "Settings", lambda: settings)
    monkeypatch.setattr(cli, "connect", lambda _: object())
    monkeypatch.setattr(cli, "datetime", SimpleNamespace(now=lambda _: datetime(2026, 11, 25, 13, 17, tzinfo=timezone.utc)))
    monkeypatch.setattr(cli, "_source_provider", lambda _: (object(), object()))
    monkeypatch.setattr(cli, "run_daily", lambda *a: {"status": "succeeded", "round": {"status": "aborted"}})
    monkeypatch.setattr(cli, "decision_receipt", lambda *a: {"verified": False})
    assert cli.main(["run-daily"]) == 1
    assert '"verified": false' in capsys.readouterr().out
    monkeypatch.setattr(cli, "run_daily", lambda *a: {"status": "duplicate"})
    monkeypatch.setattr(cli, "decision_receipt", lambda *a: {"verified": True})
    assert cli.main(["run-daily"]) == 0
    assert '"verified": true' in capsys.readouterr().out
