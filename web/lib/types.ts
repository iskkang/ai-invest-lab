export type Mode = "live" | "demo";

export interface Account {
  id: number;
  kind: "ai" | "benchmark";
  aiId: string | null;
  benchmarkCode: string | null;
  name: string;
  color: string;
  model: string | null;
  initialCash: number;
}

export interface Snapshot {
  accountId: number;
  date: string;
  equity: number;
  cash: number;
  cumReturn: number;
  dailyReturn: number | null;
  holdings: HoldingDetail[];
}

export interface HoldingDetail {
  symbol: string;
  quantity: number;
  avgCost: number;
  close: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface Stats {
  equity: number;
  cash: number;
  holdings_value: number;
  cash_weight: number | null;
  cum_return: number;
  daily_return: number | null;
  weekly_return: number | null;
  monthly_return: number | null;
  max_drawdown: number;
  volatility_ann: number | null;
  sharpe: number | null;
  realized_pnl: number;
  unrealized_pnl: number;
  trade_count: number;
  win_rate: number | null;
  max_position_weight: number;
  hhi: number;
  positions: number;
  observations: number;
  notes: string[];
}

export interface Trade {
  id: number;
  accountId: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  refOpenPrice: number;
  price: number;
  gross: number;
  fee: number;
  netCash: number;
  realizedPnl: number | null;
  tradeDate: string;
  executedAt: string;
  decisionId: number | null;
  decisionAt: string | null;
  dataAsOf: string | null;
}

export interface RejectedOrder {
  id: number;
  decisionId?: number | null;
  accountId: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  status: "REJECTED" | "EXPIRED";
  reason: string;
  sessionDate: string;
}

export interface DecisionAction {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  quantity: number;
  reason: string;
  risks: string[];
  indicators_used: string[];
  expected_return_pct: number | null;
  confidence: string | null;
}

export interface Decision {
  id: number;
  roundId: number;
  aiId: string;
  model: string;
  status: "valid" | "invalid" | "error";
  error: string | null;
  summary: string | null;
  actions: DecisionAction[];
  completedAt?: string | null;
  marketHash?: string | null;
  parsedActions?: boolean;
  sessionDate: string;
  dataAsOf: string;
}

export interface Round {
  id: number;
  sessionDate: string;
  dataAsOf: string;
  decisionAt: string;
  status: string;
  abortReason: string | null;
  snapshotHash: string | null;
}

export type Bar = [string, number, number, number, number, number]; // date,o,h,l,c,v

export interface UniverseChange {
  id: number;
  action: "add" | "remove";
  symbol: string;
  reason: string;
  scheduledAt: string;
  effectiveSession: string;
  status: "scheduled" | "applied";
  appliedAt: string | null;
  appliedRoundId: number | null;
}

export interface Dataset {
  locale: "en" | "zh" | "ko" | "ja";
  publicQuotesRedacted: boolean;
  mode: Mode;
  experiment: {
    name: string;
    startSession: string;
    initialCash: number;
    maxPositionWeight: number;
    feeBps: number;
    slippageBps: number;
    status: string;
  };
  accounts: Account[];
  snapshots: Snapshot[];
  stats: Record<number, Stats>;
  trades: Trade[];
  rejected: RejectedOrder[];
  rounds: Round[];
  decisions: Decision[];
  universe: { symbol: string; name: string; sector: string | null; role: string }[];
  prices: Record<string, Bar[]>;
  priceProvenance?: Record<string, { provider: string; basis: string; volumeUnit: string }>;
  generatedAt: string;
  dailyJobs?: { sessionDate: string; status: string; priceError: boolean }[];
  universeChanges?: UniverseChange[];
}
