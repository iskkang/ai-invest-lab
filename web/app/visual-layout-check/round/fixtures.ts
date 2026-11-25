import type { Dataset, Decision, DecisionAction } from "@/lib/types";

const sessionDate = "2026-11-27";
const dataAsOf = "2026-11-25";
const marketHash = "7ac9240b750e61ab".repeat(4);
export const fixtureNow = new Date("2026-11-27T14:41:00Z");
const action = (symbol: string, kind: "BUY" | "SELL", quantity: number): DecisionAction =>
  ({ symbol, action: kind, quantity, reason: "Fixture only", risks: [], indicators_used: [], expected_return_pct: null, confidence: null });

export function fixtureRound(mode: string): Dataset {
  const round: Dataset["rounds"][number] = {
    id: 42, sessionDate, dataAsOf, decisionAt: "2026-11-27T13:25:00Z",
    status: "settled", snapshotHash: marketHash, abortReason: null,
  };
  const decisions = ["gpt","claude","gemini","deepseek"].map((aiId, i): Decision => ({
    id: 111+i, roundId: 42, aiId, model: aiId, status: "valid", error: null, summary: null,
    actions: mode === "hold" ? [] : ([ [action("AAPL","BUY",24)], [], [action("NVDA","SELL",8)], [] ][i]),
    sessionDate, dataAsOf, completedAt: "2026-11-27T13:25:" + (31+i) + "Z", marketHash, parsedActions: true,
  }));
  return {
    locale: "en", publicQuotesRedacted: true, mode: "demo",
    experiment: { name: "layout-test-fixture", startSession: "2026-11-23", initialCash: 100000,
      maxPositionWeight: 0.2, feeBps: 1, slippageBps: 2, status: "running" },
    generatedAt: fixtureNow.toISOString(), accounts: [], snapshots: [], stats: {}, universe: [], prices: {},
    rounds: mode === "missing" || mode === "price-error" ? [] : [round],
    decisions: mode === "missing" || mode === "price-error" ? [] : decisions,
    dailyJobs: mode === "price-error" ? [{ sessionDate, status: "failed", priceError: true }] : [],
    rejected: mode === "recorded" ? [{ id: 1, decisionId: 113, accountId: 3, side: "SELL", symbol: "NVDA",
      quantity: 8, status: "REJECTED", reason: "Fixture only", sessionDate }] : [],
    trades: mode === "recorded" ? [{ id: 1, accountId: 1, symbol: "AAPL", side: "BUY", quantity: 24,
      refOpenPrice: 0, price: 0, gross: 0, fee: 0, netCash: 0, realizedPnl: null, tradeDate: sessionDate,
      executedAt: "2026-11-27T14:30:00Z", decisionId: 111, decisionAt: round.decisionAt, dataAsOf }] : [],
  };
}
