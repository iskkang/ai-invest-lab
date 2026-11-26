"""일일 자동 실행 흐름.

run_daily(now) — 뉴욕 08:00~09:15 사이, 거래일 D 에 실행:
  1) 미국 거래일 확인 (휴장이면 skipped)
  2) 이전 거래일 P 까지 시세 확보 + 정합성 검사
  3) P 까지의 기업행동 → 대기 주문 시가 체결 → 종가 평가 → 통계   (settle_through)
  4) P 기준 공통 스냅샷(해시) 생성
  5) 4개 AI 독립 호출 (동시, 동일 스냅샷) → 응답 검증
  6) 4개 모두 유효할 때만 D 시가 체결 대기 주문(PENDING) 생성. 하나라도 실패하면 회차 aborted.
run_settle(now) — 폐장 후 실행: 오늘 D 의 시가 체결·종가 평가를 당일에 반영.
"""
from __future__ import annotations

import concurrent.futures as cf
import time
from datetime import date, datetime, timedelta
from decimal import Decimal

from psycopg.errors import UniqueViolation

from . import market_calendar as mc
from . import portfolio, stats, universe
from .common import D, DataIntegrityError, LabError, canonical, sha256, to_jsonable
from .config import BENCHMARK_SYMBOL, DEFAULT_UNIVERSE, Settings
from .db import advisory_lock, audit, jsonb
from .decision import PROMPT_HASH, SYSTEM_PROMPT, InvalidDecision, validate
from .llm import estimate_cost, user_message
from .market_data import IngestionBlocked, active_universe, build_market_payload, ingest, store_snapshot, sync_sessions
from .settlement_receipt import settlement_receipt, settlement_symbols

BENCHMARKS = [("SPY_BUY_HOLD", "SPY 단순 매수·보유"), ("EQUAL_WEIGHT", "종목군 균등투자"), ("CASH", "현금 100%")]


