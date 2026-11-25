"""Manual single-round intraday experiment. No broker orders, DB or official scores."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
import time

from . import market_calendar as mc
from .common import D, LabError, canonical, cents, fee_amount, sha256, slipped_price
from .config import Settings
from .decision import SYSTEM_PROMPT, validate
from .llm import OpenRouterProvider, estimate_cost, user_message
from .sources import NH_PERIOD_PATH, NHQuoteSource

SYMBOLS = ("SPY", "QQQ", "DIA", "IWM")
STEP = timedelta(minutes=5)
CASH = D(100_000)
MAX_WEIGHT = D("0.20")
FEE = D("1")
SLIPPAGE = D("5")
MAX_TOKENS = 1000
COST_CAP = D("0.15")
PROMPT = SYSTEM_PROMPT.replace(
    "You have no news, no internet, no intraday data, and no information about other participants.",
    "You have only the supplied regular-session intraday features. No news, internet or other model decisions."
).replace(
    "Orders execute at the NEXT regular-session OPEN (session_date). That price is unknown to you and may gap.",
    "Paper orders may execute at the first regular-session five-minute bar open strictly after all model "
    "decisions have been recorded. The fill price is unknown to you. This is an isolated test with a fresh account."
).replace('["rsi14", "sma50", ...]', '["return_from_open_pct", "return_last_10m_pct", ...]')


def utc_now():
    return datetime.now(mc.UTC)


def floor5(dt):
    return dt.replace(minute=dt.minute // 5 * 5, second=0, microsecond=0)


def pick_cutoff(now, slot):
    td = mc.ny_today(now)
    if not mc.is_session(td):
        return None
    opening, closing, _ = mc.session_times(td)
    windows = {"open": opening + STEP * 2, "morning": mc.ny_time(td, "11:00"),
               "afternoon": mc.ny_time(td, "14:00"), "preclose": closing - STEP * 3}
    cutoff = floor5(now) if slot == "now" else windows[slot].astimezone(mc.UTC)
    # Allow startup jitter, never backdate a missed slot or squeeze in after cutoff.
    if not opening + 2 * STEP <= cutoff <= closing - 2 * STEP or not cutoff <= now < cutoff + STEP:
        return None
    return opening, closing, cutoff


class FeedGridError(LabError):
    def __init__(self, symbol, diagnostics):
        super().__init__(f"{symbol}: no complete start-labeled regular-session grid at cutoff")
        self.diagnostics = diagnostics


def completed_session(now):
    day = mc.ny_today(now)
    if not mc.is_session(day) or not mc.after_close(day, now, buffer_minutes=0):
        day = mc.previous_session(day)
    return day, *mc.session_times(day)[:2]


class NHIntradaySource(NHQuoteSource):
    def _minute_rows(self, symbol, opening, historical=False):
        day = mc.ny_today(opening)
        data = self._request(NH_PERIOD_PATH, {
            "iem_cd": symbol, "end_dt": day.strftime("%Y%m%d"), "count": "0100",
            "maxavg": "0", "gubun": "2", "xtick": "0005", "today_cls": "0" if historical else "1", "market_cls": "1",
        })
        rows = data.get("Output_1") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            raise LabError(f"{symbol}: missing NH 5-minute rows")
        return rows

    def diagnostic(self, symbol, opening, cutoff, rows):
        day = mc.ny_today(opening).strftime("%Y%m%d")
        dates, today = set(), []
        for row in rows:
            if not isinstance(row, dict):
                continue
            date = str(row.get("trade_date", ""))
            if date.isascii() and date.isdigit() and len(date) == 8:
                dates.add(date)
            label = str(row.get("trade_time", "")).zfill(6)
            if date == day and label.isascii() and label.isdigit() and len(label) == 6:
                today.append(label)
        labels = set(today)
        def hhmmss(t):
            return t.astimezone(mc.NY).strftime("%H%M%S")
        expect = [opening + STEP * i for i in range((cutoff - opening) // STEP)]
        start_missing = [hhmmss(t) for t in expect if hhmmss(t) not in labels]
        end_missing = [hhmmss(t + STEP) for t in expect if hhmmss(t + STEP) not in labels]
        return {"symbol": symbol, "rows_returned": len(rows), "session_rows": len(today),
                "session_first_label_et": min(today, default=None), "session_last_label_et": max(today, default=None),
                "latest_returned_date": max(dates, default=None), "expected": len(expect),
                "missing_if_start": len(start_missing), "missing_if_end": len(end_missing),
                "first_missing_start_et": start_missing[:3], "first_missing_end_et": end_missing[:3],
                "duplicate_labels": len(today) - len(labels)}

    def historical_probe(self, now):
        day, opening, closing = completed_session(now)
        checks = [self.diagnostic(s, opening, closing, self._minute_rows(s, opening, historical=True))
                  for s in SYMBOLS]
        return {"status": "historical_feed_diagnostic", "observed_session": day,
                "model_calls": 0, "feed_diagnostics": checks}

    def bars(self, symbol, opening, closing):
        day = mc.ny_today(opening)
        rows = self._minute_rows(symbol, opening)
        if not hasattr(self, "_last_rows"):
            self._last_rows = {}
        self._last_rows[symbol] = rows
        bars = {}
        for row in rows:
            if str(row["trade_date"]) != day.strftime("%Y%m%d"):
                continue
            hhmmss = str(row["trade_time"]).zfill(6)
            if not hhmmss.isdigit() or len(hhmmss) != 6:
                raise LabError(f"{symbol}: invalid NH time")
            # NH documents extended-hours stamps >= 24:00. These are never regular bars.
            if int(hhmmss[:2]) >= 24:
                continue
            start = datetime.strptime(day.strftime("%Y%m%d") + hhmmss, "%Y%m%d%H%M%S"
                                      ).replace(tzinfo=mc.NY).astimezone(mc.UTC)
            if not opening <= start < closing:
                continue
            if start != floor5(start) or start in bars:
                raise LabError(f"{symbol}: NH minute grid invalid")
            o, h, l, c, v = (D(row[k]) for k in ("open_prc", "high", "low", "close_prc", "movolume"))
            if not (0 < l <= min(o, c) <= max(o, c) <= h) or v < 0 or v != int(v):
                raise LabError(f"{symbol}: NH minute OHLCV invalid")
            bars[start] = (o, h, l, c, int(v))
        return bars


def market_snapshot(source, opening, closing, cutoff):
    starts = [opening + i * STEP for i in range((cutoff - opening) // STEP)]
    observed = {s: source.bars(s, opening, closing) for s in SYMBOLS}
    features, confirmed = [], {}
    for symbol, bars in observed.items():
        # Only start-labeled grids anchored at the regular-session open are supported.
        # If the provider returns end labels, gaps, or stale data, stop rather than guessing.
        if not all(x in bars for x in starts):
            if isinstance(source, NHIntradaySource):
                diagnostics = [source.diagnostic(s, opening, cutoff, source._last_rows[s]) for s in SYMBOLS]
                raise FeedGridError(symbol, diagnostics)
            raise LabError(f"{symbol}: no complete start-labeled regular-session grid at cutoff")
        rows = [bars[x] for x in starts]
        confirmed[symbol] = [list(row) for row in rows]
        o, h, l, c, v = rows[-1]
        features.append({"symbol": symbol, "last_close": c,
                         "return_from_open_pct": (c / rows[0][0] - 1).quantize(D("0.000001")) * 100,
                         "return_last_10m_pct": (c / rows[-2][0] - 1).quantize(D("0.000001")) * 100,
                         "session_range_pct": ((max(r[1] for r in rows) / min(r[2] for r in rows)) - 1
                                               ).quantize(D("0.000001")) * 100,
                         "volume_vs_earlier_bar_avg": ((D(v) * (len(rows) - 1) / sum(r[4] for r in rows[:-1])
                                                         ).quantize(D("0.0001"))
                                                        if sum(r[4] for r in rows[:-1]) else None)})
    return {"source": "nh_plug", "as_of": cutoff.isoformat(), "investable": features,
            "bar_count_per_symbol": len(starts),
            "bars_sha256": sha256({"start": opening, "end": cutoff, "bars": confirmed})}


def quote_opens(source, opening, closing, fill_at, now):
    if not opening <= fill_at or fill_at + STEP > closing or now < fill_at + STEP:
        raise LabError("prospective fill bar is not complete in the same regular session")
    prices = {}
    for symbol in SYMBOLS:
        bar = source.bars(symbol, opening, closing).get(fill_at)
        if bar is None or bar[4] <= 0:
            raise LabError(f"{symbol}: exact future execution bar has no confirmed trades")
        prices[symbol] = bar[0]
    return prices


def paper_settle(intents, opens):
    cash, holdings, fills = CASH, {}, []
    for intent in intents:
        symbol, side, qty = intent.symbol, intent.side, intent.quantity
        if intent.status != "PENDING":
            fills.append({"symbol": symbol, "status": "rejected", "reason": intent.reject_reason.split(" (")[0]})
            continue
        mark = opens[symbol]
        px = slipped_price(mark, side, SLIPPAGE)
        gross = px * qty
        fee = fee_amount(gross, FEE)
        equity = cash + sum(opens[s] * q for s, q in holdings.items())
        held = holdings.get(symbol, 0)
        if side == "SELL" and qty <= held:
            cash += gross - fee
            holdings[symbol] = held - qty
        elif side == "BUY" and gross + fee <= cash and mark * (held + qty) <= (
            equity - (px - mark) * qty - fee
        ) * MAX_WEIGHT:
            cash -= gross + fee
            holdings[symbol] = held + qty
        else:
            fills.append({"symbol": symbol, "status": "rejected", "reason": "fill_time_limit"})
            continue
        fills.append({"symbol": symbol, "side": side, "quantity": qty, "status": "simulated",
                      "cost_usd": cents(abs(mark - px) * qty + fee)})
    return fills


def run(source, slot, mode, provider_factory=OpenRouterProvider, clock=utc_now, sleep=time.sleep, journal=None):
    now = clock()
    timing = pick_cutoff(now, slot)
    receipt = {"experiment": "isolated-intraday-preview", "mode": mode, "slot": slot,
               "started_at": now, "session": mc.ny_today(now), "official_records_changed": False}
    if timing is None:
        # Only the manual no-model probe can inspect the prior session. This does not
        # prove that live intraday delivery works or create a historical decision.
        day = mc.ny_today(now)
        off_session = not mc.is_session(day) or not (
            mc.session_times(day)[0] <= now < mc.session_times(day)[1]
        )
        if mode == "probe" and slot == "now" and off_session and isinstance(source, NHIntradaySource):
            return {**receipt, **source.historical_probe(now)}
        return {**receipt, "status": "skipped_outside_slot_or_market_closed"}
    opening, closing, cutoff = timing
    market = market_snapshot(source, opening, closing, cutoff)
    mh = sha256(market)
    receipt.update(cutoff=cutoff, bars=market["bar_count_per_symbol"], market_sha256=mh)
    if mode == "probe":
        return {**receipt, "status": "data_probe_pass", "model_calls": 0}
    if mode != "models":
        raise LabError("unknown preview mode")

    # Cost gate, no fallback model, no automatic trigger and no official database.
    models = Settings().participants()
    if len({p["model"] for p in models}) != 4 or any(not p["model"] for p in models):
        raise LabError("four distinct configured model IDs are required")
    provider = provider_factory()
    prices = provider.prices([p["model"] for p in models])
    decision_at = clock().isoformat()
    packets = [{
        "participant_id": p["id"], "decision_at": decision_at, "data_as_of": cutoff.isoformat(),
        "market": market, "market_sha256": mh,
        "account": {"cash": CASH, "holdings": []},
        "rules": {"max_position_weight": MAX_WEIGHT, "fee_bps": FEE, "slippage_bps": SLIPPAGE},
    } for p in models]
    # Existing provider may retry a transport failure once; include both in estimate.
    estimate = 2 * sum(estimate_cost(prices[p["model"]], len(PROMPT) + len(user_message(packet)),
                                     MAX_TOKENS) for p, packet in zip(models, packets))
    if estimate > COST_CAP:
        raise LabError("preview cost estimate exceeds USD 0.15")
    if clock() >= min(cutoff + STEP, closing - 2 * STEP):
        return {**receipt, "status": "expired_before_model_requests", "model_calls": 0}

    def infer(pair):
        p, packet = pair
        result = provider.decide(p["model"], packet, MAX_TOKENS, 25, system_prompt=PROMPT)
        item = {"id": p["id"], "model": p["model"], "state": "invalid",
                "received_at": clock(), "inference_cost_usd": result.cost_usd}
        if result.status != "ok" or type(result.returned_model) is not str or (
            result.returned_model != p["model"] and not result.returned_model.startswith(p["model"] + "-")
        ):
            return item, []
        try:
            decision = validate(result.content, {
                "participant_id": p["id"], "data_as_of": cutoff.isoformat(),
                "investable": {r["symbol"]: r["last_close"] for r in market["investable"]},
                "cash": CASH, "holdings": {}, "max_weight": MAX_WEIGHT,
                "fee_bps": FEE, "slippage_bps": SLIPPAGE,
            })
            if decision.parsed["decision_at"] != decision_at:
                raise LabError("decision timestamp echo mismatch")
        except LabError:
            return item, []
        item.update(state="valid", decision_sha256=sha256(decision.parsed),
                    intents=[{"symbol": o.symbol, "side": o.side, "quantity": o.quantity,
                              "validation": o.status} for o in decision.orders])
        return item, decision.orders

    with ThreadPoolExecutor(max_workers=4) as pool:
        decisions = list(pool.map(infer, zip(models, packets)))
    locked_at = clock()
    fill_at = floor5(locked_at) + STEP
    receipt.update(decisions=[m for m, _ in decisions], locked_at=locked_at, estimated_max_usd=estimate)
    if any(m["state"] != "valid" for m, _ in decisions):
        return {**receipt, "status": "incomplete_models_no_fills"}
    if not any(i.status == "PENDING" for _, orders in decisions for i in orders):
        status = "all_hold" if not any(orders for _, orders in decisions) else "all_intents_rejected"
        return {**receipt, "status": status}
    if fill_at + STEP > closing:
        return {**receipt, "status": "expired_before_fill"}
    # Record the common decision lock before querying any future candle.
    receipt["fill_at"] = fill_at
    if journal is not None:
        journal({**receipt, "status": "awaiting_future_fill_bar"})
    sleep(max(0, (fill_at + STEP - clock()).total_seconds()) + 15)
    try:
        opens = quote_opens(source, opening, closing, fill_at, clock())
    except LabError:
        return {**receipt, "status": "fill_data_unconfirmed"}
    for item, intents in decisions:
        item["fills"] = paper_settle(intents, opens)
    return {**receipt, "status": "settled_simulation"}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--slot", required=True, choices=("now", "open", "morning", "afternoon", "preclose"))
    p.add_argument("--mode", choices=("probe", "models"), default="probe")
    p.add_argument("--receipt", type=Path, required=True)
    args = p.parse_args()
    try:
        out = run(NHIntradaySource(max_retries=1), args.slot, args.mode,
                  journal=lambda r: args.receipt.write_text(canonical(r) + "\n", encoding="utf-8"))
    except Exception as exc:
        # No provider response, raw prices, credentials or request dumps in public Actions.
        out = {"experiment": "isolated-intraday-preview", "status": "blocked",
               "error_type": type(exc).__name__}
        if type(exc) is LabError or type(exc) is FeedGridError:
            out["reason"] = str(exc)
        if type(exc) is FeedGridError:
            out["feed_diagnostics"] = exc.diagnostics
    args.receipt.write_text(canonical(out) + "\n", encoding="utf-8")
    print(canonical({k: v for k, v in out.items() if k not in {"decisions"}}))
    return 1 if out["status"] in {"blocked", "incomplete_models_no_fills", "fill_data_unconfirmed"} else 0


if __name__ == "__main__":
    raise SystemExit(main())
