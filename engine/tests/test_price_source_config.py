from types import SimpleNamespace

import pytest

from ail import admin
from ail.config import LIVE_PRICE_SOURCE, Settings, price_source_for_mode


@pytest.mark.parametrize("mode,expected", [("demo", "demo"), ("live", "reconciled_live_v1")])
def test_mode_selects_the_dataset_namespace(mode, expected):
    assert price_source_for_mode(mode) == expected
    assert Settings(mode=mode).price_source == expected


def test_invalid_mode_cannot_default_to_a_live_dataset():
    with pytest.raises(ValueError, match="mode"):
        price_source_for_mode("unknown")


@pytest.mark.parametrize("mode,source", [("live", "nh_plug"), ("live", "demo"), ("demo", LIVE_PRICE_SOURCE)])
def test_verify_rejects_wrong_dataset_before_reading_financial_records(mode, source):
    class ExperimentOnlyDB:
        def execute(self, sql, params):
            assert "from experiments" in sql and params == ("test",)
            return SimpleNamespace(fetchone=lambda: {"id": 1, "name": "test", "mode": mode})

    problems = admin.verify(ExperimentOnlyDB(), "test", source)
    assert len(problems) == 1 and "verification requires" in problems[0]