# ─────────────────────────────── 초기화
def bootstrap(conn, settings: Settings, actor: str = "system") -> dict:
    """참가자·모델 버전·종목군·실험·계좌를 준비한다(이미 있으면 검증만)."""
    with conn.transaction():
        for i, p in enumerate(settings.participants()):
            conn.execute("insert into ai_models(id, display_name, color, sort_order) values (%s,%s,%s,%s)"
                         " on conflict (id) do nothing", (p["id"], p["name"], p["color"], i))
            active = conn.execute("select * from model_versions where ai_model_id=%s and effective_to is null",
                                  (p["id"],)).fetchone()
            if not active:
                conn.execute("insert into model_versions(ai_model_id, openrouter_model_id, changed_by, reason)"
                             " values (%s,%s,%s,'initial model')", (p["id"], p["model"], actor))
                audit(conn, actor, "model.init", "ai_models", p["id"], {"model": p["model"]})
            elif active["openrouter_model_id"] != p["model"]:
                raise LabError(
                    f"{p['id']}: env model {p['model']} != active {active['openrouter_model_id']}. "
                    "모델 변경은 `ail set-model` 로 기록을 남기고 하세요(자동 교체 금지).")
        if not conn.execute("select 1 from stock_universe limit 1").fetchone():
            for sym, name, sector in DEFAULT_UNIVERSE:
                conn.execute("insert into stock_universe(symbol, name, sector, role, changed_by) values (%s,%s,%s,'investable',%s)",
                             (sym, name, sector, actor))
            s, n, sec = BENCHMARK_SYMBOL
            conn.execute("insert into stock_universe(symbol, name, sector, role, changed_by) values (%s,%s,%s,'benchmark',%s)",
                         (s, n, sec, actor))
            audit(conn, actor, "universe.init", "stock_universe", None, {"count": len(DEFAULT_UNIVERSE)})
        exp = conn.execute("select * from experiments where name=%s", (settings.experiment_name,)).fetchone()
        if not exp:
            start = date.fromisoformat(settings.start_session) if settings.start_session else \
                mc.next_session(mc.ny_today())
            if not mc.is_session(start):
                raise LabError(f"start session {start} is not an NYSE session")
            exp = conn.execute(
                "insert into experiments(name, mode, start_session, initial_cash, fee_bps, slippage_bps, monthly_budget_usd)"
                " values (%s,%s,%s,%s,%s,%s,%s) returning *",
                (settings.experiment_name, settings.mode, start, D(settings.initial_cash), D(settings.fee_bps),
                 D(settings.slippage_bps), D(settings.monthly_budget_usd))).fetchone()
            audit(conn, actor, "experiment.create", "experiments", exp["id"], to_jsonable(exp))
        elif exp["mode"] != settings.mode:
            raise LabError(f"experiment '{exp['name']}' is {exp['mode']} but AIL_MODE={settings.mode}; DEMO 와 실제를 섞지 않습니다")
        # Existing immutable records may have been settled before P0 isolation.
        # Never silently continue with an already corrupted experiment.
        wrong = conn.execute(
            "select l.id from ledger_entries l"
            " join portfolio_accounts a on a.id=l.account_id"
            " join corporate_actions c on l.ref_type='corporate_action' and l.ref_id=c.id::text"
            " where a.experiment_id=%s and c.price_source<>%s limit 1",
            (exp["id"], "demo" if exp["mode"] == "demo" else "nh_plug"),
        ).fetchone()
        if wrong:
            raise LabError(f"experiment {exp['name']} has a pre-migration cross-source corporate-action "
                           f"ledger entry {wrong['id']}. Audit it and start a new experiment; do not rewrite history.")
        # Even without a holding, an unrelated split/delisting may have expired
        # an order. This creates no ledger entry, so check order history too.
        bad_expiry = conn.execute(
            "select o.id from orders o"
            " join portfolio_accounts a on a.id=o.account_id"
            " join corporate_actions c on c.symbol=o.symbol and c.ex_date=o.session_date"
            " where a.experiment_id=%s and o.status='EXPIRED'"
            " and o.reject_reason like 'CORPORATE_ACTION_ON_FILL_DATE%%'"
            " and c.price_source<>%s"
            " and not exists (select 1 from corporate_actions good"
            " where good.symbol=o.symbol and good.ex_date=o.session_date and good.price_source=%s"
            " and good.kind in ('split', 'delisting')) limit 1",
            (exp["id"], "demo" if exp["mode"] == "demo" else "nh_plug",
             "demo" if exp["mode"] == "demo" else "nh_plug"),
        ).fetchone()
        if bad_expiry:
            raise LabError(f"experiment {exp['name']} has a pre-migration cross-source corporate-action "
                           f"expired order {bad_expiry['id']}. Audit it and start a new experiment.")
        if exp["mode"] == "demo":
            from .sources import DEMO_CORPORATE_ACTIONS
            for a in DEMO_CORPORATE_ACTIONS:
                conn.execute(
                    "insert into corporate_actions(symbol, kind, ex_date, ratio, amount, source, note, created_by, price_source)"
                    " values (%s,%s,%s,%s,%s,'DEMO (synthetic)','가상 이벤트 — 실제 기업행동 아님',%s,'demo')"
                    " on conflict (symbol, kind, ex_date, price_source) do nothing",
                    (a["symbol"], a["kind"], a["ex_date"], a["ratio"], a["amount"], actor))
        for p in settings.participants():
            _ensure_account(conn, exp, "ai", p["id"], None, p["name"])
        for code, name in BENCHMARKS:
            _ensure_account(conn, exp, "benchmark", None, code, name)
    return exp


def _ensure_account(conn, exp, kind, ai_id, bench, name):
    row = conn.execute("select id from portfolio_accounts where experiment_id=%s and "
                       + ("ai_model_id=%s" if ai_id else "benchmark_code=%s"),
                       (exp["id"], ai_id or bench)).fetchone()
    if row:
        return row["id"]
    aid = conn.execute("insert into portfolio_accounts(experiment_id, kind, ai_model_id, benchmark_code, name, initial_cash)"
                       " values (%s,%s,%s,%s,%s,%s) returning id",
                       (exp["id"], kind, ai_id, bench, name, exp["initial_cash"])).fetchone()["id"]
    portfolio.post(conn, aid, "initial", "experiment", exp["id"], "", exp["initial_cash"], 0, exp["start_session"])
    return aid


