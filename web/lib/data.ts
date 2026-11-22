import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import type { Locale } from "./public-content";
import { t } from "./i18n";
import type { Dataset, Stats } from "./types";
import { makeAdjustedPriceMap, type PriceRow, type SplitRow } from "./price-adjust";

/**
 * 데이터 공급원
 *  - LIVE ONLY: verified NH PLUG prices and real AI decisions from Supabase.
 *  - Missing database data must fail visibly; never serve synthetic results.
 *  - Supabase secret key is server-only and raw quotes remain access-restricted.
 *    The anon/authenticated API roles have NO read privileges on experiment data.
 *    Never pass a secret key to a browser or NEXT_PUBLIC_ environment variable.
 * 사용자 방문은 AI API 를 절대 호출하지 않는다. 저장된 결과만 읽는다.
 */
type Raw = Record<string, any>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const nn = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export const getData = cache(async (): Promise<Dataset> => {
  const req = await headers();
  const locale: Locale = "en";
  const publicPage = req.get("x-ail-public") === "1";
  const raw = await (publicPage ? loadCachedPublicRaw() : loadSupabase(false));
  const dataset = { ...normalize(raw, locale), locale, publicQuotesRedacted: publicPage };
  // Do not redistribute the licensed NH PLUG per-ticker OHLCV bars or fill
  // prices on anonymous public pages. Keep only model-generated results,
  // simulated account-level returns, and portfolio composition at this stage.
  // The private back office continues to have its full data internally.
  if (publicPage) {
    return {
      ...dataset,
      prices: {},
      trades: dataset.trades.map(trade => ({
        ...trade,
        refOpenPrice: 0, price: 0, gross: 0, fee: 0, netCash: 0, realizedPnl: null,
      })),
      // Portfolio values are simulated account metrics, not raw quote tables.
      snapshots: dataset.snapshots.map(s => ({
        ...s,
        holdings: s.holdings.map(h => ({ ...h, close: 0, avgCost: 0 })),
      })),
    };
  }
  return dataset;
});

// Public pages share the same 5-minute server-side read cache across languages.
// The cached projection is quote-free and never contains API credentials.
const loadCachedPublicRaw = unstable_cache(
  () => loadSupabase(true),
  ["ail-public-results-v2"],
  { revalidate: 300 }
);

