/**
 * Reconciled charts use one complete provider history per symbol, unchanged.
 * The provider's adjustment basis and native volume unit are not inferred.
 * Legacy raw datasets retain the previous explicit split adjustment:
 * historical OHLC divided by elapsed split ratios, volume multiplied by them.
 *
 * The server loader is responsible for filtering actions by price_source and
 * created_at <= request cutoff. This pure function is easily regression-tested.
 */
import { LIVE_PRICE_SOURCE } from "./market-data-disclosure.ts";

export type PriceRow = {
  symbol: string;
  trade_date: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
  source?: string;
  provider?: string;
  basis?: string;
  volume_unit?: string;
};

export type SplitRow = {
  symbol: string;
  kind: string;
  ex_date: string;
  ratio: number | string | null;
};

export type ChartBar = [string, number, number, number, number, number];

function round4(n: number) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function makeAdjustedPriceMap(
  prices: PriceRow[],
  corporateActions: SplitRow[],
  asOf: string,
): Record<string, ChartBar[]> {
  const splits = new Map<string, SplitRow[]>();
  for (const a of corporateActions) {
    if (a.kind !== "split" || a.ex_date > asOf) continue;
    const ratio = Number(a.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Invalid split ratio: ${a.symbol} ${a.ex_date}`);
    const items = splits.get(a.symbol) ?? [];
    items.push(a);
    splits.set(a.symbol, items);
  }
  for (const items of splits.values()) items.sort((a, b) => a.ex_date.localeCompare(b.ex_date));

  const result: Record<string, ChartBar[]> = {};
  for (const p of prices) {
    if (p.trade_date > asOf) continue;
    let factor = 1;
    if (p.source === LIVE_PRICE_SOURCE) {
      if (!p.provider || !p.basis || !p.volume_unit) {
        throw new Error(`Missing provider provenance: ${p.symbol} ${p.trade_date}`);
      }
      // The complete published history may already be adjusted. Do not apply
      // a second inferred adjustment or turn unspecified volume units into shares.
    } else {
      for (const a of splits.get(p.symbol) ?? []) {
        if (p.trade_date < a.ex_date) factor *= Number(a.ratio);
      }
    }
    const values = [p.open, p.high, p.low, p.close].map((v) => round4(Number(v) / factor));
    const volume = Math.trunc(Number(p.volume) * factor);
    (result[p.symbol] ??= []).push([p.trade_date, values[0], values[1], values[2], values[3], volume]);
  }
  for (const bars of Object.values(result)) bars.sort((a, b) => a[0].localeCompare(b[0]));
  return result;
}
