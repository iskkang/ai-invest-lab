import type { Account, Dataset, DecisionAction } from "./types";
import { latestSnapshot } from "./data";

export type Tone = "up" | "down" | "warn" | "muted" | "default";

/** 종목 요약 지표 — 저장된 일봉에서 계산 (AI 호출 없음) */
export function stockSummary(d: Dataset, symbol: string) {
  const bars = d.prices[symbol] ?? [];
  if (bars.length < 2) return null;
  const closes = bars.map((b) => b[4]);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const y = bars.slice(-252);
  const hi52 = Math.max(...y.map((b) => b[2]));
  const lo52 = Math.min(...y.map((b) => b[3]));
  const sma = (n: number) => (closes.length >= n ? closes.slice(-n).reduce((a, b) => a + b, 0) / n : null);
  const ma20 = sma(20);
  const ma50 = sma(50);
  // RSI(14) Wilder
  let rsi: number | null = null;
  if (closes.length > 15) {
    let g = 0, l = 0;
    for (let i = 1; i <= 14; i++) { const c = closes[i] - closes[i - 1]; g += Math.max(c, 0); l += Math.max(-c, 0); }
    g /= 14; l /= 14;
    for (let i = 15; i < closes.length; i++) {
      const c = closes[i] - closes[i - 1];
      g = (g * 13 + Math.max(c, 0)) / 14; l = (l * 13 + Math.max(-c, 0)) / 14;
    }
    rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  const rets = closes.slice(-31).map((c, i, a) => (i ? c / a[i - 1] - 1 : 0)).slice(1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol30 = rets.length >= 20 ? Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252) : null;
  let peak = y[0][4], mdd = 0;
  for (const b of y) { peak = Math.max(peak, b[4]); mdd = Math.min(mdd, b[4] / peak - 1); }
  const vol20avg = bars.slice(-21, -1).reduce((a, b) => a + b[5], 0) / 20;
  return {
    date: last[0], open: last[1], high: last[2], low: last[3], close: last[4], volume: last[5],
    prevClose: prev[4], change: last[4] - prev[4], changePct: last[4] / prev[4] - 1,
    hi52, lo52, ma20, ma50, rsi, vol30, mdd, volumeVsAvg: vol20avg ? last[5] / vol20avg - 1 : null,
  };
}

export type Summary = NonNullable<ReturnType<typeof stockSummary>>;

/** 지표 상태 라벨: 기술적 상태 설명이며 매매 권유가 아님 */
export function indicatorStates(s: Summary) {
  const rsi: [string, Tone] = s.rsi === null ? ["표본 부족", "muted"] : s.rsi >= 70 ? ["과매수 구간", "warn"] : s.rsi <= 30 ? ["과매도 구간", "warn"] : ["중립", "muted"];
  const ma: [string, Tone] = s.ma20 === null || s.ma50 === null ? ["표본 부족", "muted"] : s.ma20 >= s.ma50 ? ["단기 상승 추세", "up"] : ["단기 하락 추세", "down"];
  const vol: [string, Tone] = s.vol30 === null ? ["표본 부족", "muted"] : s.vol30 < 0.2 ? ["낮음", "muted"] : s.vol30 < 0.35 ? ["보통", "muted"] : ["높음", "warn"];
  const mdd: [string, Tone] = s.mdd > -0.1 ? ["작음", "muted"] : s.mdd > -0.25 ? ["보통", "muted"] : ["큼", "warn"];
  return { rsi, ma, vol, mdd };
}

export type Stance = "BUY" | "SELL" | "HOLD" | "KEEP" | "NONE" | "FAILED";
export const STANCE_LABEL: Record<Stance, string> = {
  BUY: "매수", SELL: "매도", HOLD: "보유 유지", KEEP: "보유(언급 없음)", NONE: "관망", FAILED: "응답 무효",
};
export const STANCE_TONE: Record<Stance, Tone> = {
  BUY: "up", SELL: "down", HOLD: "default", KEEP: "muted", NONE: "muted", FAILED: "warn",
};

export interface AiView {
  account: Account;
  stance: Stance;
  action?: DecisionAction;
  sessionDate?: string;
  dataAsOf?: string;
  quantityHeld: number;
  avgCost: number | null;
  pnl: number;
  tradeCount: number;
}

/** 각 AI 의 가장 최근 회차 판단에서 이 종목에 대한 입장 */
export function aiViews(d: Dataset, symbol: string): AiView[] {
  return d.accounts.filter((a) => a.kind === "ai").map((a) => {
    const dec = d.decisions.filter((x) => x.aiId === a.aiId).sort((x, y) => y.sessionDate.localeCompare(x.sessionDate))[0];
    const snap = latestSnapshot(d, a.id);
    const h = snap?.holdings.find((x) => x.symbol === symbol);
    const trades = d.trades.filter((t) => t.accountId === a.id && t.symbol === symbol);
    const realized = trades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
    const action = dec?.status === "valid" ? dec.actions.find((x) => x.symbol === symbol) : undefined;
    let stance: Stance;
    if (!dec) stance = "NONE";
    else if (dec.status !== "valid") stance = "FAILED";
    else if (action) stance = action.action as Stance;
    else stance = h ? "KEEP" : "NONE";
    return {
      account: a, stance, action, sessionDate: dec?.sessionDate, dataAsOf: dec?.dataAsOf,
      quantityHeld: h?.quantity ?? 0, avgCost: h?.avgCost ?? null, pnl: realized + (h?.unrealizedPnl ?? 0), tradeCount: trades.length,
    };
  });
}

/** 비교 요약 — 규칙 기반 자동 문장 (AI 를 다시 호출하지 않음) */
export function compareSummary(views: AiView[]) {
  const group = (s: Stance) => (s === "HOLD" || s === "KEEP" ? "보유" : s === "BUY" ? "매수" : s === "SELL" ? "매도" : s === "FAILED" ? "무효" : "관망");
  const by = new Map<string, string[]>();
  for (const v of views) by.set(group(v.stance), [...(by.get(group(v.stance)) ?? []), v.account.name]);
  const sorted = Array.from(by.entries()).sort((a, b) => b[1].length - a[1].length);
  const [topKey, topNames] = sorted[0];
  const agreement = topNames.length >= 2
    ? `${topNames.join(", ")} ${topNames.length === views.length ? "모두" : ""} '${topKey}' 의견입니다.`.replace("  ", " ")
    : "네 AI의 의견이 모두 다릅니다.";
  const differences = sorted.slice(topNames.length >= 2 ? 1 : 0).map(([k, names]) => `${names.join(", ")}: ${k}`);
  const used = views.map((v) => new Set(v.action?.indicators_used ?? [])).filter((s) => s.size);
  const common = used.length >= 2 ? Array.from(used[0]).filter((i) => used.every((s) => s.has(i))) : [];
  const allUsed = Array.from(new Set(views.flatMap((v) => v.action?.indicators_used ?? [])));
  return { agreement, differences, common, allUsed, counts: sorted.map(([k, n]) => [k, n.length] as const) };
}

export function universeRows(d: Dataset) {
  const holders = new Map<string, Account[]>();
  for (const a of d.accounts.filter((x) => x.kind === "ai")) {
    for (const h of latestSnapshot(d, a.id)?.holdings ?? []) holders.set(h.symbol, [...(holders.get(h.symbol) ?? []), a]);
  }
  return d.universe.filter((u) => u.role === "investable").map((u) => {
    const b = d.prices[u.symbol] ?? [];
    const last = b.at(-1), prev = b.at(-2);
    return { ...u, close: last?.[4] ?? null, changePct: last && prev ? last[4] / prev[4] - 1 : null, holders: holders.get(u.symbol) ?? [] };
  });
}