async function loadSupabase(publicView = false): Promise<Raw> {
  const { serverSupabase } = await import("./server-supabase");
  const sb = serverSupabase();
  const name = process.env.AIL_EXPERIMENT ?? "season-1";

  async function all<T = Raw>(table: string, select: string, apply?: (q: any) => any): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select(select).range(from, from + 999);
      if (apply) q = apply(q);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return out;
    }
  }

  const [exp] = await all("experiments", "*", (q) => q.eq("name", name));
  if (!exp) throw new Error(`experiment not found: ${name}`);
  if (exp.mode !== "live") throw new Error(`DATA_MODE=live cannot read ${exp.mode} experiment: ${name}`);
  const [models, versions, accounts] = await Promise.all([
    all("ai_models", "*"),
    all("model_versions", "*", (q) => q.is("effective_to", null)),
    all("portfolio_accounts", "*", (q) => q.eq("experiment_id", exp.id)),
  ]);
  const ids = accounts.map((a: Raw) => a.id);
  const [ps, bs, stats, trades, orders, rounds, decisions, universe, universeChanges] = await Promise.all([
    all("portfolio_snapshots", "account_id,session_date,equity,cash,cum_return,daily_return,holdings", (q) => q.in("account_id", ids).order("session_date")),
    all("benchmark_snapshots", "account_id,session_date,equity,cash,cum_return,daily_return,holdings", (q) => q.in("account_id", ids).order("session_date")),
    all("performance_stats", "*", (q) => q.in("account_id", ids).order("as_of", { ascending: false })),
    all("trades", publicView ? "id,order_id,account_id,symbol,side,quantity,trade_date,executed_at" : "*", (q) => q.in("account_id", ids).order("trade_date", { ascending: false })),
    all("orders", "*", (q) => q.in("account_id", ids)),
    all("experiment_rounds", "*", (q) => q.eq("experiment_id", exp.id).order("session_date", { ascending: false })),
    all("ai_decisions", "id,round_id,ai_model_id,requested_model,status,error,parsed,market_hash,completed_at"),
    all("stock_universe", "symbol,name,sector,role", (q) => q.is("removed_at", null)),
    all("universe_change_requests", "id,action,symbol,reason,scheduled_at,effective_session,status,applied_at,applied_round_id",
        (q) => q.eq("experiment_id", exp.id).order("scheduled_at", { ascending: false })),
  ]);
  const orderById = new Map(orders.map((o: Raw) => [o.id, o]));
  const roundById = new Map(rounds.map((r: Raw) => [r.id, r]));
  const roundIds = new Set(rounds.map((r: Raw) => r.id));
  const myDecisions = decisions.filter((d: Raw) => roundIds.has(d.round_id));
  const hashByRound = new Map(myDecisions.map((d: Raw) => [d.round_id, d.market_hash]));
  // The entire investable universe must be chartable, even before its first trade.
  // Include delisted symbols that still appear in holdings or past transactions.
  const held = [...ps, ...bs].flatMap((s: Raw) =>
    Array.isArray(s.holdings) ? s.holdings.map((h: Raw) => h.symbol) : []);
  const symbols = Array.from(new Set([
    ...universe.map((u: Raw) => u.symbol), ...trades.map((t: Raw) => t.symbol), ...held, "SPY",
  ])).sort();
  const since = new Date(new Date(exp.start_session).getTime() - 400 * 864e5).toISOString().slice(0, 10);
  const coveredDates = [...ps, ...bs].map((s: Raw) => String(s.session_date));
  coveredDates.push(...rounds.map((r: Raw) => String(r.data_as_of)));
  const through = coveredDates.sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  // Anonymous visitors never fetch licensed per-ticker OHLCV, splits or raw
  // brokerage transaction amounts from Supabase. The private console can.
  let priceMap: Record<string, unknown> = {};
  if (!publicView) {
    // Multiple price sources may contain identical ticker/date pairs: filter at DB level.
      const prices = await all<PriceRow>("stock_prices", "symbol,trade_date,open,high,low,close,volume", (q) =>
        q.in("symbol", symbols).eq("source", "nh_plug").gte("trade_date", since)
         .lte("trade_date", through).order("trade_date").order("symbol"));
      const actions = await all<SplitRow>("corporate_actions", "symbol,kind,ex_date,ratio", (q) =>
        q.in("symbol", symbols).eq("price_source", "nh_plug").eq("kind", "split")
         .lte("ex_date", through).lte("created_at", now).order("ex_date").order("symbol"));
      priceMap = makeAdjustedPriceMap(prices, actions, through);
  }
  const latest = new Map<number, Raw>();
  for (const s of stats) if (!latest.has(s.account_id)) latest.set(s.account_id, s);
  const modelById = new Map(models.map((m: Raw) => [m.id, m]));
  const versionById = new Map(versions.map((v: Raw) => [v.ai_model_id, v]));
  return {
    experiment: exp,
    accounts: accounts.map((a: Raw) => ({
      ...a,
      display_name: modelById.get(a.ai_model_id)?.display_name ?? null,
      color: modelById.get(a.ai_model_id)?.color ?? null,
      model: versionById.get(a.ai_model_id)?.openrouter_model_id ?? null,
    })),
    snapshots: [...ps, ...bs],
    stats: Array.from(latest.values()),
    trades: trades.map((t: Raw) => {
      const o = orderById.get(t.order_id) as Raw | undefined;
      const r = o?.round_id ? (roundById.get(o.round_id) as Raw) : undefined;
      return { ...t, round_id: o?.round_id ?? null, decision_id: o?.decision_id ?? null,
               decision_at: r?.decision_at ?? null, data_as_of: r?.data_as_of ?? null };
    }),
    rejected_orders: orders.filter((o: Raw) => o.status === "REJECTED" || o.status === "EXPIRED"),
    rounds: rounds.map((r: Raw) => ({ ...r, snapshot_hash: hashByRound.get(r.id) ?? null })),
    decisions: myDecisions.map((d: Raw) => ({
      ...d, session_date: (roundById.get(d.round_id) as Raw)?.session_date,
      data_as_of: (roundById.get(d.round_id) as Raw)?.data_as_of,
    })),
    universe,
    universe_changes: universeChanges,
    prices: priceMap,
  };
}

