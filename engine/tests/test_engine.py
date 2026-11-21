"""필수 테스트(마스터 프롬프트 17장) — 실제 PostgreSQL 위에서 파이프라인을 실행한다."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
import psycopg
import pytest

from ail import admin, market_calendar as mc
from ail.common import D, DataIntegrityError, LabError, sha256
from ail.llm import LLMResult, OpenRouterProvider
from ail.pipeline import bootstrap, run_daily, run_decision_round, run_settle, settle_through
from ail.sources import Bar, DemoSource

from conftest import START, ScriptedProvider, at, hold_all, orders_json

NEXT = mc.next_session(START)          # 2026-11-17


def day(db, settings, source, provider, d):
    r = run_daily(db, settings, source, provider, at(d, "08:30"))
    run_settle(db, settings, source, at(d, "17:30"))
    return r


def count(db, sql, *args):
    return db.execute(sql, args).fetchone()["n"]


def acct(db, ai_id):
    return db.execute("select id from portfolio_accounts where ai_model_id=%s", (ai_id,)).fetchone()["id"]


# 1. 동일한 시세 데이터가 모든 AI 에 제공되는지
def test_01_all_ais_receive_identical_market_snapshot(db, settings, source):
    prov = ScriptedProvider()
    day(db, settings, source, prov, START)
    decs = db.execute("select ai_model_id, market_hash, request_payload from ai_decisions").fetchall()
    assert len(decs) == 4
    markets = {sha256(d["request_payload"]["market"]) for d in decs}
    assert len(markets) == 1 and {d["market_hash"] for d in decs} == markets
    snap = db.execute("select snapshot_hash, payload from market_snapshots").fetchone()
    assert sha256(snap["payload"]) == snap["snapshot_hash"] == markets.pop()
    assert len(prov.calls) == 4
    # 각 AI 패킷에는 자기 계좌만 있다(다른 AI 정보 없음)
    for model, pk in prov.calls:
        text = json.dumps(pk)
        others = {"gpt", "claude", "gemini", "deepseek"} - {pk["participant_id"]}
        assert not any(f'"participant_id": "{o}"' in text for o in others)


# 2. AI 가 미래 데이터를 참조하지 않는지
def test_02_no_future_data_in_snapshot(db, settings, source):
    exp = bootstrap(db, settings)
    prev = mc.previous_session(START)
    settle_through(db, exp, source, prev, at(prev, "18:00"), settings)
    # 판단 시점 이후에 수집된 '오늘' 봉을 심어도 스냅샷에 들어가면 안 된다
    db.execute("insert into stock_prices(symbol,trade_date,open,high,low,close,volume,source,fetched_at)"
               " values ('AAPL',%s,999,999,999,999,1,'demo',%s)", (START, at(START, "16:30")))
    res = run_decision_round(db, exp, START, at(START, "08:30"), "demo", ScriptedProvider(), settings)
    assert res["status"] == "decided"
    payload = db.execute("select payload from market_snapshots").fetchone()["payload"]
    assert payload["data_as_of"] == prev.isoformat()
    aapl = next(r for r in payload["investable"] if r["symbol"] == "AAPL")
    assert 999 not in aapl["closes_last_10"]
    pk = db.execute("select request_payload from ai_decisions limit 1").fetchone()["request_payload"]
    assert pk["data_as_of"] < pk["session_date"]
    # 개장 이후 판단 금지(시가를 알게 되므로)
    with pytest.raises(LabError, match="after market open"):
        run_decision_round(db, exp, NEXT, at(NEXT, "09:31"), "demo", ScriptedProvider(), settings)


# A decision begun before 09:15 ET must not be counted if responses finish late.
def test_02b_late_response_aborts_without_orders(db, settings, source, monkeypatch):
    from types import SimpleNamespace
    from ail import pipeline
    exp = bootstrap(db, settings)
    prev = mc.previous_session(START)
    settle_through(db, exp, source, prev, at(prev, "18:00"), settings)
    ticks = iter((0.0, 120.0))  # 09:14 ET start; simulated 09:16 ET completion
    monkeypatch.setattr(pipeline, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    result = run_decision_round(db, exp, START, at(START, "09:14"), "demo", ScriptedProvider(), settings)
    assert result["status"] == "aborted"
    assert "DECISION_CUTOFF_EXCEEDED" in result["reason"]
    assert count(db, "select count(*) as n from ai_decisions") == 4
    assert count(db, "select count(*) as n from orders") == 0
    assert count(db, "select count(*) as n from trades") == 0
    assert db.execute("select status from experiment_rounds where session_date=%s", (START,)).fetchone()["status"] == "aborted"


# 3 & 12. 동일 거래 중복 체결 없음 / 재실행해도 데이터 중복 없음
def test_03_12_rerun_is_idempotent(db, settings, source):
    prov = ScriptedProvider()
    day(db, settings, source, prov, START)
    day(db, settings, source, prov, NEXT)
    before = {t: count(db, f"select count(*) as n from {t}") for t in
              ("trades", "orders", "ledger_entries", "experiment_rounds", "ai_decisions", "portfolio_snapshots", "stock_prices")}
    calls = len(prov.calls)
    r1 = run_daily(db, settings, source, prov, at(NEXT, "08:45"))        # 같은 날 재실행
    r2 = run_settle(db, settings, source, at(NEXT, "18:30"))
    exp = db.execute("select * from experiments").fetchone()
    settle_through(db, exp, source, NEXT, at(NEXT, "19:00"), settings)  # 직접 재정산
    after = {t: count(db, f"select count(*) as n from {t}") for t in before}
    assert r1["status"] == "duplicate" and r2["status"] == "duplicate"
    assert before == after and len(prov.calls) == calls                 # AI 재호출 없음
    assert count(db, "select count(*) as n from (select order_id from trades group by order_id having count(*)>1) x") == 0


# 4. 잔액 초과 매수 차단  /  5. 보유 초과 매도 차단  /  6. 20% 비중 제한
def test_04_05_06_cash_holdings_and_weight_limits(db, settings, source):
    prov = ScriptedProvider({
        "gpt": lambda p: orders_json(p, [("AAPL", "BUY", 100000)]),                 # 현금 초과
        "claude": lambda p: orders_json(p, [("MSFT", "SELL", 5)]),                  # 보유 없음
        "gemini": lambda p: orders_json(p, [("NVDA", "BUY", _qty_for(p, "NVDA", 0.25))]),   # 25%
        "deepseek": lambda p: orders_json(p, [("KO", "BUY", _qty_for(p, "KO", 0.15))]),    # 15% OK
    })
    day(db, settings, source, prov, START)
    o = {r["ai"]: r for r in db.execute(
        "select a.ai_model_id as ai, o.* from orders o join portfolio_accounts a on a.id=o.account_id"
        " where a.kind='ai'").fetchall()}
    assert o["gpt"]["status"] == "REJECTED" and "INSUFFICIENT_CASH" in o["gpt"]["reject_reason"]
    assert o["claude"]["status"] == "REJECTED" and "SELL_EXCEEDS_HOLDINGS" in o["claude"]["reject_reason"]
    assert o["gemini"]["status"] == "REJECTED" and "MAX_WEIGHT" in o["gemini"]["reject_reason"]
    assert o["deepseek"]["status"] == "FILLED"
    for ai in ("gpt", "claude", "gemini"):
        assert count(db, "select count(*) as n from trades where account_id=%s", acct(db, ai)) == 0
    # 체결 시점 재검증: 시가 갭으로 현금이 모자라면 체결 단계에서 거부된다
    exp = db.execute("select * from experiments").fetchone()
    aid = acct(db, "gpt")
    rid = db.execute("select id from experiment_rounds where session_date=%s", (START,)).fetchone()["id"]
    db.execute("insert into experiment_rounds(experiment_id, session_date, decision_at, data_as_of, status)"
               " values (%s,%s,%s,%s,'decided')", (exp["id"], NEXT, at(NEXT, "08:30"), START))
    rid2 = db.execute("select id from experiment_rounds where session_date=%s", (NEXT,)).fetchone()["id"]
    open_px = D(source.daily_bars("AAPL", NEXT, 1)[-1].open)
    too_many = int(Decimal(100000) / open_px) + 5   # 사전 추정은 통과할 수 있어도 실제 시가로는 초과
    db.execute("insert into orders(round_id, account_id, session_date, symbol, side, quantity)"
               " values (%s,%s,%s,'AAPL','BUY',%s)", (rid2, aid, NEXT, too_many))
    run_settle(db, settings, source, at(NEXT, "17:30"))
    row = db.execute("select status, reject_reason from orders where round_id=%s", (rid2,)).fetchone()
    assert row["status"] == "REJECTED" and row["reject_reason"].startswith("INSUFFICIENT_CASH_AT_OPEN")


def _qty_for(packet, sym, weight):
    px = next(r["last_close"] for r in packet["market"]["investable"] if r["symbol"] == sym)
    return int(100000 * weight / px)


# 7. 휴장일에는 거래가 발생하지 않는지
def test_07_holiday_and_weekend_do_nothing(db, settings, source):
    prov = ScriptedProvider()
    day(db, settings, source, prov, START)
    n_trades = count(db, "select count(*) as n from trades")
    for d in (date(2026, 11, 26), date(2026, 11, 21)):          # 추수감사절, 토요일
        r = run_daily(db, settings, source, prov, at(d, "08:30"))
        assert r["status"] == "skipped"
        assert run_settle(db, settings, source, at(d, "17:30"))["status"] == "skipped"
    assert count(db, "select count(*) as n from experiment_rounds where session_date in ('2026-11-26','2026-11-21')") == 0
    assert count(db, "select count(*) as n from trades") == n_trades
    # 판단 시간대 밖(개장 후) 실행도 회차를 만들지 않는다
    assert run_daily(db, settings, source, prov, at(NEXT, "10:00"))["status"] == "skipped"


# 8. AI 응답 오류 시 부정확한 거래가 생성되지 않는지
@pytest.mark.parametrize("failure", [
    lambda p: "Sure! I would buy AAPL.",                                        # JSON 아님
    lambda p: orders_json(p, [("ZZZZ", "BUY", 1)]),                             # 없는 종목
    lambda p: LLMResult("error", error="HTTP 503"),                              # 호출 실패
])
def test_08_one_bad_ai_blocks_whole_round(db, settings, source, failure):
    prov = ScriptedProvider({"claude": failure,
                             "gpt": lambda p: orders_json(p, [("AAPL", "BUY", 10)])})
    day(db, settings, source, prov, START)
    rnd = db.execute("select * from experiment_rounds where session_date=%s", (START,)).fetchone()
    assert rnd["status"] == "aborted" and "PARTICIPANT_FAILURE" in rnd["abort_reason"]
    ai_orders = count(db, "select count(*) as n from orders where round_id=%s", rnd["id"])
    assert ai_orders == 0
    assert count(db, "select count(*) as n from trades t join portfolio_accounts a on a.id=t.account_id where a.kind='ai'") == 0
    # 성공한 모델의 응답과 실패한 요청 모두 기록
    st = {r["ai_model_id"]: r["status"] for r in db.execute("select ai_model_id, status from ai_decisions").fetchall()}
    assert st["gpt"] == "valid" and st["claude"] in ("invalid", "error")
    assert count(db, "select count(*) as n from api_usage") == 4
    # 이미 중단된 회차는 다시 호출하지 않는다
    calls = len(prov.calls)
    exp = db.execute("select * from experiments").fetchone()
    run_decision_round(db, exp, START, at(START, "08:40"), "demo", prov, settings)
    assert len(prov.calls) == calls


# 9. 데이터 오류가 가짜 수익률로 이어지지 않는지
class GapSource(DemoSource):
    def __init__(self, drop=None, revise=None, jump=None):
        super().__init__()
        self.drop, self.revise, self.jump = drop, revise, jump

    def daily_bars(self, symbol, end, count):
        bars = super().daily_bars(symbol, end, count)
        out = []
        for b in bars:
            if self.drop and (symbol, b.trade_date) == self.drop:
                continue
            if self.revise and (symbol, b.trade_date) == self.revise:
                b = Bar(b.symbol, b.trade_date, b.open, b.high, b.low, b.close + Decimal("0.5"), b.volume, b.source)
                b = Bar(b.symbol, b.trade_date, b.open, max(b.high, b.close), b.low, b.close, b.volume, b.source)
            if self.jump and (symbol, b.trade_date) == self.jump:
                o = b.open / 3
                b = Bar(b.symbol, b.trade_date, o, max(b.high, o), min(b.low, o), b.close, b.volume, b.source)
            out.append(b)
        return out


def test_09_missing_or_revised_data_stops_safely(db, settings, source):
    prov = ScriptedProvider()
    run_daily(db, settings, source, prov, at(START, "08:30"))      # 폐장 후 정산은 아직
    snaps = count(db, "select count(*) as n from portfolio_snapshots")
    # (a) 이전 거래일 봉 누락 → 판단·체결·평가 없이 실패 기록
    missing = GapSource(drop=("MSFT", START))
    with pytest.raises(DataIntegrityError, match="missing bars"):
        run_daily(db, settings, missing, prov, at(NEXT, "08:30"))
    assert count(db, "select count(*) as n from experiment_rounds where session_date=%s", NEXT) == 0
    assert count(db, "select count(*) as n from portfolio_snapshots") == snaps
    assert db.execute("select status from job_runs where job_name='daily_decision' and run_key=%s",
                      (NEXT.isoformat(),)).fetchone()["status"] == "failed"
    # (b) 공급원이 과거 봉을 사후 수정 → 덮어쓰지 않고 중단
    exp = db.execute("select * from experiments").fetchone()
    stored_day = mc.previous_session(START)                       # 이미 저장된 봉
    revised = GapSource(revise=("AAPL", stored_day))
    db.execute("delete from job_runs")
    with pytest.raises(DataIntegrityError, match="revised"):
        # 이미 저장된 봉과 다른 값을 다시 받는 상황
        from ail.market_data import _store
        bars = revised.daily_bars("AAPL", stored_day, 3)
        _store(db, "AAPL", "demo", bars, at(NEXT, "08:30"), {"inserted": 0})
    # (c) 분할로 보이는 시가 갭인데 기업행동 기록 없음 → 중단
    jump = GapSource(jump=("TSLA", NEXT))
    with pytest.raises(DataIntegrityError, match="unrecorded split"):
        settle_through(db, exp, jump, NEXT, at(NEXT, "18:00"), settings)
    # 정상 데이터로 재실행하면 이어서 진행된다(실패한 작업은 재시도 가능)
    db.execute("delete from job_runs")
    r = run_daily(db, settings, source, prov, at(NEXT, "08:50"))
    assert r["status"] == "succeeded" and r["round"]["status"] == "decided"


# 10. 주식 분할과 배당이 자산 평가에 반영되는지
def test_10_split_and_dividend(db, settings, source):
    prov = ScriptedProvider({
        "gpt": lambda p: orders_json(p, [("NVDA", "BUY", 7), ("KO", "BUY", 10)]),
        "claude": hold_all, "gemini": hold_all, "deepseek": hold_all,
    })
    day(db, settings, source, prov, START)
    aid = acct(db, "gpt")
    h0 = {r["symbol"]: r for r in db.execute("select * from holdings where account_id=%s", (aid,)).fetchall()}
    assert h0["NVDA"]["quantity"] == 7
    ex = NEXT
    admin.add_corporate_action(db, "NVDA", "split", ex, Decimal("1.5"), None, "test", "", "test", "demo")
    admin.add_corporate_action(db, "KO", "cash_dividend", ex, None, Decimal("0.50"), "test", "", "test", "demo")
    split_source = _split_source(source, "NVDA", ex, Decimal("1.5"))
    cash_before = D(db.execute("select coalesce(sum(cash_delta),0) as c from ledger_entries where account_id=%s",
                               (aid,)).fetchone()["c"])
    day(db, settings, split_source, ScriptedProvider({k: hold_all for k in ("gpt", "claude", "gemini", "deepseek")}), ex)
    h1 = {r["symbol"]: r for r in db.execute("select * from holdings where account_id=%s", (aid,)).fetchall()}
    assert h1["NVDA"]["quantity"] == 10                                    # floor(7*1.5)=10, 0.5주 현금정산
    assert D(h1["NVDA"]["avg_cost"]) == pytest.approx(D(h0["NVDA"]["avg_cost"]) / Decimal("1.5"), rel=1e-6)
    led = {r["entry_type"]: D(r["c"]) for r in db.execute(
        "select entry_type, sum(cash_delta) as c from ledger_entries where account_id=%s group by entry_type", (aid,)).fetchall()}
    assert led["dividend"] == Decimal("5.00")                               # 10주 × 0.50
    nvda_open = split_source.daily_bars("NVDA", ex, 1)[-1].open
    assert led["cash_in_lieu"] == (Decimal("0.5") * nvda_open).quantize(Decimal("0.01"))
    # 평가: 분할 후 수량 × 분할 후 종가 → 분할 자체로 자산이 급변하지 않는다
    snaps = db.execute("select session_date, equity from portfolio_snapshots where account_id=%s order by session_date",
                       (aid,)).fetchall()
    assert abs(D(snaps[-1]["equity"]) / D(snaps[-2]["equity"]) - 1) < Decimal("0.1")
    # 지표용 과거 가격은 분할 비율로 조정된다
    from ail.market_data import adjusted_history
    hist = adjusted_history(db, "NVDA", "demo", ex, at(ex, "23:00"))
    assert abs(hist[-1]["open"] / hist[-2]["close"] - 1) < 0.2
    assert not admin.verify(db, settings.experiment_name, "demo")


def _split_source(base, symbol, ex, ratio):
    class S(DemoSource):
        def daily_bars(self, sym, end, count):
            bars = base.daily_bars(sym, end, count)
            if sym != symbol:
                return bars
            return [b if b.trade_date < ex else Bar(b.symbol, b.trade_date, (b.open / ratio).quantize(Decimal("0.0001")),
                    (b.high / ratio).quantize(Decimal("0.0001")), (b.low / ratio).quantize(Decimal("0.0001")),
                    (b.close / ratio).quantize(Decimal("0.0001")), int(b.volume * ratio), b.source) for b in bars]
    return S()


# 11. API 호출 비용이 정확하게 기록되는지 + 예산 초과 시 호출 차단
def _openrouter_mock(cost="0.0123", catalog_price="0.000001"):
    seen = []

    def handler(req: httpx.Request):
        if req.url.path.endswith("/models"):
            data = [{"id": m, "context_length": 200000, "pricing": {"prompt": catalog_price, "completion": catalog_price}}
                    for m in ("openai/gpt-4.1-mini", "anthropic/claude-sonnet-5.5", "google/gemini-3.8-flash",
                              "deepseek/deepseek-v3.2")]
            return httpx.Response(200, json={"data": data})
        body = json.loads(req.content)
        seen.append(body)
        pk = json.loads(body["messages"][1]["content"])
        return httpx.Response(200, json={
            "model": body["model"], "choices": [{"finish_reason": "stop", "message": {"content": hold_all(pk)}}],
            "usage": {"prompt_tokens": 1234, "completion_tokens": 56, "cost": float(cost)}})
    client = httpx.Client(base_url="https://openrouter.ai/api/v1", transport=httpx.MockTransport(handler))
    return OpenRouterProvider(api_key="sk-or-test-SECRET", client=client, sleep=lambda s: None), seen


def test_11_api_cost_recorded_and_budget_enforced(db, settings, source):
    prov, seen = _openrouter_mock(cost="0.0123")
    day(db, settings, source, prov, START)
    rows = db.execute("select * from api_usage order by ai_model_id").fetchall()
    assert len(rows) == 4 and all(D(r["cost_usd"]) == Decimal("0.0123") for r in rows)
    assert all(r["input_tokens"] == 1234 and r["output_tokens"] == 56 and not r["is_demo"] for r in rows)
    assert all(b["temperature"] == 0 for b in seen)
    assert all(
        ("response_format" not in b if b["model"].startswith("anthropic/")
         else b["response_format"]["type"] == "json_schema")
        for b in seen
    )
    report = admin.cost_report(db, at(START, "12:00"))
    assert sum(D(r["cost_usd"]) for r in report["month"]) == Decimal("0.0492")
    # 월 예산을 거의 소진 → 다음 회차는 AI 를 한 번도 호출하지 않고 중단
    db.execute("update experiments set monthly_budget_usd=0.05")
    prov2, seen2 = _openrouter_mock(catalog_price="0.001")
    day(db, settings, source, prov2, NEXT)
    rnd = db.execute("select * from experiment_rounds where session_date=%s", (NEXT,)).fetchone()
    assert rnd["status"] == "aborted" and rnd["abort_reason"].startswith("BUDGET_BLOCK")
    assert seen2 == []
    # 모델 바꿔치기(라우팅) 감지
    def wrong_model(req):
        if req.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": []})
        body = json.loads(req.content)
        return httpx.Response(200, json={"model": "openai/gpt-4o", "choices": [{"finish_reason": "stop", "message": {"content": "{}"}}]})
    p3 = OpenRouterProvider(api_key="k", client=httpx.Client(base_url="https://x", transport=httpx.MockTransport(wrong_model)))
    r = p3.decide("openai/gpt-4.1-mini", {"participant_id": "gpt"}, 100, 5)
    assert r.status == "error" and "model mismatch" in r.error


# 13. 공개 사용자가 거래 기록을 변경할 수 없는지 (+ 엔진도 확정 기록 수정 불가)
def test_13_public_cannot_modify_and_records_are_immutable(db, settings, source):
    day(db, settings, source, ScriptedProvider({"gpt": lambda p: orders_json(p, [("AAPL", "BUY", 3)])}), START)
    tid = db.execute("select id from trades limit 1").fetchone()["id"]
    for role in ("anon", "authenticated"):
        # A private web login does not protect Supabase's public Data API.
        # Neither anon nor authenticated may read experimental trading records.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with db.transaction():
                db.execute(f"set local role {role}")
                db.execute("select count(*) as n from trades")
        for sql in ("update trades set price=1 where id=%s" % tid,
                    "delete from trades where id=%s" % tid,
                    "insert into audit_logs(actor,action,entity) values ('x','x','x')",
                    "update ai_decisions set parsed='{}'",
                    "select raw_response from ai_decisions",
                    "select request_payload from ai_decisions",
                    "select * from api_usage", "select * from audit_logs", "select * from market_snapshots"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with db.transaction():
                    db.execute(f"set local role {role}")
                    db.execute(sql)
    # 엔진(소유자)도 확정 기록은 고칠 수 없다
    for sql in ("update trades set price=1 where id=%s" % tid, "delete from ledger_entries",
                "update ai_decisions set parsed='{}'", "update market_snapshots set payload='{}'",
                "update orders set quantity=999 where status='FILLED'", "delete from experiment_rounds"):
        with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
            with db.transaction():
                db.execute(sql)


# 14. NH 및 OpenRouter API 키가 외부에 노출되지 않는지
def test_14_secrets_not_persisted(db, settings, source, monkeypatch):
    monkeypatch.setenv("NHPLUG_APP_KEY", "NH-APP-KEY-SECRET-123")
    monkeypatch.setenv("NHPLUG_APP_SECRET", "NH-APP-SECRET-456")
    prov, seen = _openrouter_mock()
    day(db, settings, source, prov, START)
    # 어떤 테이블에도 키 문자열이 남지 않는다
    tables = [r["tablename"] for r in db.execute("select tablename from pg_tables where schemaname='public'").fetchall()]
    for t in tables:
        dump = db.execute(f"select coalesce(string_agg(x::text, ''), '') as s from {t} x").fetchone()["s"]
        for secret in ("sk-or-test-SECRET", "NH-APP-KEY-SECRET-123", "NH-APP-SECRET-456"):
            assert secret not in dump, f"{secret} leaked into {t}"
    # HTTP 오류 메시지에도 본문/헤더를 담지 않는다
    def unauthorized(req):
        return httpx.Response(401, json={"error": {"message": "bad key sk-or-test-SECRET"}})
    p = OpenRouterProvider(api_key="sk-or-test-SECRET",
                           client=httpx.Client(base_url="https://x", transport=httpx.MockTransport(unauthorized)))
    r = p.decide("openai/gpt-4.1-mini", {}, 10, 5)
    assert r.error == "HTTP 401" and "SECRET" not in repr(r)


# 실험 결과 재검증(관리자) — 기록을 바꾸지 않고 불일치를 찾는다
def test_admin_verify_detects_tampering(db, settings, source):
    day(db, settings, source, ScriptedProvider(), START)
    assert admin.verify(db, settings.experiment_name, "demo") == []
    # 트리거를 우회한 조작(슈퍼유저가 했다고 가정)을 흉내: 보유수량만 바꾼다
    db.execute("update holdings set quantity=quantity+1 where account_id=(select min(account_id) from holdings)")
    assert any("holdings" in p for p in admin.verify(db, settings.experiment_name, "demo"))


def test_model_change_is_recorded_and_env_mismatch_blocks(db, settings, source, monkeypatch):
    bootstrap(db, settings)
    admin.set_model(db, "gpt", "openai/gpt-4.1", "tester", "test change")
    rows = db.execute("select * from model_versions where ai_model_id='gpt' order by id").fetchall()
    assert len(rows) == 2 and rows[0]["effective_to"] is not None and rows[1]["effective_to"] is None
    assert db.execute("select count(*) as n from audit_logs where action='model.change'").fetchone()["n"] == 1
    with pytest.raises(LabError, match="set-model"):
        bootstrap(db, settings)          # env 는 아직 gpt-4.1-mini → 조용히 바뀌지 않고 중단
    with pytest.raises(LabError, match="alias"):
        admin.set_model(db, "gpt", "~openai/gpt-latest", "tester", "x")


def test_model_response_quality_and_transient_retry_are_recorded(db, settings, source):
    """One transport retry for GPT; one invalid Claude response; zero on the rest.
    No model gets a second inference after a bad model reply.
    """
    tries = {}

    def handler(request):
        if request.url.path.endswith("/models"):
            data=[{"id":model,"context_length":200000,
                   "pricing":{"prompt":"0.0000001","completion":"0.0000001"}}
                  for model in ("openai/gpt-4.1-mini","anthropic/claude-sonnet-5.5",
                                "google/gemini-3.8-flash","deepseek/deepseek-v3.2")]
            return httpx.Response(200,json={"data":data})
        body=json.loads(request.content)
        model=body["model"]
        tries[model]=tries.get(model,0)+1
        if model=="openai/gpt-4.1-mini" and tries[model]==1:
            return httpx.Response(503,json={"error":{"message":"transient"}})
        packet=json.loads(body["messages"][1]["content"])
        content="{not valid json" if model.startswith("anthropic/") else hold_all(packet)
        return httpx.Response(200,json={
            "model":model,"choices":[{"finish_reason":"stop",
                                      "message":{"content":content}}],
            "usage":{"prompt_tokens":20,"completion_tokens":20,"cost":0.00001},
        })

    client=httpx.Client(base_url="https://openrouter.ai/api/v1",
                       transport=httpx.MockTransport(handler))
    provider=OpenRouterProvider(api_key="sk-or-test-SECRET",client=client,
                                sleep=lambda _seconds:None)
    day(db,settings,source,provider,START)
    rows={r["ai_model_id"]:r for r in
          db.execute("select ai_model_id,status,invalid_response_count,retry_count from api_usage").fetchall()}
    assert len(rows)==4
    assert rows["gpt"]["retry_count"]==1 and rows["gpt"]["invalid_response_count"]==0
    assert rows["claude"]["retry_count"]==0 and rows["claude"]["invalid_response_count"]==1
    assert rows["gemini"]["retry_count"]==0 and rows["gemini"]["invalid_response_count"]==0
    assert rows["deepseek"]["retry_count"]==0 and rows["deepseek"]["invalid_response_count"]==0
    assert tries["openai/gpt-4.1-mini"]==2
    assert tries["anthropic/claude-sonnet-5.5"]==1
    assert db.execute("select status from experiment_rounds").fetchone()["status"]=="aborted"