# ─────────────────────────────── 체결·평가 (through 까지)
def settle_through(conn, exp: dict, source, through: date, now: datetime, settings: Settings) -> dict:
    """through(확정 거래일)까지: 시세 수집 → 기업행동 → 체결 → 평가 → 통계. 재실행해도 중복 없음."""
    expected_source = "demo" if exp["mode"] == "demo" else "nh_plug"
    if source.name != expected_source:
        raise LabError(f"{exp['name']}: {exp['mode']} experiment cannot use {source.name} prices")
    symbols = settlement_symbols(conn, exp["id"])
    sync_sessions(conn, through - timedelta(days=550), through + timedelta(days=10))
    with conn.transaction():
        report = ingest(conn, source, symbols, through, now, settings.history_bars)
    if through < exp["start_session"]:
        return {"ingest": report, "settled": []}
    settled = []
    first = exp["start_session"]
    last_valued = conn.execute(
        "select max(s.session_date) as d from portfolio_snapshots s join portfolio_accounts a on a.id=s.account_id"
        " where a.experiment_id=%s", (exp["id"],)).fetchone()["d"]
    start = mc.next_session(last_valued) if last_valued else first
    for session in mc.sessions_between(start, through):
        with conn.transaction():
            portfolio.apply_corporate_actions(conn, exp, session, source.name)
            if session == first:
                portfolio.create_benchmark_orders(conn, exp, session, source.name)
            elif conn.execute(
                "select 1 from universe_change_requests where experiment_id=%s"
                " and status='applied' and applied_round_id in"
                " (select id from experiment_rounds where experiment_id=%s and session_date=%s)"
                " limit 1", (exp["id"], exp["id"], session),
            ).fetchone():
                portfolio.rebalance_equal_weight(conn, exp, session, source.name)
            res = portfolio.settle_session(conn, exp, session, source.name)
            if res["state"] == "waiting":
                raise DataIntegrityError(res["reason"])
            portfolio.value_session(conn, exp, session, source.name)
            stats.refresh(conn, exp, session)
        settled.append({"session": session.isoformat(), **res})
    problems = [p for a in conn.execute("select id from portfolio_accounts where experiment_id=%s", (exp["id"],)).fetchall()
                for p in portfolio.verify_account(conn, a["id"])]
    if problems:
        raise LabError("ledger verification failed: " + "; ".join(problems))
    return {"ingest": report, "settled": settled}


# ─────────────────────────────── 판단 회차
def month_spend(conn, now: datetime) -> Decimal:
    ny = now.astimezone(mc.NY)
    start = datetime(ny.year, ny.month, 1, tzinfo=mc.NY)
    row = conn.execute("select coalesce(sum(coalesce(cost_usd, estimated_cost_usd)),0) as c from api_usage"
                       " where created_at>=%s and not is_demo", (start,)).fetchone()
    return D(row["c"])


