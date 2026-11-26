import json
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from ail import cli
from ail.common import DataIntegrityError
from ail.market_data import IngestionBlocked, _integrity_issue
from ail.sources import NHQuoteSource, _NHRefetchError, _NHRequestError


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


def test_persistent_invalid_refetch_keeps_both_dates_and_numeric_observations():
    row = {"trade_date": "20261125", "open_prc": "142.49", "high": "142.27",
           "low": "138.3003", "close_prc": "140.29", "movolume": "12609",
           "credential": "must-not-appear"}
    samples = iter([{"Output_1": [row]},
                    {"Output_1": [{**row, "trade_date": "20261124", "high": "142.28"}]}])
    calls = []

    def call(path, query):
        calls.append((path, query.copy()))
        return next(samples)

    with pytest.raises(_NHRefetchError) as caught:
        NHQuoteSource(call=call, sleep=lambda _: None).daily_bars("MRK", date(2026, 11, 25), 10)
    issue = _integrity_issue("MRK", "nh_plug", caught.value)
    assert len(calls) == 2 and calls[0] == calls[1]
    assert issue["code"] == "invalid_ohlc" and issue["refetch_reason"] == "still_invalid"
    observations = issue["observations"]
    assert [o["attempt"] for o in observations] == ["initial", "refetch"]
    assert [o["trade_date"] for o in observations] == ["2026-11-25", "2026-11-24"]
    assert [o["ohlc"]["raw"]["high"] for o in observations] == ["142.27", "142.28"]
    assert "must-not-appear" not in json.dumps(issue) + str(caught.value)


@pytest.mark.parametrize("category,expected_category,attempts", [
    ("network", "network", 4), ("auth", "auth", 1),
    ("private-category-must-not-appear", "unknown", 1),
])
def test_failed_refetch_keeps_first_quote_and_sanitizes_request_failure(category, expected_category, attempts):
    row = {"trade_date": "20261125", "open_prc": "103", "high": "102", "low": "99",
           "close_prc": "101", "movolume": 1000}
    calls = []

    class ProviderError(Exception):
        pass

    def call(*_):
        calls.append(1)
        if len(calls) == 1:
            return {"Output_1": [row]}
        error = ProviderError("private-response-must-not-appear")
        error.category = category
        raise error

    with pytest.raises(_NHRefetchError) as caught:
        NHQuoteSource(call=call, sleep=lambda _: None).daily_bars("MRK", date(2026, 11, 25), 10)
    issue = _integrity_issue("MRK", "nh_plug", caught.value)
    assert len(calls) == 1 + attempts
    assert issue["request_category"] == expected_category
    assert issue["refetch_reason"] == "request_failed"
    assert issue["observations"][0]["ohlc"]["raw"]["open_prc"] == "103"
    assert len(issue["observations"]) == 1
    assert "must-not-appear" not in json.dumps(issue) + str(caught.value)


def test_direct_request_failure_exposes_only_allowlisted_category():
    issue = _integrity_issue("MRK", "nh_plug", _NHRequestError("private-value-must-not-appear"))
    assert issue["code"] == "quote_request_failed" and issue["request_category"] == "unknown"
    assert "must-not-appear" not in json.dumps(issue)
