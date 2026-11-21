import type { Account, Bar, Dataset, Decision, DecisionAction, Round, Snapshot } from "./types";

/** These are observational summaries of VERIFIED paper-trading records.
 * Never infer an unmentioned HOLD, an unexecuted trade or a price prediction.
 */
export type Direction = "BUY" | "SELL" | "HOLD";
export type Vote = {
  aiId: string;
  aiName: string;
  action: Direction;
  reason: string;
};
export type SymbolComparison = {
  symbol: string;
  company: string;
  votes: Vote[];
  buy: number;
  sell: number;
  hold: number;
  agreement: number;
  conflicted: boolean;
  consensus: boolean;
};
export type ConsensusResult = {
  date: string | null;
  participatingModels: number;
  totalModels: number;
  comparedSymbols: number;
  consensus: SymbolComparison[];
  disagreements: SymbolComparison[];
  all: SymbolComparison[];
};

const byName = (a: string, b: string) => a.localeCompare(b, "en");
const aiAccounts = (d: Dataset) => d.accounts.filter((a) => a.kind === "ai");
const settledRounds = (d: Dataset) =>
  d.rounds.filter((r) => r.status === "settled")
    .slice().sort((a,b) => b.sessionDate.localeCompare(a.sessionDate));
const finalizedDecisions = (d: Dataset) =>
  d.rounds.filter((r) => r.status === "decided" || r.status === "settled")
    .slice().sort((a,b) => b.sessionDate.localeCompare(a.sessionDate));

export function verifiedDecisions(d: Dataset): Decision[] {
  const completed = new Set(finalizedDecisions(d).map((r) => r.id));
  const ai = new Set(aiAccounts(d).map((a) => a.aiId));
  return d.decisions.filter((dec) =>
    completed.has(dec.roundId) && dec.status === "valid" &&
    ai.has(dec.aiId) && dec.sessionDate && dec.dataAsOf &&
    dec.dataAsOf < dec.sessionDate
  );
}

function comparisons(d: Dataset, decisions: Decision[]): SymbolComparison[] {
  const models = new Map(aiAccounts(d).map((a) => [a.aiId, a]));
  const names = new Map(d.universe.filter((u) => u.role === "investable").map((u) => [u.symbol, u.name]));
  const found = new Map<string, Vote[]>();
  for (const dec of decisions) {
    const ai = models.get(dec.aiId);
    if (!ai) continue;
    const seen = new Set<string>();
    for (const action of dec.actions) {
      if (!names.has(action.symbol) || seen.has(action.symbol)) continue;
      if (!["BUY", "SELL", "HOLD"].includes(action.action)) continue;
      if ((action.action === "BUY" || action.action === "SELL") && action.quantity <= 0) continue;
      seen.add(action.symbol);
      const votes = found.get(action.symbol) ?? [];
      votes.push({
        aiId: dec.aiId,
        aiName: ai.name,
        action: action.action,
        reason: action.reason,
      });
      found.set(action.symbol, votes);
    }
  }
  return Array.from(found.entries()).map(([symbol, votes]) => {
    const buy = votes.filter((v) => v.action === "BUY").length;
    const sell = votes.filter((v) => v.action === "SELL").length;
    const hold = votes.filter((v) => v.action === "HOLD").length;
    const agreement = Math.max(buy, sell, hold);
    const conflicted = [buy, sell, hold].filter((n) => n > 0).length >= 2;
    return {
      symbol, company: names.get(symbol) ?? symbol,
      votes, buy, sell, hold, agreement, conflicted,
      consensus: agreement >= 2 && !conflicted,
    };
  }).sort((a,b) =>
    b.votes.length-a.votes.length || b.agreement-a.agreement || byName(a.symbol,b.symbol)
  );
}