def _packet(conn, exp, account, participant_id, session, data_as_of, decision_at, market, market_hash):
    aid = account["id"]
    cash = portfolio.cash_of(conn, aid)
    last_close = {r["symbol"]: Decimal(str(r["last_close"])) for r in market["investable"]}
    holdings = []
    equity = cash
    for sym, h in portfolio.holdings_of(conn, aid).items():
        px = last_close.get(sym)
        if px is None:  # 투자 대상에서 빠진 보유 종목: 저장된 마지막 종가
            row = conn.execute("select close from stock_prices where symbol=%s and source=%s and trade_date<=%s"
                               " and fetched_at<=%s order by trade_date desc limit 1",
                               (sym, market["source"], data_as_of, decision_at)).fetchone()
            px = D(row["close"]) if row else Decimal(0)
        mv = px * h["qty"]
        equity += mv
        holdings.append({"symbol": sym, "quantity": h["qty"], "avg_cost": float(h["avg_cost"]), "last_close": float(px),
                         "market_value": float(round(mv, 2))})
    for h in holdings:
        h["weight"] = round(h["market_value"] / float(equity), 4) if equity else None
    # 자기 자신의 과거 기록만(다른 AI 정보 없음). 체결가는 판단 이후의 정보이므로 과거 체결만 포함.
    past = conn.execute(
        "select r.session_date, d.status, d.parsed->>'summary' as summary from ai_decisions d"
        " join experiment_rounds r on r.id=d.round_id where d.ai_model_id=%s and r.experiment_id=%s"
        " and r.session_date<%s order by r.session_date desc limit 5",
        (participant_id, exp["id"], session)).fetchall()
    trades = conn.execute(
        "select trade_date, symbol, side, quantity, price, fee, realized_pnl from trades"
        " where account_id=%s and trade_date<=%s order by trade_date desc, id desc limit 30",
        (aid, data_as_of)).fetchall()
    orders = conn.execute(
        "select session_date, symbol, side, quantity, status, reject_reason from orders"
        " where account_id=%s and session_date<=%s and status in ('REJECTED','EXPIRED')"
        " order by session_date desc limit 10", (aid, data_as_of)).fetchall()
    return to_jsonable({
        "participant_id": participant_id,
        "decision_at": decision_at.isoformat(),
        "session_date": session.isoformat(),
        "data_as_of": data_as_of.isoformat(),
        "market_snapshot_hash": market_hash,
        "rules": {
            "fill": "next regular-session open of session_date, with slippage; integer shares",
            "initial_cash_usd": exp["initial_cash"], "max_position_weight": exp["max_position_weight"],
            "fee_bps": exp["fee_bps"], "slippage_bps": exp["slippage_bps"],
            "short_selling": False, "leverage": False, "margin": False,
        },
        "account": {"cash": float(cash), "equity_at_last_close": float(round(equity, 2)), "holdings": holdings},
        "own_recent_decisions": [dict(r) for r in past],
        "own_trade_history": [dict(r) for r in trades],
        "own_rejected_orders": [dict(r) for r in orders],
        "market": market,
    })


