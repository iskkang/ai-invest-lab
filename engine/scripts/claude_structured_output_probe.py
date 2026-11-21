"""One Claude Sonnet 5.5 json_schema test; no database writes or trading.

Makes at most ONE paid OpenRouter inference request. The quote preflight uses a
verified, completed NH PLUG AAPL daily bar. No response/prompt/price is logged.
"""
from __future__ import annotations
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal

import httpx

from ail import market_calendar as mc
from ail.common import D, sha256
from ail.config import DEFAULT_PARTICIPANTS
from ail.decision import DECISION_SCHEMA, SYSTEM_PROMPT, InvalidDecision, validate
from ail.llm import OpenRouterProvider, estimate_cost, portable_output_schema, user_message
from ail.sources import NHQuoteSource

MODEL="anthropic/claude-sonnet-5.5"
MAX_OUTPUT_TOKENS=1200
SPEND_CAP_USD=Decimal("0.06")

def main() -> int:
    if [p["model"] for p in DEFAULT_PARTICIPANTS if p["id"]=="claude"] != [MODEL]:
        print("STOP: Claude configured model ID changed; no call sent")
        return 2
    missing=[x for x in ("OPENROUTER_API_KEY","NHPLUG_APP_KEY","NHPLUG_APP_SECRET") if not os.environ.get(x)]
    if missing:
        print("STOP: missing credentials: "+", ".join(missing))
        return 2
    try:
        session=mc.previous_session(mc.ny_today())
        bars=[b for b in NHQuoteSource(max_retries=1).daily_bars("AAPL",session,5) if b.trade_date<=session]
        if not bars or bars[-1].trade_date!=session:
            print("STOP: no verified prior-session AAPL quote; no call sent")
            return 2
        close=bars[-1].close
        price=OpenRouterProvider().prices([MODEL])[MODEL]
        market={
            "source":"nh_plug","as_of":session.isoformat(),
            "investable":[{"symbol":"AAPL","name":"Apple Inc.","last_close":float(close),
                           "ret_20d":None,"ret_60d":None,"sma20":None,"sma50":None,
                           "sma200":None,"rsi14":None,"macd":None,
                           "volatility_20d_ann":None,"max_drawdown_252d":None}],
            "note":"Protocol probe: only completed daily close available; never invent indicators.",
        }
        packet={
            "participant_id":"claude","decision_at":datetime.now(timezone.utc).isoformat(),
            "session_date":mc.next_session(mc.ny_today()).isoformat(),
            "data_as_of":session.isoformat(),"market_snapshot_hash":sha256(market),
            "rules":{"fill":"next regular-session open, hypothetical only",
                     "initial_cash_usd":100000,"max_position_weight":0.20,
                     "fee_bps":0,"slippage_bps":5,
                     "short_selling":False,"leverage":False,"margin":False},
            "account":{"cash":100000,"equity_at_last_close":100000,"holdings":[]},
            "own_recent_decisions":[],"own_trade_history":[],"own_rejected_orders":[],
            "market":market,
        }
        cap=estimate_cost(price,len(user_message(packet)),MAX_OUTPUT_TOKENS)
        if cap>SPEND_CAP_USD:
            print("STOP: estimated cost above cap; no call sent")
            return 2
    except Exception as exc:
        print("STOP: preflight "+type(exc).__name__+"; no call sent")
        return 2

    body={
        "model":MODEL,
        "messages":[{"role":"system","content":SYSTEM_PROMPT},
                    {"role":"user","content":user_message(packet)}],
        "max_tokens":MAX_OUTPUT_TOKENS,"temperature":0,
        "response_format":{"type":"json_schema",
            "json_schema":{"name":"trading_decision","strict":True,
                           "schema":portable_output_schema(DECISION_SCHEMA)}},
        "provider":{"require_parameters":True},
        "usage":{"include":True},
    }
    print("PROBE: single Claude request, strict JSON schema; no PostgreSQL, no trades")
    try:
        with httpx.Client(base_url="https://openrouter.ai/api/v1",timeout=100) as client:
            response=client.post("/chat/completions",
                 headers={"Authorization":"Bearer "+os.environ["OPENROUTER_API_KEY"],
                          "Content-Type":"application/json",
                          "X-Title":"AI Invest Lab protocol check"},
                 json=body)
    except httpx.HTTPError as exc:
        print("FAIL: provider transport "+type(exc).__name__)
        return 1
    if response.status_code!=200:
        print("FAIL: HTTP "+str(response.status_code)+"; response body withheld")
        return 1
    try:
        data=response.json()
        if data.get("error"):
            print("FAIL: provider error payload")
            return 1
        if not str(data.get("model") or "").startswith(MODEL):
            print("FAIL: returned model mismatch")
            return 1
        choice=data["choices"][0]
        content=choice["message"].get("content")
        if choice.get("finish_reason") not in ("stop",None) or not isinstance(content,str):
            print("FAIL: response incomplete")
            return 1
        ctx={"participant_id":"claude","data_as_of":session.isoformat(),
             "investable":{"AAPL":D(close)},"cash":D(100000),"holdings":{},
             "max_weight":D("0.20"),"fee_bps":D(0),"slippage_bps":D(5)}
        valid=validate(content,ctx)
        print("PASS: Claude json_schema request returned fully valid local decision JSON")
        print("PASS: action count "+str(len(valid.parsed["actions"]))+"; no database writes")
        return 0
    except (KeyError,TypeError,IndexError,ValueError,InvalidDecision) as exc:
        print("FAIL: strict local validation "+type(exc).__name__)
        return 1

if __name__=="__main__":
    sys.exit(main())
