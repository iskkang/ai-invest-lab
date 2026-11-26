import json
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from ail import cli
from ail.common import DataIntegrityError
from ail.market_data import IngestionBlocked, _integrity_issue
from ail.sources import NHQuoteSource


@pytest.mark.parametrize("command,receipt", [("run-daily", "official_round"),
                                            ("run-settle", "settlement_receipt")])
def test_cli_reports_all_blockers_and_never_claims_success(monkeypatch, capsys, command, receipt):
    settings = SimpleNamespace(database_url="unused", validate=lambda: None, is_demo=False)
    monkeypatch.setattr(cli, "Settings", lambda: settings)
    monkeypatch.setattr(cli, "connect", lambda _: object())
    monkeypatch.setattr(cli, "datetime", SimpleNamespace(
        now=lambda _: datetime(2026, 11, 25, 13, 17, tzinfo=timezone.utc)))
    monkeypatch.setattr(cli, "_source_provider", lambda _: (object(), object()))
    monkeypatch.delenv("AIL_EXPECTED_SESSION", raising=False)
    issues = [{"symbol": s, "code": code, "message": f"{s}: quote invalid"}
              for s, code in (("COST", "stored_bar_revision"), ("MRK", "invalid_ohlc"))]

    def blocked(*args, **kwargs):
        raise IngestionBlocked("nh_plug", date(2026, 11, 25), issues, 31)

    monkeypatch.setattr(cli, command.replace("-", "_"), blocked)
    assert cli.main([command]) == 1
    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "blocked" and result[receipt]["verified"] is False
    assert result["market_data"]["issues"] == issues
    assert result["market_data"]["committed_bars"] == 0


def test_invalid_ohlc_diagnostics_keep_numeric_evidence_only():
    # Synthetic malformed tuple, plus an unrelated response value that must not leak.
    row = {"trade_date": "20261125", "open_prc": "103", "high": "102", "low": "99",
           "close_prc": "101", "movolume": 1000, "credential": "must-not-appear"}
    with pytest.raises(DataIntegrityError) as caught:
        NHQuoteSource.parse_row("MRK", row)
    issue = _integrity_issue("MRK", "nh_plug", caught.value)
    assert issue["code"] == "invalid_ohlc" and issue["trade_date"] == "2026-11-25"
    assert issue["ohlc"]["raw"]["open_prc"] == "103"
    assert "must-not-appear" not in json.dumps(issue)