def run_decision_round(conn, exp: dict, session: date, now: datetime, source_name: str, provider,
                       settings: Settings) -> dict:
    """session 시가 체결을 위한 판단 회차. 동일 세션 회차는 한 번만 만들어진다(UNIQUE)."""
    round_started = time.monotonic()
    cutoff_at = mc.ny_time(session, settings.decision_latest)
    expected_source = "demo" if exp["mode"] == "demo" else "nh_plug"
    if source_name != expected_source:
        raise LabError(f"{exp['name']}: {exp['mode']} experiment cannot use {source_name} prices")
    data_as_of = mc.previous_session(session)
    existing = conn.execute("select * from experiment_rounds where experiment_id=%s and session_date=%s",
                            (exp["id"], session)).fetchone()
    if existing:
        return {"round_id": existing["id"], "status": existing["status"], "note": "already exists (no re-run)"}
    open_at, _, _ = mc.session_times(session)
    if now >= open_at:
        raise LabError("decision after market open is not allowed (fill price would be known)")
    if now > cutoff_at:
        raise LabError(f"decision after {settings.decision_latest} ET cutoff is not allowed")
    changes = universe.pending_for_round(conn, exp["id"], session)
    candidates = universe.candidate_universe(conn, changes) if changes else None
    with conn.transaction():
        rnd = conn.execute("insert into experiment_rounds(experiment_id, session_date, decision_at, data_as_of, status)"
                           " values (%s,%s,%s,%s,'created') returning *", (exp["id"], session, now, data_as_of)).fetchone()
    rid = rnd["id"]

    def abort(reason):
        conn.execute("update experiment_rounds set status='aborted', abort_reason=%s where id=%s", (reason, rid))
        audit(conn, "engine", "round.aborted", "experiment_rounds", rid, {"reason": reason})
        return {"round_id": rid, "status": "aborted", "reason": reason}

    if exp["status"] != "running":
        return abort(f"experiment {exp['status']}")
    try:
        market = build_market_payload(conn, source_name, data_as_of, now,
                                      universe_rows=candidates) if changes else build_market_payload(
                                          conn, source_name, data_as_of, now)
    except DataIntegrityError as exc:
        return abort(f"DATA_INTEGRITY: {exc}")
    snap_id, market_hash = store_snapshot(conn, market, data_as_of, now)
    conn.execute("update experiment_rounds set snapshot_id=%s, status='deciding' where id=%s", (snap_id, rid))

    participants = conn.execute(
        "select m.id as ai_id, v.id as version_id, v.openrouter_model_id as model, a.id as account_id"
        " from ai_models m join model_versions v on v.ai_model_id=m.id and v.effective_to is null"
        " join portfolio_accounts a on a.ai_model_id=m.id and a.experiment_id=%s order by m.sort_order",
        (exp["id"],)).fetchall()
    packets = {}
    for p in participants:
        acct = {"id": p["account_id"]}
        packets[p["ai_id"]] = _packet(conn, exp, acct, p["ai_id"], session, data_as_of, now, market, market_hash)

    # 예산 사전 확인: 이번 회차 전체(4개) 추정비용이 월 예산을 넘으면 아무도 호출하지 않는다.
    try:
        prices = provider.prices([p["model"] for p in participants])
    except Exception as exc:
        return abort(f"BUDGET_PREFLIGHT: pricing unavailable ({type(exc).__name__})")
    estimates = {}
    for p in participants:
        chars = len(SYSTEM_PROMPT) + len(user_message(packets[p["ai_id"]]))
        price = prices[p["model"]]
        if price.context_length and chars // 3 + settings.max_output_tokens > price.context_length:
            return abort(f"CONTEXT_LIMIT: {p['model']}")
        estimates[p["ai_id"]] = estimate_cost(price, chars, settings.max_output_tokens)
    spent = month_spend(conn, now)
    if not provider.is_demo and spent + sum(estimates.values()) > D(exp["monthly_budget_usd"]):
        return abort(f"BUDGET_BLOCK: month {spent} + round {sum(estimates.values()):.4f} > {exp['monthly_budget_usd']}")

    decision_ids = {}
    with conn.transaction():
        for p in participants:
            pk = packets[p["ai_id"]]
            decision_ids[p["ai_id"]] = conn.execute(
                "insert into ai_decisions(round_id, ai_model_id, model_version_id, requested_model, prompt_hash,"
                " market_hash, request_payload) values (%s,%s,%s,%s,%s,%s,%s) returning id",
                (rid, p["ai_id"], p["version_id"], p["model"], PROMPT_HASH, market_hash, jsonb(pk))).fetchone()["id"]

    # 4개 AI 동시 호출 — 같은 시각, 같은 스냅샷, 같은 파라미터
    with cf.ThreadPoolExecutor(max_workers=len(participants)) as pool:
        futures = {p["ai_id"]: pool.submit(provider.decide, p["model"], packets[p["ai_id"]],
                                           settings.max_output_tokens, settings.llm_timeout_seconds)
                   for p in participants}
        results = {}
        for ai_id, fut in futures.items():
            try:
                results[ai_id] = fut.result(timeout=settings.llm_timeout_seconds + 30)
            except Exception as exc:  # 어댑터 예외도 '실패'로 기록
                from .llm import LLMResult
                results[ai_id] = LLMResult("error", error=f"adapter exception: {type(exc).__name__}")

    validated, failures = {}, []
    for p in participants:
        ai_id = p["ai_id"]
        res = results[ai_id]
        status, parsed, error = "error", None, res.error
        if res.status == "ok":
            acct_pk = packets[ai_id]["account"]
            ctx = {
                "participant_id": ai_id, "data_as_of": data_as_of.isoformat(),
                "investable": {r["symbol"]: Decimal(str(r["last_close"])) for r in market["investable"]},
                "marks": {h["symbol"]: Decimal(str(h["last_close"])) for h in acct_pk["holdings"]},
                "cash": Decimal(str(acct_pk["cash"])),
                "holdings": {h["symbol"]: h["quantity"] for h in acct_pk["holdings"]},
                "max_weight": exp["max_position_weight"], "fee_bps": exp["fee_bps"],
                "slippage_bps": exp["slippage_bps"],
            }
            try:
                v = validate(res.content, ctx)
                validated[ai_id] = v
                status, parsed, error = "valid", v.parsed, None
            except InvalidDecision as exc:
                status, error = "invalid", str(exc)
        if status != "valid":
            failures.append(f"{ai_id}: {status} ({error})")
        with conn.transaction():
            conn.execute(
                "update ai_decisions set status=%s, returned_model=%s, raw_response=%s, parsed=%s, error=%s,"
                " input_tokens=%s, output_tokens=%s, cost_usd=%s, latency_ms=%s, completed_at=now() where id=%s",
                (status, res.returned_model, res.content, jsonb(parsed) if parsed else None, error,
                 res.input_tokens, res.output_tokens, res.cost_usd, res.latency_ms, decision_ids[ai_id]))
            conn.execute(
                "insert into api_usage(decision_id, ai_model_id, model, status, input_tokens, output_tokens,"
                " estimated_cost_usd, cost_usd, is_demo, invalid_response_count, retry_count)"
                " values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (decision_ids[ai_id], ai_id, p["model"], res.status, res.input_tokens, res.output_tokens,
                 estimates[ai_id], res.cost_usd, provider.is_demo,
                 max(res.invalid_response_count, int(status == "invalid")), res.retry_count))

    if failures:
        return abort("PARTICIPANT_FAILURE: " + "; ".join(failures))

    # A round may start inside the allowed window but finish after the cutoff.
    # The passed `now` is the start timestamp (also used in historical tests),
    # so advance it by monotonic elapsed time rather than reading the wall clock.
    completed_at = now + timedelta(seconds=max(0, time.monotonic() - round_started))
    if completed_at > cutoff_at:
        return abort(f"DECISION_CUTOFF_EXCEEDED: completed after {settings.decision_latest} ET; excluded from official performance")

    try:
        with conn.transaction():
            # Only publish a universe change alongside an accepted official round.
            # Aborted rounds leave requests scheduled for the next valid session.
            universe.apply_for_round(conn, changes, rid, session)
            for p in participants:
                for intent in validated[p["ai_id"]].orders:
                    rejected = intent.status == "REJECTED"
                    conn.execute(
                        "insert into orders(round_id, account_id, decision_id, session_date, symbol, side, quantity,"
                        " status, reject_reason, resolved_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (rid, p["account_id"], decision_ids[p["ai_id"]], session, intent.symbol, intent.side,
                         intent.quantity, intent.status, intent.reject_reason, now if rejected else None))
            conn.execute("update experiment_rounds set status='decided' where id=%s", (rid,))
            if not conn.execute("select 1 from orders where round_id=%s and status='PENDING'", (rid,)).fetchone():
                # 모두 HOLD 이거나 사전 거부만 있으면 체결할 것이 없다
                conn.execute("update experiment_rounds set status='settled', settled_at=now() where id=%s", (rid,))
    except Exception as exc:
        # A failed queue application or order commit must not strand a deciding round.
        # The transaction rolls back both membership edits and the benchmark trigger.
        return abort(f"ROUND_COMMIT_FAILED: {type(exc).__name__}")
    return {"round_id": rid, "status": "decided", "snapshot_hash": market_hash,
            "orders": {k: len(v.orders) for k, v in validated.items()}}


