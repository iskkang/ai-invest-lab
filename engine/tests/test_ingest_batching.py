"""Canonical validation stays intact while WAN query count is bounded by symbols."""
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from ail import market_calendar as mc
from ail.common import DataIntegrityError
from ail.config import LIVE_PRICE_SOURCE
from ail.market_data import _store
from ail.sources import Bar

AT = datetime(2026, 11, 26, 6, tzinfo=timezone.utc)


def bar(day, open_="100", close="101", high="104", low="99"):
    return Bar("TEST", day, *(Decimal(v) for v in (open_, high, low, close)),
               1000, "nh_plug", raw={"provider_value": close})


class CountStatements:
    def __init__(self, conn):
        self.conn = conn
        self.statements = []

    def execute(self, statement, params=()):
        self.statements.append(statement)
        return self.conn.execute(statement, params)


def test_full_300_bar_replay_uses_bounded_statements_and_preserves_220_old_rows(db):
    days = mc.sessions_between(date(2025, 9, 18), date(2026, 11, 25))
    assert len(days) == 300
    series = [bar(day) for day in days]
    _store(db, "TEST", LIVE_PRICE_SOURCE, series[:220], AT, {"inserted": 0})
    before = db.execute("select * from stock_prices order by trade_date").fetchall()
    counted = CountStatements(db)
    report = {"inserted": 0}

    _store(counted, "TEST", LIVE_PRICE_SOURCE, series, AT, report)

    after = db.execute("select * from stock_prices order by trade_date").fetchall()
    assert len(after) == 300 and after[:220] == before and report["inserted"] == 80
    # This guards the actual WAN timeout regression: neither 300 input rows nor
    # 80 new rows may introduce a per-row database round trip.
    assert len(counted.statements) <= 4
    assert sum(str(q).lower().startswith("insert into stock_prices") for q in counted.statements) == 1


@pytest.mark.parametrize("dataset", ["nh_plug", LIVE_PRICE_SOURCE])
def test_same_batch_identical_duplicates_remain_one_canonical_insert(db, dataset):
    original = bar(date(2026, 11, 25))
    report = {"inserted": 0}
    _store(db, "TEST", dataset, [original, original], AT, report)
    assert report["inserted"] == 1
    stored = db.execute("select * from stock_prices").fetchall()
    assert len(stored) == 1 and stored[0]["open"] == original.open


def test_same_batch_legacy_revision_still_fails_without_committing_prices(db):
    day = date(2026, 11, 25)
    with pytest.raises(DataIntegrityError) as caught:
        with db.transaction():
            _store(db, "TEST", "nh_plug", [bar(day), bar(day, open_="100.25")], AT, {"inserted": 0})
    assert caught.value.detail["changed_fields"] == ["open"]
    assert Decimal(caught.value.detail["stored"]["open"]) == 100
    assert Decimal(caught.value.detail["observed"]["open"]) == Decimal("100.25")
    assert db.execute("select count(*) as n from stock_prices").fetchone()["n"] == 0


def test_same_batch_reconciled_revision_keeps_first_canonical_value_and_reports_change(db):
    day = date(2026, 11, 25)
    report = {"inserted": 0}
    _store(db, "TEST", LIVE_PRICE_SOURCE, [bar(day), bar(day, open_="100.25")], AT, report)
    assert report["inserted"] == 1 and report["canonical_revisions"] == 1
    stored = db.execute("select * from stock_prices").fetchall()
    assert len(stored) == 1 and stored[0]["open"] == Decimal("100")
    assert stored[0]["fetched_at"] == AT


def test_batching_does_not_bypass_split_gap_validation(db):
    series = [bar(date(2026, 11, 24)),
              bar(date(2026, 11, 25), open_="200", high="204", low="198", close="201")]
    with pytest.raises(DataIntegrityError, match="unrecorded split"):
        with db.transaction():
            _store(db, "TEST", LIVE_PRICE_SOURCE, series, AT, {"inserted": 0})
    assert db.execute("select count(*) as n from stock_prices").fetchone()["n"] == 0