export function compareLatestRound(d: Dataset): ConsensusResult {
  const rounds = finalizedDecisions(d);
  const totalModels = aiAccounts(d).length;
  const candidate = rounds.find((r) => verifiedDecisions(d).some((dec) => dec.roundId === r.id));
  if (!candidate) return {
    date:null, participatingModels:0, totalModels, comparedSymbols:0,
    consensus:[], disagreements:[], all:[],
  };
  const eligible = verifiedDecisions(d).filter((dec) => dec.roundId === candidate.id);
  const all = comparisons(d,eligible);
  return {
    date:candidate.sessionDate,
    participatingModels:new Set(eligible.map((dec) => dec.aiId)).size,
    totalModels,
    comparedSymbols:all.length,
    consensus:all.filter((row) => row.consensus),
    disagreements:all.filter((row) => row.conflicted),
    all,
  };
}

/** ISO-8601 week identity is stable across New Year's transitions. */
export function isoWeek(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid session date");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const beginning = new Date(Date.UTC(year,0,1,12));
  const week = Math.ceil(((d.getTime() - beginning.getTime()) / 86400000 + 1) / 7);
  return year + "-W" + String(week).padStart(2,"0");
}
export function weekMonday(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - weekday + 1);
  return d.toISOString().slice(0,10);
}
export function weekFriday(date: string): string {
  const d = new Date(weekMonday(date) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().slice(0,10);
}

export type WeeklyModel = {
  id: string;
  name: string;
  votes: number;
  buys: number;
  sells: number;
  holds: number;
  weeklyReturn: number | null;
};
export type WeeklyReport = {
  week: string;
  start: string;
  end: string;
  roundCount: number;
  decisionCount: number;
  actionCount: number;
  models: WeeklyModel[];
  common: SymbolComparison[];
  divergent: SymbolComparison[];
  sourceDates: string[];
};

function weeklyPortfolioReturn(snapshots: Snapshot[], account: Account, start: string, end: string): number | null {
  const rows = snapshots.filter((s) => s.accountId === account.id)
    .slice().sort((a,b) => a.date.localeCompare(b.date));
  const baseline = rows.filter((s) => s.date < start).at(-1);
  const final = rows.filter((s) => s.date >= start && s.date <= end).at(-1);
  if (!baseline || !final || baseline.equity <= 0) return null;
  return final.equity / baseline.equity - 1;
}

/** Completed weeks only; generated on demand from durable verified decisions/snapshots.
 * No LLM summaries, synthetic returns or backdated reports are introduced here.
 */
export function generateWeeklyReports(d: Dataset, now: Date = new Date()): WeeklyReport[] {
  const today = now.toISOString().slice(0,10);
  const byWeek = new Map<string, Round[]>();
  for (const round of settledRounds(d)) {
    const week = isoWeek(round.sessionDate);
    // Publish after the Friday NYSE session has closed (Saturday UTC).
    // Do not require waiting until the next Monday calendar week.
    if (weekFriday(round.sessionDate) >= today) continue;
    const arr = byWeek.get(week) ?? [];
    arr.push(round);
    byWeek.set(week,arr);
  }
  const validated = verifiedDecisions(d);
  return Array.from(byWeek.entries()).sort((a,b) => b[0].localeCompare(a[0]))
    .map(([week, rounds]) => {
      const start = weekMonday(rounds[0].sessionDate);
      const end = weekFriday(rounds[0].sessionDate);
      const included = new Set(rounds.map((r) => r.id));
      const decisions = validated.filter((dec) => included.has(dec.roundId));
      const models = aiAccounts(d).map((a) => {
        const mine = decisions.filter((dec) => dec.aiId === a.aiId);
        const actions = mine.flatMap((dec) => dec.actions);
        return {
          id:a.aiId!, name:a.name, votes:actions.length,
          buys:actions.filter((action) => action.action === "BUY").length,
          sells:actions.filter((action) => action.action === "SELL").length,
          holds:actions.filter((action) => action.action === "HOLD").length,
          weeklyReturn:weeklyPortfolioReturn(d.snapshots,a,start,end),
        };
      });
      // Latest completed session of the week is the only consensus snapshot.
      // Do not combine contradictory opinions from different dates as if simultaneous.
      const latestRound = rounds.slice().sort((a,b) => b.sessionDate.localeCompare(a.sessionDate))[0];
      const latest = comparisons(d,decisions.filter((dec) => dec.roundId === latestRound.id));
      return {
        week,start,end,roundCount:rounds.length,decisionCount:decisions.length,
        actionCount:models.reduce((sum,m) => sum+m.votes,0), models,
        common:latest.filter((row) => row.consensus),
        divergent:latest.filter((row) => row.conflicted),
        sourceDates:rounds.map((r) => r.sessionDate).sort(),
      };
    })
    .filter((report) => report.decisionCount > 0);
}

export type AccuracyHorizon = 5 | 20;
export type AccuracyModel = {
  aiId: string;
  name: string;
  horizon: AccuracyHorizon;
  samples: number;
  hits: number;
  hitRate: number | null;
  averageExcessVsSpy: number | null;
  qualified: boolean;
};
export const MIN_DIRECTION_SAMPLES = 20;

/** Accuracy uses session's later known opening price as ENTRY reference and
 * the verified close 5/20 *subsequent* NYSE/SPY sessions later as the outcome.
 * Neither number is included in the original AI prompt. HOLD/unmentioned
 * symbols and non-settled rounds never become predictions.
 */
export function evaluateDirectionalAccuracy(
  d: Dataset,
  adjustedBars: Record<string, Bar[]>,
  minimumSample = MIN_DIRECTION_SAMPLES,
): AccuracyModel[] {
  const spy = adjustedBars.SPY ?? [];
  const spyByDate = new Map(spy.map((bar) => [bar[0],bar]));
  const spyDates = spy.map((bar) => bar[0]);
  const datesIndex = new Map(spyDates.map((date,index) => [date,index]));
  const bySymbol = new Map(Object.entries(adjustedBars).map(([symbol,bars]) =>
    [symbol,new Map(bars.map((bar) => [bar[0],bar]))]
  ));
  const settled = new Set(settledRounds(d).map(round=>round.id));
  const decisions = verifiedDecisions(d).filter(dec=>settled.has(dec.roundId));
  const rows: AccuracyModel[] = [];
  for (const model of aiAccounts(d)) {
    const mine = decisions.filter((dec) => dec.aiId === model.aiId);
    for (const horizon of [5,20] as const) {
      let samples=0,hits=0,sumExcess=0;
      for (const dec of mine) {
        const startIdx = datesIndex.get(dec.sessionDate);
        if (startIdx === undefined || startIdx+horizon>=spyDates.length) continue;
        const endDate = spyDates[startIdx+horizon];
        const spyStart = spyByDate.get(dec.sessionDate),spyEnd=spyByDate.get(endDate);
        if (!spyStart || !spyEnd || spyStart[1]<=0 || spyEnd[4]<=0) continue;
        const spyReturn = spyEnd[4]/spyStart[1]-1;
        const seen = new Set<string>();
        for (const action of dec.actions) {
          if ((action.action !== "BUY" && action.action !== "SELL") ||
              action.quantity<=0 || action.symbol==="SPY" || seen.has(action.symbol)) continue;
          seen.add(action.symbol);
          const prices = bySymbol.get(action.symbol);
          const start = prices?.get(dec.sessionDate),end=prices?.get(endDate);
          if(!start || !end || start[1]<=0 || end[4]<=0)continue;
          const change=end[4]/start[1]-1;
          const direction=action.action==="BUY"?1:-1;
          samples++;
          if(direction*change>0)hits++;
          sumExcess+=direction*(change-spyReturn);
        }
      }
      rows.push({
        aiId:model.aiId!,name:model.name,horizon,samples,hits,
        hitRate:samples?hits/samples:null,
        averageExcessVsSpy:samples?sumExcess/samples:null,
        qualified:samples>=minimumSample,
      });
    }
  }
  return rows;
}