# ─────────────────────────────── 작업 단위
def _job(conn, name: str, key: str, fn):
    try:
        jid = conn.execute("insert into job_runs(job_name, run_key, status) values (%s,%s,'running') returning id",
                           (name, key)).fetchone()["id"]
    except UniqueViolation:
        return {"status": "duplicate", "note": f"{name}:{key} already running or succeeded"}
    try:
        detail = fn()
        status = detail.pop("_status", "succeeded") if isinstance(detail, dict) else "succeeded"
        conn.execute("update job_runs set status=%s, finished_at=now(), detail=%s where id=%s",
                     (status, jsonb(detail), jid))
        return {"status": status, **(detail or {})}
    except Exception as exc:
        failure = {"error": f"{type(exc).__name__}: {exc}"}
        if isinstance(exc, IngestionBlocked):
            # Ingest has rolled back. Keep all quote-only findings in the job
            # record so the next diagnosis is not limited to the first symbol.
            failure["market_data"] = exc.detail
        conn.execute("update job_runs set status='failed', finished_at=now(), detail=%s where id=%s",
                     (jsonb(failure), jid))
        raise


def run_daily(conn, settings: Settings, source, provider, now: datetime) -> dict:
    """판단 작업. 재실행해도 같은 세션 회차를 다시 만들지 않는다."""
    started = time.monotonic()
    today = mc.ny_today(now)

    def clock_now():
        # Keep the supplied clock usable in tests while counting setup and lock waits.
        return now + timedelta(seconds=max(0, time.monotonic() - started))
    with advisory_lock(conn, "ail.daily"):
        exp = bootstrap(conn, settings)

        def body():
            if not mc.is_session(today):
                return {"_status": "skipped", "reason": f"{today} is not an NYSE session"}
            local = clock_now().astimezone(mc.NY)
            lo, hi = mc.ny_time(today, settings.decision_earliest), mc.ny_time(today, settings.decision_latest)
            if not (lo <= local <= hi):
                return {"_status": "skipped", "reason": f"outside decision window {settings.decision_earliest}-{settings.decision_latest} ET"}
            prev = mc.previous_session(today)
            out = {"settle": settle_through(conn, exp, source, prev, now, settings)}
            if today < exp["start_session"]:
                out["round"] = {"status": "not started", "start_session": exp["start_session"].isoformat()}
            else:
                fresh = conn.execute("select * from experiments where id=%s", (exp["id"],)).fetchone()
                decision_now = clock_now()
                if decision_now > hi:
                    return {**out, "_status": "skipped",
                            "reason": "decision cutoff passed during pre-decision preparation"}
                out["round"] = run_decision_round(conn, fresh, today, decision_now, source.name, provider, settings)
            return out

        return _job(conn, "daily_decision", today.isoformat(), body)


