"""웹 대시보드용 읽기 전용 JSON 내보내기 (DEMO 모드 웹 데이터 / 정적 백업)."""
from __future__ import annotations

import json
from pathlib import Path

from .config import price_source_for_mode
from .common import LabError, to_jsonable


def export(conn, experiment: str, source_name: str) -> dict:
    exp = conn.execute("select * from experiments where name=%s", (experiment,)).fetchone()
    if not exp:
        raise LabError(f"experiment not found: {experiment}")
    expected_source = price_source_for_mode(exp["mode"])
    if source_name != expected_source:
        raise LabError(f"{experiment}: {exp['mode']} experiment cannot export {source_name} prices")
    accounts = conn.execute(
        "select a.*, m.display_name, m.color, v.openrouter_model_id as model from portfolio_accounts a"
        " left join ai_models m on m.id=a.ai_model_id"
        " left join model_versions v on v.ai_model_id=a.ai_model_id and v.effective_to is null"
        " where a.experiment_id=%s order by a.kind, coalesce(m.sort_order, 99), a.id", (exp["id"],)).fetchall()
    ids = [a["id"] for a in accounts]
    snaps = conn.execute(
        "select account_id, session_date, equity, cash, cum_return, daily_return, holdings from portfolio_snapshots"
        " where account_id = any(%s) union all"
        " select account_id, session_date, equity, cash, cum_return, daily_return, holdings from benchmark_snapshots"
        " where account_id = any(%s) order by 2", (ids, ids)).fetchall()
    stats = conn.execute("select distinct on (account_id) account_id, as_of, stats from performance_stats"
                         " where account_id = any(%s) order by account_id, as_of desc", (ids,)).fetchall()
    holdings = conn.execute("select * from holdings where account_id = any(%s) order by account_id, symbol", (ids,)).fetchall()
    trades = conn.execute(
        "select t.*, o.round_id, o.decision_id, r.decision_at, r.data_as_of from trades t join orders o on o.id=t.order_id"
        " left join experiment_rounds r on r.id=o.round_id where t.account_id = any(%s) order by t.trade_date desc, t.id desc",
        (ids,)).fetchall()
    orders = conn.execute("select * from orders where account_id = any(%s) and status in ('REJECTED','EXPIRED')"
                          " order by session_date desc", (ids,)).fetchall()
    rounds = conn.execute("select r.id, r.session_date, r.data_as_of, r.decision_at, r.status, r.abort_reason,"
                          " s.snapshot_hash from experiment_rounds r left join market_snapshots s on s.id=r.snapshot_id"
                          " where r.experiment_id=%s order by r.session_date desc", (exp["id"],)).fetchall()
    decisions = conn.execute(
        "select d.id, d.round_id, d.ai_model_id, d.requested_model, d.status, d.error, d.parsed, d.completed_at,"
        " r.session_date, r.data_as_of from ai_decisions d join experiment_rounds r on r.id=d.round_id"
        " where r.experiment_id=%s and d.status<>'pending' order by r.session_date desc, d.ai_model_id", (exp["id"],)).fetchall()
    symbols = sorted({t["symbol"] for t in trades} | {h["symbol"] for h in holdings} | {"SPY"}
                     | {r["symbol"] for r in conn.execute("select symbol from stock_universe where removed_at is null").fetchall()})
    # 차트용 가격은 기록된 분할로 조정한 연속 시계열(지표 계산과 동일 기준)
    from datetime import datetime, timedelta, timezone
    from .market_data import adjusted_history
    far = datetime.now(timezone.utc) + timedelta(days=1)
    since = exp["start_session"] - timedelta(days=400)
    prices = []
    for sym in symbols:
        last = conn.execute("select max(trade_date) as d from stock_prices where symbol=%s and source=%s",
                            (sym, source_name)).fetchone()["d"]
        if not last:
            continue
        for h in adjusted_history(conn, sym, source_name, last, far):
            if h["date"] >= since:
                prices.append({"symbol": sym, "trade_date": h["date"], "open": round(h["open"], 4), "high": round(h["high"], 4),
                               "low": round(h["low"], 4), "close": round(h["close"], 4), "volume": int(h["volume"])})
    universe = conn.execute("select symbol, name, sector, role from stock_universe where removed_at is null order by symbol").fetchall()
    price_map: dict = {}
    for p in prices:
        price_map.setdefault(p["symbol"], []).append(
            [p["trade_date"], p["open"], p["high"], p["low"], p["close"], p["volume"]])
    return to_jsonable({
        "experiment": exp, "accounts": accounts, "snapshots": snaps, "stats": stats, "holdings": holdings,
        "trades": trades, "rejected_orders": orders, "rounds": rounds, "decisions": decisions,
        "universe": universe, "prices": price_map,
    })


def write(conn, experiment: str, source_name: str, path: str) -> Path:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(export(conn, experiment, source_name), ensure_ascii=False), encoding="utf-8")
    return out
