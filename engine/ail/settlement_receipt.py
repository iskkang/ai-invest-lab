"""Read-only proof of exact-session prices and all seven portfolio valuations."""
from datetime import date
from decimal import Decimal

from .common import D, LabError, cents
from .config import DEFAULT_PARTICIPANTS, price_source_for_mode
from .market_data import active_universe

EXPECTED_ACCOUNTS = frozenset(
    [f"ai:{p['id']}" for p in DEFAULT_PARTICIPANTS]
    + [f"benchmark:{code}" for code in ("SPY_BUY_HOLD", "EQUAL_WEIGHT", "CASH")]
)


def settlement_symbols(conn, experiment_id: int) -> list[str]:
    """Use the same required symbol set for ingestion and its verification."""
    active = [row["symbol"] for row in active_universe(conn)]
    held = [row["symbol"] for row in conn.execute(
        "select distinct h.symbol from holdings h join portfolio_accounts a on a.id=h.account_id"
        " where a.experiment_id=%s", (experiment_id,)).fetchall()]
    queued = [row["symbol"] for row in conn.execute(
        "select symbol from universe_change_requests where experiment_id=%s"
        " and status='scheduled' and action='add'", (experiment_id,)).fetchall()]
    return sorted(set(active) | set(held) | set(queued))


def settlement_receipt(conn, settings, session: date) -> dict:
    source = price_source_for_mode(settings.mode)
    detail = {"session": session.isoformat(), "source": source, "verified": False,
              "phase": "settlement", "expected_price_count": 0, "price_count": 0,
              "missing_price_symbols": [], "expected_valuation_count": len(EXPECTED_ACCOUNTS),
              "valuation_count": 0, "missing_accounts": [], "invalid_accounts": [],
              "pending_orders": 0}
    exp = conn.execute(
        "select id, start_session from experiments where name=%s and mode=%s",
        (settings.experiment_name, settings.mode),
    ).fetchone()
    if exp is None:
        return {**detail, "reason": "experiment missing"}
    required = set(settlement_symbols(conn, exp["id"]))
    rows = conn.execute(
        "select a.id, a.kind, a.ai_model_id, a.benchmark_code, s.account_id as snapshot_account_id,"
        " s.cash, s.holdings_value, s.equity, s.holdings, s.stale_marks"
        " from portfolio_accounts a left join portfolio_snapshots s"
        " on s.account_id=a.id and s.session_date=%s"
        " where a.experiment_id=%s and a.kind='ai'"
        " union all"
        " select a.id, a.kind, a.ai_model_id, a.benchmark_code, s.account_id as snapshot_account_id,"
        " s.cash, s.holdings_value, s.equity, s.holdings, '{}'::text[] as stale_marks"
        " from portfolio_accounts a left join benchmark_snapshots s"
        " on s.account_id=a.id and s.session_date=%s and s.benchmark_code=a.benchmark_code"
        " where a.experiment_id=%s and a.kind='benchmark'",
        (session, exp["id"], session, exp["id"]),
    ).fetchall()
    for row in rows:
        if isinstance(row["holdings"], list):
            required.update(h["symbol"] for h in row["holdings"]
                            if isinstance(h, dict) and isinstance(h.get("symbol"), str))
    prices = {row["symbol"]: D(row["close"]) for row in conn.execute(
        "select symbol, close from stock_prices where source=%s and trade_date=%s and symbol=any(%s)",
        (source, session, sorted(required)),
    ).fetchall()}
    detail.update(expected_price_count=len(required), price_count=len(prices),
                  missing_price_symbols=sorted(required - prices.keys()))
    detail["pending_orders"] = int(conn.execute(
        "select count(*) as n from orders o join portfolio_accounts a on a.id=o.account_id"
        " where a.experiment_id=%s and o.session_date<=%s and o.status='PENDING'",
        (exp["id"], session),
    ).fetchone()["n"])
    labels = {f"{row['kind']}:{row['ai_model_id'] or row['benchmark_code']}" for row in rows}
    detail["missing_accounts"] = sorted(EXPECTED_ACCOUNTS - labels)
    detail["invalid_accounts"] = sorted(labels - EXPECTED_ACCOUNTS)
    if len(rows) != len(labels):
        detail["reason"] = "duplicate account identities"

    if session < exp["start_session"]:
        # The existing pre-start job only ingests history; no valuation is due.
        detail.update(phase="pre_start_ingestion", expected_valuation_count=0)
        detail["verified"] = bool(required) and not (
            detail["missing_price_symbols"] or detail["missing_accounts"]
            or detail["invalid_accounts"] or detail["pending_orders"] or detail.get("reason"))
        return detail

    ledger = conn.execute(
        "select l.account_id, l.symbol, sum(l.cash_delta) as cash, sum(l.qty_delta) as quantity"
        " from ledger_entries l join portfolio_accounts a on a.id=l.account_id"
        " where a.experiment_id=%s and l.effective_date<=%s group by l.account_id, l.symbol",
        (exp["id"], session),
    ).fetchall()
    cash_by_account = {}
    qty_by_account = {}
    for row in ledger:
        aid = row["account_id"]
        cash_by_account[aid] = cash_by_account.get(aid, Decimal(0)) + D(row["cash"])
        if row["symbol"] and row["quantity"]:
            qty_by_account.setdefault(aid, {})[row["symbol"]] = int(row["quantity"])
    for row in rows:
        label = f"{row['kind']}:{row['ai_model_id'] or row['benchmark_code']}"
        if label not in EXPECTED_ACCOUNTS:
            continue
        if row["snapshot_account_id"] is None:
            detail["missing_accounts"].append(label)
            continue
        valid = not row["stale_marks"] and isinstance(row["holdings"], list)
        quantity, value = {}, Decimal(0)
        try:
            for holding in row["holdings"] if isinstance(row["holdings"], list) else []:
                symbol = holding["symbol"]
                qty = D(holding["quantity"])
                close = D(holding["close"])
                if symbol in quantity or qty <= 0 or qty != int(qty) or prices.get(symbol) != close:
                    valid = False
                quantity[symbol] = int(qty)
                mark = cents(qty * close)
                if D(holding["market_value"]) != mark:
                    valid = False
                value += mark
            cash = D(row["cash"])
            valid = (valid and cash >= 0 and cash == cash_by_account.get(row["id"], Decimal(0))
                     and quantity == qty_by_account.get(row["id"], {})
                     and value == D(row["holdings_value"]) and cents(cash + value) == D(row["equity"]))
        except (KeyError, TypeError, ValueError, ArithmeticError, LabError):
            valid = False
        if valid:
            detail["valuation_count"] += 1
        else:
            detail["invalid_accounts"].append(label)
    detail["missing_accounts"] = sorted(set(detail["missing_accounts"]))
    detail["invalid_accounts"] = sorted(set(detail["invalid_accounts"]))
    detail["verified"] = bool(required) and not (
        detail["missing_price_symbols"] or detail["missing_accounts"] or detail["invalid_accounts"]
        or detail["pending_orders"] or detail.get("reason")) and detail["valuation_count"] == len(EXPECTED_ACCOUNTS)
    return detail
