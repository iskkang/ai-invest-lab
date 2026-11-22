"""관리자 작업. 모든 변경은 audit_logs 에 남는다. 확정된 실험 결과는 수정하지 않는다."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from . import market_calendar as mc
from . import portfolio, stats
from .common import D, LabError, sha256
from .db import audit
from .market_data import build_market_payload


def set_model(conn, ai_id: str, model_id: str, actor: str, reason: str) -> None:
    if model_id.startswith("~"):
        raise LabError("auto-updating alias models are not allowed")
    if not reason.strip():
        raise LabError("reason is required")
    with conn.transaction():
        cur = conn.execute("select * from model_versions where ai_model_id=%s and effective_to is null for update",
                           (ai_id,)).fetchone()
        if cur and cur["openrouter_model_id"] == model_id:
            raise LabError("model is unchanged")
        now = datetime.now(timezone.utc)
        if cur:
            conn.execute("update model_versions set effective_to=%s where id=%s", (now, cur["id"]))
        conn.execute("insert into model_versions(ai_model_id, openrouter_model_id, effective_from, changed_by, reason)"
                     " values (%s,%s,%s,%s,%s)", (ai_id, model_id, now, actor, reason))
        audit(conn, actor, "model.change", "ai_models", ai_id,
              {"from": cur["openrouter_model_id"] if cur else None, "to": model_id, "reason": reason})


def set_status(conn, experiment: str, status: str, actor: str, reason: str) -> None:
    with conn.transaction():
        row = conn.execute("update experiments set status=%s where name=%s returning id", (status, experiment)).fetchone()
        if not row:
            raise LabError("no such experiment")
        audit(conn, actor, f"experiment.{status}", "experiments", row["id"], {"reason": reason})


def universe_add(conn, symbol, name, sector, actor, reason, experiment_name="season-1", now=None):
    from .universe import schedule_change
    return schedule_change(conn, experiment_name, "add", symbol, actor, reason,
                           name=name, sector=sector, now=now)


def universe_remove(conn, symbol, actor, reason, experiment_name="season-1", now=None):
    from .universe import schedule_change
    return schedule_change(conn, experiment_name, "remove", symbol, actor, reason,
                           now=now)


def add_corporate_action(conn, symbol, kind, ex_date: date, ratio, amount, source, note, actor,
                         price_source: str = "nh_plug"):
    if not mc.is_session(ex_date):
        raise LabError("ex_date must be an NYSE session")
    if price_source not in ("nh_plug", "demo"):
        raise LabError("price_source must be nh_plug or demo")
    with conn.transaction():
        conn.execute("insert into corporate_actions(symbol, kind, ex_date, ratio, amount, source, note, created_by, price_source)"
                     " values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                     (symbol.upper(), kind, ex_date, ratio, amount, source, note, actor, price_source))
        audit(conn, actor, "corporate_action.add", "corporate_actions", symbol.upper(),
              {"kind": kind, "ex_date": ex_date.isoformat(), "ratio": ratio, "amount": amount, "source": source, "price_source": price_source})


def verify(conn, experiment: str, source_name: str) -> list[str]:
    """읽기 전용 재검증. 기록을 바꾸지 않고 불일치만 보고한다."""
    exp = conn.execute("select * from experiments where name=%s", (experiment,)).fetchone()
    if not exp:
        raise LabError("no such experiment")
    problems: list[str] = []
    accounts = conn.execute("select * from portfolio_accounts where experiment_id=%s", (exp["id"],)).fetchall()
    for a in accounts:
        problems += portfolio.verify_account(conn, a["id"])
    # 1) 스냅샷 해시 재계산 + 같은 회차의 모든 AI 가 같은 시장 데이터를 받았는지
    rounds = conn.execute("select r.*, s.snapshot_hash, s.payload from experiment_rounds r"
                          " left join market_snapshots s on s.id=r.snapshot_id where r.experiment_id=%s", (exp["id"],)).fetchall()
    for r in rounds:
        if r["snapshot_id"] is None:
            continue
        if sha256(r["payload"]) != r["snapshot_hash"]:
            problems.append(f"round {r['id']}: snapshot hash mismatch")
        decs = conn.execute("select ai_model_id, market_hash, request_payload from ai_decisions where round_id=%s",
                            (r["id"],)).fetchall()
        for d in decs:
            if d["market_hash"] != r["snapshot_hash"] or sha256(d["request_payload"]["market"]) != r["snapshot_hash"]:
                problems.append(f"round {r['id']}: {d['ai_model_id']} received different market data")
            if d["request_payload"]["data_as_of"] >= r["session_date"].isoformat():
                problems.append(f"round {r['id']}: future data in packet")
        if r["status"] == "aborted" and conn.execute(
                "select 1 from orders where round_id=%s and status in ('PENDING','FILLED')", (r["id"],)).fetchone():
            problems.append(f"round {r['id']}: aborted round has live orders")
    # 2) 체결가 = 해당 세션 시가(원자료)
    rows = conn.execute("select t.*, p.open from trades t join portfolio_accounts a on a.id=t.account_id"
                        " left join stock_prices p on p.symbol=t.symbol and p.trade_date=t.trade_date and p.source=%s"
                        " where a.experiment_id=%s", (source_name, exp["id"])).fetchall()
    for t in rows:
        if t["open"] is None or D(t["open"]) != D(t["ref_open_price"]):
            problems.append(f"trade {t['id']}: ref open price differs from stored bar")
    # 3) 판단 시각 < 체결 세션 개장
    for r in rounds:
        open_at, _, _ = mc.session_times(r["session_date"])
        if r["decision_at"] >= open_at:
            problems.append(f"round {r['id']}: decision_at after open")
    return problems


def cost_report(conn, now: datetime) -> dict:
    ny = now.astimezone(mc.NY)
    month_start = datetime(ny.year, ny.month, 1, tzinfo=mc.NY)
    day_start = datetime(ny.year, ny.month, ny.day, tzinfo=mc.NY)
    q = ("select ai_model_id, count(*) as requests, count(*) filter (where status<>'ok') as failures,"
         " coalesce(sum(input_tokens),0) as input_tokens, coalesce(sum(output_tokens),0) as output_tokens,"
         " coalesce(sum(coalesce(cost_usd, estimated_cost_usd)),0) as cost_usd from api_usage"
         " where created_at>=%s and not is_demo group by ai_model_id order by ai_model_id")
    return {"today": conn.execute(q, (day_start,)).fetchall(), "month": conn.execute(q, (month_start,)).fetchall()}
