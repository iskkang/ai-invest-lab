"""One-shot real-model inference smoke test. NO database writes or paper trades.

Uses one genuine NH PLUG AAPL daily bar and asks each configured AI to return a
schema-conforming EDUCATIONAL paper-trade JSON. Not a scheduled investment round.
A conservative estimated-spend cap is checked BEFORE any paid inference begins.
Never print credentials, complete prompts, responses, or HTTP request bodies.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from decimal import Decimal

from ail import market_calendar as mc
from ail.common import D, sha256
from ail.config import Settings
from ail.decision import InvalidDecision, validate
from ail.llm import OpenRouterProvider, estimate_cost, user_message
from ail.sources import NHQuoteSource

REQUIRED = ("OPENROUTER_API_KEY", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET")
# This is a four-model connectivity/JSON test, NOT a full 30-stock trade.
MAX_OUTPUT_TOKENS = 1200
ESTIMATED_SPEND_CAP_USD = Decimal("0.15")


def main() -> int:
    missing = [k for k in REQUIRED if not os.environ.get(k)]
    if missing:
        print("MISSING secrets: " + ", ".join(missing))
        return 2

    print("AI Invest Lab — 4 real AI inference smoke test (NO DB writes, NO trades)")
    try:
        source = NHQuoteSource(max_retries=2)
        asof = mc.previous_session(mc.ny_today())
        bars = source.daily_bars("AAPL", asof, 5)
        bars = [b for b in bars if b.trade_date <= asof]
        if not bars:
            print("FAIL market data: no completed AAPL daily bar")
            return 1
        latest = bars[-1]
        if latest.trade_date != asof:
            print("FAIL market data: no AAPL bar for prior NYSE session")
            return 1
        close = float(latest.close)
        market = {
            "source": "nh_plug",
            "as_of": asof.isoformat(),
            "investable": [{
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "last_close": close,
                "ret_20d": None,
                "ret_60d": None,
                "sma20": None,
                "sma50": None,
                "sma200": None,
                "rsi14": None,
                "macd": None,
                "volatility_20d_ann": None,
                "max_drawdown_252d": None,
            }],
            "note": "Connectivity test: only one last close; indicators/history unavailable. No invented signals.",
        }
        market_hash = sha256(market)
        now = datetime.now(timezone.utc)
        session = mc.next_session(mc.ny_today())
        print(f"PASS quote source: AAPL completed daily close, as-of {asof.isoformat()}")
    except Exception as exc:
        print(f"FAIL market data: {type(exc).__name__}")
        return 1

    participants = Settings().participants()
    provider = OpenRouterProvider()
    try:
        prices = provider.prices([p["model"] for p in participants])
    except Exception as exc:
        print(f"FAIL model catalog: {type(exc).__name__}")
        return 1

    packets = {}
    cost_est = Decimal(0)
    for p in participants:
        packet = {
            "participant_id": p["id"],
            "decision_at": now.isoformat(),
            "session_date": session.isoformat(),
            "data_as_of": asof.isoformat(),
            "market_snapshot_hash": market_hash,
            "rules": {
                "fill": "next regular-session open, hypothetical only",
                "initial_cash_usd": 100000,
                "max_position_weight": 0.20,
                "fee_bps": 0,
                "slippage_bps": 5,
                "short_selling": False, "leverage": False, "margin": False,
            },
            "account": {"cash": 100000, "equity_at_last_close": 100000, "holdings": []},
            "own_recent_decisions": [],
            "own_trade_history": [],
            "own_rejected_orders": [],
            "market": market,
        }
        packets[p["id"]] = packet
        cost_est += estimate_cost(
            prices[p["model"]], len(user_message(packet)), MAX_OUTPUT_TOKENS
        )
    if cost_est > ESTIMATED_SPEND_CAP_USD:
        print(
            "STOP estimated max inference cost exceeds test cap: "
            f"${cost_est:.4f} > ${ESTIMATED_SPEND_CAP_USD}"
        )
        return 1

    print(
        f"PASS estimated cost guard: ${cost_est:.4f} / ${ESTIMATED_SPEND_CAP_USD} "
        "(estimate only; provider usage may differ)"
    )
    failures = []
    for p in participants:
        try:
            result = provider.decide(
                p["model"], packets[p["id"]], MAX_OUTPUT_TOKENS, timeout=100
            )
            if result.status != "ok" or not result.content:
                status = result.error or result.status
                # status contains only sanitized errors from the provider adapter.
                print(
                    f"FAIL {p['id']}: provider response error: "
                    f"{status[:130]}"
                )
                failures.append(p["id"])
                continue
            ctx = {
                "participant_id": p["id"],
                "data_as_of": asof.isoformat(),
                "investable": {"AAPL": D(latest.close)},
                "cash": D(100000),
                "holdings": {},
                "max_weight": D("0.20"),
                "fee_bps": D(0),
                "slippage_bps": D(5),
            }
            valid = validate(result.content, ctx)
            actual = (
                f"${result.cost_usd:.4f}"
                if result.cost_usd is not None else "not reported"
            )
            print(
                f"PASS {p['id']}: valid JSON, {len(valid.parsed['actions'])} action(s); "
                f"provider reported cost: {actual}"
            )
        except InvalidDecision as exc:
            # Avoid printing arbitrary response text embedded in schema failures.
            print(f"FAIL {p['id']}: invalid JSON/schema ({type(exc).__name__})")
            failures.append(p["id"])
        except Exception as exc:
            print(f"FAIL {p['id']}: {type(exc).__name__}")
            failures.append(p["id"])
    if failures:
        print("FAIL model smoke test: " + ", ".join(failures))
        return 1
    print("PASS all four AI models returned validated responses. NO DB writes or trades.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
