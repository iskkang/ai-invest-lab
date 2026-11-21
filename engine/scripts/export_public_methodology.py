"""Export a public methodology manifest from the actual Python source, without API calls."""
from __future__ import annotations
import argparse
import ast
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[2]
ENGINE=ROOT/"engine"/"ail"
sys.path.insert(0,str(ROOT/"engine"))
from ail.config import DEFAULT_PARTICIPANTS,DEFAULT_UNIVERSE,Settings  # noqa: E402

def read(filename):
    return (ENGINE/filename).read_text(encoding="utf-8")

def grab(text,pattern,label):
    m=re.search(pattern,text)
    if not m: raise ValueError("Unable to verify "+label)
    return m.group(1)

def periods(src,label,fn):
    a=re.findall(r'"'+label+r'(\d+)":\s*_r\('+fn+r'\(closes,\s*(\d+)\)\)',src)
    if not a or any(x!=y for x,y in a): raise ValueError("Unverified indicator periods "+label)
    return [int(x) for x,y in a]

def thresholds(src):
    wanted={"MIN_VOL_OBS","MIN_SHARPE_OBS","MIN_WINRATE_SELLS"}
    output={}
    for node in ast.parse(src).body:
        if isinstance(node,ast.Assign) and isinstance(node.value,ast.Constant):
            for target in node.targets:
                if isinstance(target,ast.Name) and target.id in wanted:
                    output[target.id]=node.value.value
    if set(output)!=wanted: raise ValueError("Unverified performance thresholds")
    return output

def fields(src):
    fn=next(n for n in ast.parse(src).body if isinstance(n,ast.FunctionDef) and n.name=="compute")
    returned=next(n for n in ast.walk(fn) if isinstance(n,ast.Return) and isinstance(n.value,ast.Dict))
    names=[n.value for n in returned.value.keys if isinstance(n,ast.Constant)]
    if len(names)<18 or len(names)!=len(returned.value.keys):raise ValueError("Unverified indicators")
    return names

def to_kst(hhmm,month):
    h,m=map(int,hhmm.split(":"))
    return datetime(2026,month,15,h,m,tzinfo=ZoneInfo("America/New_York")).astimezone(ZoneInfo("Asia/Seoul")).strftime("%H:%M")

def manifest():
    with patch.dict(os.environ,{},clear=True):
        cfg=Settings()
    ind=read("indicators.py");cal=read("market_calendar.py");market=read("market_data.py")
    llm=read("llm.py");pipeline=read("pipeline.py");decision=read("decision.py")
    st=thresholds(read("stats.py"))
    if 'xc.get_calendar("XNYS")' not in cal or "if not mc.is_session(today)" not in pipeline or '"daily_decision", today.isoformat()' not in pipeline:
        raise ValueError("Cannot confirm NYSE session scheduling")
    if not all(token in llm for token in ['"temperature": 0','"max_tokens": max_output_tokens','"content": SYSTEM_PROMPT']) or "settings.max_output_tokens" not in pipeline or "PROMPT_HASH = sha256" not in decision:
        raise ValueError("Cannot confirm shared LLM parameter sources")
    if 'if model.startswith("anthropic/")' not in llm or 'body.pop("response_format", None)' not in llm:
        raise ValueError("Unverified Claude structured output exception")
    target=grab(cal,r'return ny_time\(d, "(\d\d:\d\d)"\)',"decision target")
    rs=periods(ind,"ret_", "momentum") if False else re.findall(r'"ret_(\d+)d":\s*_r\(momentum\(closes,\s*(\d+)\)\)',ind)
    if not rs or any(a!=b for a,b in rs): raise ValueError("Unverified return windows")
    macd=re.search(r'def macd\(values: Sequence\[float\], fast=(\d+), slow=(\d+), signal=(\d+)\)',ind)
    if not macd: raise ValueError("Unverified MACD defaults")
    rsi=int(grab(ind,r'"rsi14":\s*_r\(rsi\(closes,\s*(\d+)\)',"RSI"))
    vol=int(grab(ind,r'"volatility_(\d+)d_ann":\s*_r\(volatility\(closes,\s*\d+\)\)',"volatility"))
    dd=int(grab(ind,r'window\s*=\s*closes\[-(\d+):\]',"drawdown lookback"))
    vc=int(grab(ind,r'"volume_change_(\d+)d":\s*_r\(volume_change\(volumes,\s*\d+\)\)',"volume"))
    hl=int(grab(ind,r'"high_(\d+)d":\s*_r\(max\(highs\[-\d+:\]\)\)',"price extremes"))
    cl=int(grab(market,r'ind\["closes_last_(\d+)"\]\s*=\s*\[round',"recent closes"))
    if f"closes[-{cl}:]" not in market or f'"low_{hl}d"' not in ind or "math.sqrt(252)" not in ind:
        raise ValueError("Unverified lookbacks or annualization")
    names=fields(ind)+[f"closes_last_{cl}"]
    if len(names)!=len(set(names)):raise ValueError("Duplicate indicators")
    return {
        "source":"Python engine source; configuration defaults (runtime overrides may differ)",
        "models":[{"id":p["id"],"name":p["name"],"model":p["model"]} for p in DEFAULT_PARTICIPANTS],
        "universe":[p[0] for p in DEFAULT_UNIVERSE],
        "decision":{
            "targetET":target,"earliestET":cfg.decision_earliest,"cutoffET":cfg.decision_latest,
            "targetKST_EDT":to_kst(target,7),"targetKST_EST":to_kst(target,1),
            "earliestKST_EDT":to_kst(cfg.decision_earliest,7),
            "cutoffKST_EDT":to_kst(cfg.decision_latest,7),
            "earliestKST_EST":to_kst(cfg.decision_earliest,1),
            "cutoffKST_EST":to_kst(cfg.decision_latest,1),
            "calendar":"XNYS","frequency":"once_per_nyse_session",
        },
        "execution":{"initialCashUsd":cfg.initial_cash,"feeBps":cfg.fee_bps,"slippageBps":cfg.slippage_bps},
        "inference":{"temperature":0,"maxTokens":cfg.max_output_tokens,"sharedSystemPrompt":True,
                     "participantSpecificUserPacket":True,"claudeJsonSchemaRequestException":True},
        "statistics":{"minVolatilityObservations":st["MIN_VOL_OBS"],"minSharpeObservations":st["MIN_SHARPE_OBS"],
                      "minRealizedSellsForWinRate":st["MIN_WINRATE_SELLS"]},
        "indicators":{"fields":names,"returnDays":[int(a) for a,b in rs],
                      "smaDays":periods(ind,"sma","sma"),"emaDays":periods(ind,"ema","ema"),
                      "rsiDays":rsi,"macdFast":int(macd.group(1)),"macdSlow":int(macd.group(2)),
                      "macdSignal":int(macd.group(3)),"volatilityDays":vol,
                      "annualizationSessions":252,"maxDrawdownDays":dd,
                      "volumeChangeDays":vc,"highLowDays":hl,"recentClosesDays":cl},
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--check",action="store_true")
    ap.add_argument("output",nargs="?",default=str(ROOT/"web"/"lib"/"engine-methodology.generated.json"))
    args=ap.parse_args()
    expected=manifest()
    dest=Path(args.output)
    if args.check:
        if not dest.exists() or json.loads(dest.read_text(encoding="utf-8"))!=expected:
            print("FAIL: methodology snapshot out of sync with Python engine",file=sys.stderr)
            return 1
        print("PASS: methodology snapshot matches Python engine source.")
        return 0
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(expected,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Exported",dest)
    return 0

if __name__=="__main__":
    raise SystemExit(main())