class InvalidSettlementSession(LabError):
    """The requested recovery date is invalid or has not finished trading."""


def run_settle(conn, settings: Settings, source, now: datetime,
               expected_session: str | None = None) -> dict:
    """Settle today's session, or an explicitly requested closed session.

    An explicit recovery date changes only the target date, never the actual
    clock used for close validation or the timestamp on newly fetched prices.
    """
    target = mc.ny_today(now)
    if expected_session is not None:
        try:
            parsed = date.fromisoformat(expected_session)
        except (TypeError, ValueError):
            raise InvalidSettlementSession("settlement session must use YYYY-MM-DD") from None
        if parsed.isoformat() != expected_session:
            raise InvalidSettlementSession("settlement session must use YYYY-MM-DD")
        target = parsed
        if target > mc.ny_today(now):
            raise InvalidSettlementSession("settlement session is in the future")
    try:
        is_session = mc.is_session(target)
    except ValueError:
        raise InvalidSettlementSession("settlement session is outside the supported calendar") from None
    if not is_session:
        if expected_session is not None:
            raise InvalidSettlementSession("settlement session is not an NYSE trading day")
        return {"status": "skipped", "reason": "holiday", "session": target.isoformat()}
    if not mc.after_close(target, now):
        if expected_session is not None:
            raise InvalidSettlementSession("settlement session has not reached close plus 60 minutes")
        return {"status": "skipped", "reason": "market not closed yet", "session": target.isoformat()}

    # Reject invalid, future, holiday, and unclosed targets before any mutation.
    with advisory_lock(conn, "ail.daily"):
        exp = bootstrap(conn, settings)

        def body():
            detail = settle_through(conn, exp, source, target, now, settings)
            receipt = settlement_receipt(conn, settings, target)
            return {"_status": "succeeded" if receipt["verified"] else "failed",
                    "settle": detail, "settlement_receipt": receipt}

        result = _job(conn, "post_close_settle", target.isoformat(), body)
        if "settlement_receipt" not in result:
            # A job label is not evidence of saved bars and all seven valuations.
            result["settlement_receipt"] = settlement_receipt(conn, settings, target)
        return {**result, "session": target.isoformat()}
