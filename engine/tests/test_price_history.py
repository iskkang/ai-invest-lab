"""Complete observed series stay separate from immutable settlement prices."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from ail.common import DataIntegrityError
from ail.price_history import latest_price_history, store_price_history
from ail.sources import Bar

DATASET = "reconciled_live_v1"
THROUGH = date(2026, 11, 25)
AT = datetime(2026, 11, 26, 1, tzinfo=timezone.utc)
MIGRATION = Path(__file__).resolve().parents[2] / "supabase/migrations/20261126000007_reconciled_price_history.sql"


def bars(provider="nh_plug", close="101", volume=1000):
    return [Bar("MRK", day, Decimal("100"), Decimal("104"), Decimal("99"),
                Decimal(close), volume, provider) for day in (date(2026, 11, 24), THROUGH)]


def meta(provider="nh_plug", at=AT, unit="NH reported units"):
    return {"provider": provider, "basis": "provider_reported", "volume_unit": unit,
            "observed_at": at, "queries": [{"symbol": "MRK"}],
            "reconciliation_reason": "test observation", "unused_secret": "must-not-persist"}


def save(conn, series=None, metadata=None, dataset=DATASET):
    return store_price_history(conn, dataset, "MRK", THROUGH, series or bars(), metadata or meta())


def test_asof_preserves_a_b_a_chronology_without_rewriting_canonical_prices(db):
    db.execute("insert into stock_prices(symbol,trade_date,open,high,low,close,volume,source,fetched_at)"
               " values ('MRK',%s,100,104,99,101,1000,'nh_plug',%s)", (THROUGH, AT))
    original = db.execute("select * from stock_prices").fetchone()
    first = save(db)
    second = save(db, bars(close="102"), meta(at=AT + timedelta(hours=1)))
    third = save(db, metadata=meta(at=AT + timedelta(hours=2)))

    assert latest_price_history(db, DATASET, "MRK", THROUGH, AT - timedelta(seconds=1)) is None
    for delta, expected_id, close in ((0, first, 101), (1, second, 102), (2, third, 101)):
        batch = latest_price_history(db, DATASET, "MRK", THROUGH, AT + timedelta(hours=delta))
        assert batch["id"] == expected_id and batch["history"][-1]["close"] == close
        assert batch["provider"] == "nh_plug" and batch["volume_unit"] == "NH reported units"
        assert "unused_secret" not in batch["evidence"]
    hashes = [r["payload_hash"] for r in db.execute("select payload_hash from price_history_batches order by id")]
    assert hashes[0] == hashes[2] != hashes[1]
    assert db.execute("select * from stock_prices").fetchone() == original
    with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
        db.execute("update stock_prices set close=102 where symbol='MRK'")
    with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
        db.execute("delete from price_history_batches where id=%s", (second,))


def test_latest_series_and_view_use_one_provider_and_volume_unit_without_splicing(db):
    save(db)
    save(db, bars("nasdaq_historical", close="102", volume=1000000),
         meta("nasdaq_historical", AT + timedelta(hours=1), "shares"))
    # Another dataset cannot become the analytical source by accident.
    save(db, bars(close="103"), meta(at=AT + timedelta(hours=2)), dataset="nh_plug")
    batch = latest_price_history(db, DATASET, "MRK", THROUGH, AT + timedelta(hours=3))
    assert batch["provider"] == "nasdaq_historical" and batch["volume_unit"] == "shares"
    assert [r["volume"] for r in batch["history"]] == [1000000, 1000000]
    view = db.execute("select * from price_history_current where source=%s order by trade_date", (DATASET,)).fetchall()
    assert len(view) == 2
    assert all(r["provider"] == "nasdaq_historical" and r["volume_unit"] == "shares" for r in view)
    assert all(r["volume"] == 1000000 for r in view)
    truncated = latest_price_history(db, DATASET, "MRK", date(2026, 11, 24), AT + timedelta(hours=3))
    assert [r["date"] for r in truncated["history"]] == [date(2026, 11, 24)]
    assert latest_price_history(db, "demo", "MRK", THROUGH, AT + timedelta(hours=3)) is None


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_history_table_and_current_view_are_not_public(db, role):
    save(db)
    for relation in ("price_history_batches", "price_history_current"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with db.transaction():
                db.execute(f"set local role {role}")
                db.execute(f"select * from {relation}")


def test_batch_requires_actual_received_time_complete_sessions_and_one_provider():
    # These validations run before any SQL; a fake database must never be needed.
    with pytest.raises(DataIntegrityError, match="observation timestamp"):
        save(None, metadata={**meta(), "observed_at": AT.replace(tzinfo=None)})
    with pytest.raises(DataIntegrityError, match="final session closed"):
        save(None, metadata=meta(at=datetime(2026, 11, 25, 20, tzinfo=timezone.utc)))
    with pytest.raises(DataIntegrityError, match="contiguous"):
        save(None, series=[bars()[0], bars()[0], bars()[1]])
    with pytest.raises(DataIntegrityError, match="mix instruments or providers"):
        save(None, series=bars("nasdaq_historical"))
    bad = Bar("MRK", THROUGH, Decimal("105"), Decimal("104"), Decimal("99"), Decimal("101"), 1, "nh_plug")
    with pytest.raises(DataIntegrityError, match="inconsistent OHLC"):
        save(None, series=[bad])


def test_migration_copies_legacy_namespace_without_changing_original_rows(db):
    # Recreate the precise pre-migration schema in this isolated test database.
    db.execute("drop view price_history_current")
    db.execute("drop table price_history_batches")
    db.execute("alter table stock_prices drop column provider")
    db.execute("alter table stock_prices drop constraint stock_prices_source_check")
    db.execute("alter table stock_prices add constraint stock_prices_source_check check (source in ('nh_plug','demo'))")
    db.execute("alter table corporate_actions drop constraint corporate_actions_price_source_check")
    db.execute("alter table corporate_actions add constraint corporate_actions_price_source_check"
               " check (price_source in ('nh_plug','demo'))")
    db.execute("insert into stock_prices(symbol,trade_date,open,high,low,close,volume,source,fetched_at,raw)"
               " values ('COST',%s,100,104,99,101,1000,'nh_plug',%s,'{\"original\":true}')", (THROUGH, AT))
    db.execute("insert into stock_prices(symbol,trade_date,open,high,low,close,volume,source,fetched_at)"
               " values ('DEMO',%s,100,104,99,101,1000,'demo',%s)", (THROUGH, AT))
    db.execute("insert into corporate_actions(symbol,kind,ex_date,amount,source,created_by,price_source)"
               " values ('COST','cash_dividend',%s,1,'public-evidence','test','nh_plug')", (THROUGH,))
    before = db.execute("select * from stock_prices where source='nh_plug'").fetchone()
    with db.transaction():
        db.execute(MIGRATION.read_text())
    original = db.execute("select * from stock_prices where source='nh_plug'").fetchone()
    assert {k: original[k] for k in before} == before and original["provider"] is None
    copied = db.execute("select * from stock_prices where source=%s", (DATASET,)).fetchone()
    assert copied["symbol"] == "COST" and copied["provider"] == "nh_plug"
    for key in ("trade_date", "open", "high", "low", "close", "volume", "fetched_at"):
        assert copied[key] == before[key]
    assert copied["raw"]["provider_raw"] == before["raw"]
    assert db.execute("select count(*) as n from stock_prices where source=%s", (DATASET,)).fetchone()["n"] == 1
    actions = db.execute("select price_source,amount from corporate_actions order by price_source").fetchall()
    assert {r["price_source"] for r in actions} == {"nh_plug", DATASET}
    with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
        db.execute("update stock_prices set close=102 where source=%s", (DATASET,))
