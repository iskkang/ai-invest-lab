"""원장·모의체결·기업행동·평가.

체결 규칙(모든 계좌 동일)
- 판단 회차의 주문은 session_date 정규장 **시가**로 체결한다. 시가는 판단 이후에야 알 수 있다.
- 같은 계좌 안에서는 SELL 먼저, 같은 쪽은 종목코드 오름차순.
- 체결가 = 시가 ± 슬리피지(매수 올림·매도 내림), 수수료는 센트 올림.
- BUY: (체결금액+수수료) ≤ 현금, 체결 후 종목 평가액 ≤ 20% × 개장 시점 평가자산. 위반 시 해당 주문 REJECTED.
  (주문 수량을 엔진이 임의로 줄이지 않는다. AI 의 판단을 다른 판단으로 바꾸지 않기 위함)
- SELL: 보유 수량 초과 시 REJECTED.
- 세션의 시가가 아직 없으면 그 세션 주문 전체를 PENDING 으로 둔다(부분 체결 없음).
  더 뒤 세션의 시세가 있는데 해당 종목만 그 날 봉이 없으면(거래정지 등) EXPIRED.
- 기록된 분할이 체결일에 발생한 종목의 대기 주문은 EXPIRED (분할 전 가격 기준 판단이므로).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_FLOOR, Decimal

from . import market_calendar as mc
from .common import D, LabError, cents, fee_amount, slipped_price
from .config import price_source_for_mode
from .db import jsonb
from .market_data import bar_on, has_later_bar


# ─────────────────────────────── 원장
def post(conn, account_id, entry_type, ref_type, ref_id, symbol, cash_delta, qty_delta, effective_date) -> bool:
    cur = conn.execute(
        "insert into ledger_entries(account_id, entry_type, ref_type, ref_id, symbol, cash_delta, qty_delta, effective_date)"
        " values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing",
        (account_id, entry_type, ref_type, str(ref_id), symbol or "", cents(cash_delta), int(qty_delta), effective_date),
    )
    return cur.rowcount == 1


def cash_of(conn, account_id) -> Decimal:
    return D(conn.execute("select coalesce(sum(cash_delta),0) as c from ledger_entries where account_id=%s",
                          (account_id,)).fetchone()["c"])


def holdings_of(conn, account_id) -> dict[str, dict]:
    rows = conn.execute("select symbol, quantity, avg_cost from holdings where account_id=%s order by symbol",
                        (account_id,)).fetchall()
    return {r["symbol"]: {"qty": int(r["quantity"]), "avg_cost": D(r["avg_cost"])} for r in rows}


def _set_holding(conn, account_id, symbol, qty: int, avg_cost: Decimal) -> None:
    if qty < 0:
        raise LabError(f"negative holding {symbol}")
    if qty == 0:
        conn.execute("delete from holdings where account_id=%s and symbol=%s", (account_id, symbol))
    else:
        conn.execute(
            "insert into holdings(account_id, symbol, quantity, avg_cost, updated_at) values (%s,%s,%s,%s,now())"
            " on conflict (account_id, symbol) do update set quantity=excluded.quantity, avg_cost=excluded.avg_cost,"
            " updated_at=now()",
            (account_id, symbol, qty, avg_cost.quantize(Decimal("0.000001"))),
        )


def verify_account(conn, account_id) -> list[str]:
    """원장으로 재구성한 수량·현금이 현재 상태와 일치하는지."""
    problems = []
    rows = conn.execute(
        "select symbol, sum(qty_delta) as q from ledger_entries where account_id=%s and symbol<>'' group by symbol",
        (account_id,)).fetchall()
    from_ledger = {r["symbol"]: int(r["q"]) for r in rows if int(r["q"]) != 0}
    current = {s: h["qty"] for s, h in holdings_of(conn, account_id).items()}
    if from_ledger != current:
        problems.append(f"account {account_id}: holdings {current} != ledger {from_ledger}")
    if cash_of(conn, account_id) < 0:
        problems.append(f"account {account_id}: negative cash")
    trade_cash = D(conn.execute("select coalesce(sum(net_cash),0) as c from trades where account_id=%s",
                                (account_id,)).fetchone()["c"])
    ledger_trade_cash = D(conn.execute(
        "select coalesce(sum(cash_delta),0) as c from ledger_entries where account_id=%s and entry_type='trade'",
        (account_id,)).fetchone()["c"])
    if trade_cash != ledger_trade_cash:
        problems.append(f"account {account_id}: trades cash {trade_cash} != ledger {ledger_trade_cash}")
    return problems


# ─────────────────────────────── 기업행동
def apply_corporate_actions(conn, exp: dict, session: date, source_name: str) -> int:
    expected_source = price_source_for_mode(exp["mode"])
    if source_name != expected_source:
        raise LabError(f"{exp['name']}: {exp['mode']} experiment cannot apply {source_name} actions")
    actions = conn.execute("select * from corporate_actions where ex_date=%s and price_source=%s order by id",
        (session, source_name),).fetchall()
    accounts = conn.execute("select id from portfolio_accounts where experiment_id=%s", (exp["id"],)).fetchall()
    n = 0
    for act in actions:
        sym = act["symbol"]
        for a in accounts:
            aid = a["id"]
            h = holdings_of(conn, aid).get(sym)
            ref = act["id"]
            if act["kind"] == "split":
                _expire_pending(conn, aid, session, sym, "CORPORATE_ACTION_ON_FILL_DATE (split)")
                if not h:
                    continue
                ratio = D(act["ratio"])
                exact = Decimal(h["qty"]) * ratio
                new_qty = int(exact.to_integral_value(rounding=ROUND_FLOOR))
                frac = exact - new_qty
                if post(conn, aid, "split", "corporate_action", ref, sym, 0, new_qty - h["qty"], session):
                    n += 1
                    _set_holding(conn, aid, sym, new_qty, h["avg_cost"] / ratio)
                    if frac > 0:
                        bar = bar_on(conn, sym, source_name, session)
                        if not bar:
                            raise LabError(f"cash-in-lieu needs {sym} open on {session}")
                        post(conn, aid, "cash_in_lieu", "corporate_action", ref, sym, frac * D(bar["open"]), 0, session)
            elif act["kind"] == "cash_dividend":
                if h and post(conn, aid, "dividend", "corporate_action", ref, sym, D(act["amount"]) * h["qty"], 0, session):
                    n += 1
            elif act["kind"] == "delisting":
                _expire_pending(conn, aid, session, sym, "CORPORATE_ACTION_ON_FILL_DATE (delisting)")
                if h and post(conn, aid, "delisting", "corporate_action", ref, sym, D(act["amount"]) * h["qty"], -h["qty"], session):
                    n += 1
                    _set_holding(conn, aid, sym, 0, Decimal(0))
    return n


def _expire_pending(conn, account_id, session, symbol, reason):
    conn.execute(
        "update orders set status='EXPIRED', reject_reason=%s, resolved_at=now()"
        " where account_id=%s and session_date=%s and symbol=%s and status='PENDING'",
        (reason, account_id, session, symbol))


# ─────────────────────────────── 체결
def settle_session(conn, exp: dict, session: date, source_name: str) -> dict:
    """session 시가 체결. 반환: {'state': 'settled'|'waiting', ...}. 호출자가 트랜잭션을 연다."""
    pending = conn.execute(
        "select o.* from orders o join portfolio_accounts a on a.id=o.account_id"
        " where a.experiment_id=%s and o.session_date=%s and o.status='PENDING'"
        " order by o.account_id, (o.side<>'SELL'), o.symbol",
        (exp["id"], session)).fetchall()
    opens: dict[str, Decimal] = {}
    for o in pending:
        sym = o["symbol"]
        if sym in opens:
            continue
        bar = bar_on(conn, sym, source_name, session)
        if bar:
            opens[sym] = D(bar["open"])
        elif not has_later_bar(conn, sym, source_name, session):
            return {"state": "waiting", "reason": f"no open price yet for {sym} on {session}"}
    open_at, _, _ = mc.session_times(session)
    filled = rejected = 0
    by_account: dict[int, list[dict]] = {}
    for o in pending:
        by_account.setdefault(o["account_id"], []).append(o)
    kinds = {r["id"]: r["kind"] for r in conn.execute(
        "select id, kind from portfolio_accounts where experiment_id=%s", (exp["id"],)).fetchall()}
    for aid, orders in by_account.items():
        is_ai = kinds[aid] == "ai"   # 20% 비중 제한은 AI 참가자 규칙. 벤치마크(SPY 100%)에는 적용하지 않는다.
        cash = cash_of(conn, aid)
        hold = holdings_of(conn, aid)
        equity_open = cash + sum(Decimal(h["qty"]) * _mark_open(conn, s, source_name, session) for s, h in hold.items())
        for o in orders:
            sym, side, qty = o["symbol"], o["side"], int(o["quantity"])
            if sym not in opens:
                _resolve(conn, o["id"], "EXPIRED", "NO_OPEN_PRICE (no bar for this session)")
                rejected += 1
                continue
            ref_open = opens[sym]
            px = slipped_price(ref_open, side, exp["slippage_bps"])
            gross = cents(px * qty)
            fee = fee_amount(gross, exp["fee_bps"])
            h = hold.get(sym, {"qty": 0, "avg_cost": Decimal(0)})
            if side == "SELL":
                if qty > h["qty"]:
                    _resolve(conn, o["id"], "REJECTED", f"SELL_EXCEEDS_HOLDINGS_AT_OPEN (held {h['qty']})")
                    rejected += 1
                    continue
                net = gross - fee
                realized = cents(net - h["avg_cost"] * qty)
                new_qty, new_avg = h["qty"] - qty, h["avg_cost"]
            else:
                net = -(gross + fee)
                if -net > cash:
                    _resolve(conn, o["id"], "REJECTED", "INSUFFICIENT_CASH_AT_OPEN")
                    rejected += 1
                    continue
                weight = (Decimal(h["qty"] + qty) * ref_open) / equity_open if equity_open > 0 else Decimal(1)
                if is_ai and weight > D(exp["max_position_weight"]):
                    _resolve(conn, o["id"], "REJECTED", f"MAX_WEIGHT_AT_OPEN ({weight:.4f})")
                    rejected += 1
                    continue
                realized = None
                new_qty = h["qty"] + qty
                new_avg = (h["avg_cost"] * h["qty"] + (gross + fee)) / new_qty
            trade_id = conn.execute(
                "insert into trades(order_id, account_id, symbol, side, quantity, ref_open_price, price, gross, fee,"
                " net_cash, realized_pnl, trade_date, executed_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
                " returning id",
                (o["id"], aid, sym, side, qty, ref_open, px, gross, fee, cents(net), realized, session, open_at),
            ).fetchone()["id"]
            post(conn, aid, "trade", "trade", trade_id, sym, net, qty if side == "BUY" else -qty, session)
            _set_holding(conn, aid, sym, new_qty, new_avg)
            hold[sym] = {"qty": new_qty, "avg_cost": new_avg}
            cash += net
            _resolve(conn, o["id"], "FILLED", None)
            filled += 1
    conn.execute(
        "update experiment_rounds r set status='settled', settled_at=now()"
        " where r.experiment_id=%s and r.session_date<=%s and r.status='decided'"
        " and not exists (select 1 from orders o where o.round_id=r.id and o.status='PENDING')",
        (exp["id"], session))
    return {"state": "settled", "filled": filled, "rejected_or_expired": rejected}


def _mark_open(conn, symbol, source_name, session) -> Decimal:
    bar = bar_on(conn, symbol, source_name, session)
    if bar:
        return D(bar["open"])
    row = conn.execute("select close from stock_prices where symbol=%s and source=%s and trade_date<%s"
                       " order by trade_date desc limit 1", (symbol, source_name, session)).fetchone()
    if not row:
        raise LabError(f"no price to value {symbol}")
    return D(row["close"])


def _resolve(conn, order_id, status, reason):
    conn.execute("update orders set status=%s, reject_reason=%s, resolved_at=now() where id=%s",
                 (status, reason, order_id))


# ─────────────────────────────── 벤치마크
def create_benchmark_orders(conn, exp: dict, session: date, source_name: str) -> int:
    """벤치마크는 시작 세션 시가에 '현금으로 살 수 있는 만큼' 매수 후 보유(사전에 정한 기계적 규칙).
    AI 와 같은 비용·슬리피지를 적용한다. CASH 는 아무것도 하지 않는다."""
    n = 0
    accts = conn.execute("select * from portfolio_accounts where experiment_id=%s and kind='benchmark'",
                         (exp["id"],)).fetchall()
    for a in accts:
        if a["benchmark_code"] == "CASH":
            continue
        if conn.execute("select 1 from orders where account_id=%s limit 1", (a["id"],)).fetchone():
            continue
        if a["benchmark_code"] == "SPY_BUY_HOLD":
            targets = ["SPY"]
        else:
            targets = [r["symbol"] for r in conn.execute(
                "select symbol from stock_universe where removed_at is null and role='investable' order by symbol").fetchall()]
        budget = D(a["initial_cash"]) / len(targets)
        for sym in targets:
            bar = bar_on(conn, sym, source_name, session)
            if not bar:
                raise LabError(f"benchmark init needs {sym} open on {session}")
            px = slipped_price(D(bar["open"]), "BUY", exp["slippage_bps"])
            unit = px * (1 + D(exp["fee_bps"]) / 10000)
            qty = int((budget / unit).to_integral_value(rounding=ROUND_FLOOR))
            # 올림 수수료 때문에 1주 초과할 수 있으면 줄인다
            while qty > 0 and cents(px * qty) + fee_amount(cents(px * qty), exp["fee_bps"]) > budget:
                qty -= 1
            if qty > 0:
                conn.execute("insert into orders(round_id, account_id, session_date, symbol, side, quantity)"
                             " values (null,%s,%s,%s,'BUY',%s)", (a["id"], session, sym, qty))
                n += 1
    return n



def rebalance_equal_weight(conn, exp: dict, session: date, source_name: str) -> int:
    """Rebalance only the equal-weight benchmark at the open of the effective round.

    The benchmark, unlike AI participants, follows a mechanical target-weight rule.
    SPY buy-and-hold and cash benchmarks never rebalance. Requests are idempotent.
    """
    claimed = conn.execute(
        "insert into universe_rebalance_runs(experiment_id,session_date)"
        " values (%s,%s) on conflict do nothing returning session_date",
        (exp["id"], session),
    ).fetchone()
    if not claimed:
        return 0
    account = conn.execute(
        "select * from portfolio_accounts where experiment_id=%s"
        " and benchmark_code='EQUAL_WEIGHT'", (exp["id"],),
    ).fetchone()
    if not account:
        raise LabError("equal-weight benchmark account missing")
    aid = account["id"]
    existing = holdings_of(conn, aid)
    targets = [r["symbol"] for r in conn.execute(
        "select symbol from stock_universe where role='investable'"
        " and removed_at is null order by symbol"
    ).fetchall()]
    if not targets:
        raise LabError("cannot rebalance benchmark to an empty universe")
    symbols = sorted(set(existing) | set(targets))
    opens = {sym: _mark_open(conn, sym, source_name, session) for sym in symbols}
    equity = cash_of(conn, aid) + sum(
        D(existing[sym]["qty"]) * opens[sym] for sym in existing
    )
    budget = equity / len(targets)
    fee_rate = D(exp["fee_bps"]) / 10000
    desired = {}
    for sym in targets:
        buy_price = slipped_price(opens[sym], "BUY", exp["slippage_bps"])
        desired[sym] = int((budget / (buy_price * (1 + fee_rate)))
                           .to_integral_value(rounding=ROUND_FLOOR))
    n = 0
    # All sell orders settle before buys, preserving the cash-only benchmark.
    for sym in symbols:
        current = existing.get(sym, {}).get("qty", 0)
        target = desired.get(sym, 0)
        delta = target - current
        if not delta:
            continue
        conn.execute(
            "insert into orders(round_id,account_id,session_date,symbol,side,quantity)"
            " values (null,%s,%s,%s,%s,%s)",
            (aid, session, sym, "BUY" if delta > 0 else "SELL", abs(delta)),
        )
        n += 1
    return n


# ─────────────────────────────── 평가
def value_session(conn, exp: dict, session: date, source_name: str) -> int:
    accts = conn.execute("select * from portfolio_accounts where experiment_id=%s order by id", (exp["id"],)).fetchall()
    n = 0
    for a in accts:
        table = "portfolio_snapshots" if a["kind"] == "ai" else "benchmark_snapshots"
        if conn.execute(f"select 1 from {table} where account_id=%s and session_date=%s", (a["id"], session)).fetchone():
            continue
        cash = cash_of(conn, a["id"])
        hold = holdings_of(conn, a["id"])
        value, detail, stale = Decimal(0), [], []
        for sym, h in hold.items():
            bar = bar_on(conn, sym, source_name, session)
            if bar:
                close = D(bar["close"])
            else:
                row = conn.execute("select close from stock_prices where symbol=%s and source=%s and trade_date<%s"
                                   " order by trade_date desc limit 1", (sym, source_name, session)).fetchone()
                if not row:
                    raise LabError(f"cannot value {sym}")
                close = D(row["close"])
                stale.append(sym)
            mv = cents(close * h["qty"])
            value += mv
            detail.append({"symbol": sym, "quantity": h["qty"], "avg_cost": str(h["avg_cost"].quantize(Decimal('0.0001'))),
                           "close": str(close), "market_value": str(mv),
                           "unrealized_pnl": str(cents(mv - h["avg_cost"] * h["qty"]))})
        equity = cents(cash + value)
        prev = conn.execute(f"select equity from {table} where account_id=%s and session_date<%s"
                            " order by session_date desc limit 1", (a["id"], session)).fetchone()
        base = D(prev["equity"]) if prev else D(a["initial_cash"])
        daily = (equity / base - 1) if base > 0 else None
        cum = equity / D(a["initial_cash"]) - 1
        q = Decimal("0.0000000001")
        if a["kind"] == "ai":
            conn.execute(
                "insert into portfolio_snapshots(account_id, session_date, cash, holdings_value, equity, daily_return,"
                " cum_return, holdings, stale_marks) values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (a["id"], session, cents(cash), cents(value), equity, daily.quantize(q) if daily is not None else None,
                 cum.quantize(q), jsonb(detail), stale))
        else:
            conn.execute(
                "insert into benchmark_snapshots(account_id, benchmark_code, session_date, cash, holdings_value, equity,"
                " daily_return, cum_return, holdings) values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (a["id"], a["benchmark_code"], session, cents(cash), cents(value), equity,
                 daily.quantize(q) if daily is not None else None, cum.quantize(q), jsonb(detail)))
        n += 1
    return n