function normalize(raw: Raw, locale: Locale): Omit<Dataset, "locale" | "publicQuotesRedacted"> {
  const e = raw.experiment;
  const colorFallback: Record<string, string> = {
    SPY_BUY_HOLD: "#a3a3a3", EQUAL_WEIGHT: "#eab308", CASH: "#525252",
  };
  const stats: Record<number, Stats> = {};
  for (const s of raw.stats ?? []) stats[s.account_id] = s.stats;
  const parseHoldings = (h: Raw[] | null | undefined) =>
    (h ?? []).map((x) => ({
      symbol: x.symbol, quantity: n(x.quantity), avgCost: n(x.avg_cost), close: n(x.close),
      marketValue: n(x.market_value), unrealizedPnl: n(x.unrealized_pnl),
    }));
  return {
    mode: "live",
    experiment: {
      name: e.name, startSession: e.start_session, initialCash: n(e.initial_cash),
      maxPositionWeight: n(e.max_position_weight), feeBps: n(e.fee_bps), slippageBps: n(e.slippage_bps), status: e.status,
    },
    accounts: (raw.accounts ?? []).map((a: Raw) => ({
      id: a.id, kind: a.kind, aiId: a.ai_model_id, benchmarkCode: a.benchmark_code,
      name: a.kind === "benchmark" ? t(locale, ({
        SPY_BUY_HOLD: "SPY 단순 매수·보유", EQUAL_WEIGHT: "30종목 균등투자", CASH: "현금 100%"
      } as Record<string,string>)[a.benchmark_code] ?? a.name) : a.display_name ?? a.name,
      color: a.color ?? colorFallback[a.benchmark_code] ?? "#888",
      model: a.model, initialCash: n(a.initial_cash),
    })),
    snapshots: (raw.snapshots ?? []).map((s: Raw) => ({
      accountId: s.account_id, date: s.session_date, equity: n(s.equity), cash: n(s.cash),
      cumReturn: n(s.cum_return), dailyReturn: nn(s.daily_return), holdings: parseHoldings(s.holdings),
    })),
    stats,
    trades: (raw.trades ?? []).map((t: Raw) => ({
      id: t.id, accountId: t.account_id, symbol: t.symbol, side: t.side, quantity: n(t.quantity),
      refOpenPrice: n(t.ref_open_price), price: n(t.price), gross: n(t.gross), fee: n(t.fee),
      netCash: n(t.net_cash), realizedPnl: nn(t.realized_pnl), tradeDate: t.trade_date, executedAt: t.executed_at,
      decisionId: t.decision_id ?? null, decisionAt: t.decision_at ?? null, dataAsOf: t.data_as_of ?? null,
    })),
    rejected: (raw.rejected_orders ?? []).map((o: Raw) => ({
      id: o.id, accountId: o.account_id, symbol: o.symbol, side: o.side, quantity: n(o.quantity),
      status: o.status, reason: o.reject_reason, sessionDate: o.session_date,
    })),
    rounds: (raw.rounds ?? []).map((r: Raw) => ({
      id: r.id, sessionDate: r.session_date, dataAsOf: r.data_as_of, decisionAt: r.decision_at,
      status: r.status, abortReason: r.abort_reason, snapshotHash: r.snapshot_hash,
    })),
    decisions: (raw.decisions ?? []).map((d: Raw) => ({
      id: d.id, roundId: d.round_id, aiId: d.ai_model_id, model: d.requested_model, status: d.status,
      error: d.error, summary: d.parsed?.summary ?? null, actions: d.parsed?.actions ?? [],
      sessionDate: d.session_date, dataAsOf: d.data_as_of,
    })),
    universe: raw.universe ?? [],
    universeChanges: (raw.universe_changes ?? []).map((change: Raw) => ({
      id: change.id, action: change.action, symbol: change.symbol, reason: change.reason,
      scheduledAt: change.scheduled_at, effectiveSession: change.effective_session,
      status: change.status, appliedAt: change.applied_at ?? null,
      appliedRoundId: change.applied_round_id ?? null,
    })),
    prices: Object.fromEntries(Object.entries(raw.prices ?? {}).map(([k, rows]) => [
      k, (rows as unknown[][]).map((r) => [String(r[0]), n(r[1]), n(r[2]), n(r[3]), n(r[4]), n(r[5])]),
    ])) as Dataset["prices"],
    generatedAt: new Date().toISOString(),
  };
}

// ── 조회 헬퍼
export function aiAccounts(d: Dataset) {
  return d.accounts.filter((a) => a.kind === "ai");
}
export function benchmarkAccounts(d: Dataset) {
  return d.accounts.filter((a) => a.kind === "benchmark");
}
export function seriesOf(d: Dataset, accountId: number) {
  return d.snapshots.filter((s) => s.accountId === accountId).sort((a, b) => a.date.localeCompare(b.date));
}
export function latestSnapshot(d: Dataset, accountId: number) {
  const s = seriesOf(d, accountId);
  return s[s.length - 1];
}
export function accountByAi(d: Dataset, aiId: string) {
  return d.accounts.find((a) => a.aiId === aiId);
}
export function lastSessionDate(d: Dataset) {
  return d.snapshots.reduce((m, s) => (s.date > m ? s.date : m), "");
}
