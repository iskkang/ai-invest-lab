"""Append-only, complete provider histories for point-in-time analytical inputs.

Canonical stock_prices remain the immutable execution/valuation reference.
An analytical history always comes from one complete observed batch, so provider
price bases and volume units are never spliced across old and new observations.
"""
from __future__ import annotations

from datetime import date, datetime

from . import market_calendar as mc
from .common import DataIntegrityError, sha256, to_jsonable
from .db import jsonb


def store_price_history(conn, dataset: str, symbol: str, through: date, bars: list,
                        metadata: dict) -> int:
    """Save every observation, including a return to an earlier content hash.

    observed_at is the actual received timestamp supplied by the provider adapter.
    The caller owns the transaction; this never commits a partial ingestion batch.
    """
    observed_at = metadata.get("observed_at")
    if not isinstance(observed_at, datetime) or observed_at.tzinfo is None or observed_at.utcoffset() is None:
        raise DataIntegrityError("price history needs an aware actual observation timestamp")
    labels = {key: metadata.get(key) for key in ("provider", "basis", "volume_unit")}
    if any(not isinstance(value, str) or not value.strip() or len(value) > 120 for value in labels.values()):
        raise DataIntegrityError("price history needs provider, basis, and volume unit")
    ordered = sorted(bars, key=lambda bar: bar.trade_date)
    if not ordered or ordered[-1].trade_date != through:
        raise DataIntegrityError("price history must end on its requested completed session")
    dates = [bar.trade_date for bar in ordered]
    if dates != mc.sessions_between(dates[0], through):
        raise DataIntegrityError("price history must contain unique, contiguous NYSE sessions")
    if observed_at < mc.session_times(through)[1]:
        raise DataIntegrityError("price history was observed before its final session closed")
    for bar in ordered:
        if bar.symbol != symbol or bar.source != labels["provider"]:
            raise DataIntegrityError("price history cannot mix instruments or providers")
        bar.check()
    payload = to_jsonable([
        {"trade_date": bar.trade_date, "open": bar.open, "high": bar.high, "low": bar.low,
         "close": bar.close, "volume": bar.volume} for bar in ordered
    ])
    evidence = {key: metadata[key] for key in ("queries", "reconciliation_reason", "primary_issue")
                if key in metadata}
    # Include the economic interpretation in the digest, but not observation time.
    # Equal A hashes at two distinct times still yield two separate database rows.
    digest = sha256({"dataset": dataset, "symbol": symbol, "through": through,
                     **labels, "bars": payload})
    return conn.execute(
        "insert into price_history_batches"
        " (dataset,symbol,through_date,first_date,provider,basis,volume_unit,observed_at,"
        " bar_count,payload,payload_hash,evidence) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
        (dataset, symbol, through, dates[0], labels["provider"], labels["basis"], labels["volume_unit"],
         observed_at, len(payload), jsonb(payload), digest, jsonb(evidence)),
    ).fetchone()["id"]


def latest_price_history(conn, dataset: str, symbol: str, through: date,
                         cutoff: datetime) -> dict | None:
    """Newest complete observed batch available at cutoff, or None for legacy fallback.

    A longer batch may cover the requested date, but future rows are never rendered.
    A single returned history always has the one provider/basis/unit on its batch.
    """
    if cutoff.tzinfo is None or cutoff.utcoffset() is None:
        raise DataIntegrityError("price history cutoff must include a timezone")
    row = conn.execute(
        "select * from price_history_batches where dataset=%s and symbol=%s"
        " and observed_at<=%s and first_date<=%s and through_date>=%s"
        " order by observed_at desc,id desc limit 1",
        (dataset, symbol, cutoff, through, through),
    ).fetchone()
    if row is None:
        return None
    history = [{"date": date.fromisoformat(bar["trade_date"]),
                **{key: float(bar[key]) for key in ("open", "high", "low", "close", "volume")}}
               for bar in row["payload"] if date.fromisoformat(bar["trade_date"]) <= through]
    return {"id": row["id"], "dataset": row["dataset"], "symbol": row["symbol"],
            "through": through, "observed_at": row["observed_at"], "provider": row["provider"],
            "basis": row["basis"], "volume_unit": row["volume_unit"], "payload_hash": row["payload_hash"],
            "evidence": row["evidence"], "history": history}
