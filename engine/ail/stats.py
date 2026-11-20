"""성과 지표. 표본이 부족하면 값을 만들지 않고 None + 사유를 남긴다."""
from __future__ import annotations

import math
from datetime import date
from decimal import Decimal

from .common import D
from .db import jsonb

MIN_VOL_OBS = 20      # 변동성
MIN_SHARPE_OBS = 60   # 샤프(무위험수익률 0 가정, 연환산)
MIN_WINRATE_SELLS = 5


def _f(x):
    return None if x is None else float(x)


def compute(equities: list[float], initial: float, trades: list[dict], holdings: list[dict], cash: float) -> dict:
    s: dict = {"observations": len(equities)}
    rets = [b / a - 1 for a, b in zip([initial] + equities[:-1], equities) if a > 0]
    equity = equities[-1] if equities else initial
    s["equity"] = equity
    s["cash"] = cash
    s["holdings_value"] = equity - cash
    s["cash_weight"] = cash / equity if equity else None
    s["cum_return"] = equity / initial - 1
    s["daily_return"] = rets[-1] if rets else None
    s["weekly_return"] = (equities[-1] / equities[-6] - 1) if len(equities) >= 6 else None
    s["monthly_return"] = (equities[-1] / equities[-22] - 1) if len(equities) >= 22 else None
    peak, mdd = initial, 0.0
    for e in equities:
        peak = max(peak, e)
        mdd = min(mdd, e / peak - 1)
    s["max_drawdown"] = mdd
    notes = []
    if len(rets) >= MIN_VOL_OBS:
        m = sum(rets) / len(rets)
        sd = math.sqrt(sum((r - m) ** 2 for r in rets) / (len(rets) - 1))
        s["volatility_ann"] = sd * math.sqrt(252)
        if sd == 0:
            s["sharpe"] = None
            notes.append("sharpe: 수익률 변동 없음")
        elif len(rets) < MIN_SHARPE_OBS:
            s["sharpe"] = None
            notes.append(f"sharpe: 표본 부족({len(rets)}/{MIN_SHARPE_OBS})")
        else:
            s["sharpe"] = m / sd * math.sqrt(252)
    else:
        s["volatility_ann"] = None
        s["sharpe"] = None
        notes.append(f"volatility/sharpe: 표본 부족({len(rets)}/{MIN_VOL_OBS})")
    sells = [t for t in trades if t["side"] == "SELL" and t["realized_pnl"] is not None]
    s["realized_pnl"] = sum(float(t["realized_pnl"]) for t in sells)
    s["unrealized_pnl"] = sum(float(h["unrealized_pnl"]) for h in holdings)
    s["trade_count"] = len(trades)
    if len(sells) >= MIN_WINRATE_SELLS:
        s["win_rate"] = sum(1 for t in sells if float(t["realized_pnl"]) > 0) / len(sells)
    else:
        s["win_rate"] = None
        notes.append(f"win_rate: 매도 표본 부족({len(sells)}/{MIN_WINRATE_SELLS})")
    weights = [float(h["market_value"]) / equity for h in holdings] if equity else []
    s["max_position_weight"] = max(weights) if weights else 0.0
    s["hhi"] = sum(w * w for w in weights)
    s["positions"] = len(holdings)
    s["notes"] = notes
    return s


def refresh(conn, exp: dict, as_of: date) -> int:
    n = 0
    for a in conn.execute("select * from portfolio_accounts where experiment_id=%s", (exp["id"],)).fetchall():
        table = "portfolio_snapshots" if a["kind"] == "ai" else "benchmark_snapshots"
        snaps = conn.execute(f"select * from {table} where account_id=%s and session_date<=%s order by session_date",
                             (a["id"], as_of)).fetchall()
        if not snaps:
            continue
        trades = conn.execute("select side, realized_pnl from trades where account_id=%s and trade_date<=%s",
                              (a["id"], as_of)).fetchall()
        last = snaps[-1]
        holdings = last.get("holdings") or []
        st = compute([float(x["equity"]) for x in snaps], float(D(a["initial_cash"])), trades, holdings, float(last["cash"]))
        conn.execute("insert into performance_stats(account_id, as_of, stats) values (%s,%s,%s)"
                     " on conflict (account_id, as_of) do update set stats=excluded.stats, created_at=now()",
                     (a["id"], last["session_date"], jsonb(st)))
        n += 1
    return n
