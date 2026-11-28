import type { Snapshot, Trade } from "./types";

export interface PositionRow {
  key: string;
  symbol: string;
  quantity: number;
  cost: number | null;
  pnl: number | null;
  bought: string | null;
  sold: string | null;
  carried?: boolean;
}

// Follow each continuous holding period. A daily snapshot reconciles shares after
// corporate actions. Partial exits keep the opening date until the balance is zero.
export function positionHistory(snapshots: Snapshot[], trades: Trade[]) {
  const closes = [...snapshots].sort((a,b) => a.date.localeCompare(b.date));
  const latest = closes.at(-1);
  if (!latest) return { latest, rows: [] as PositionRow[] };
  const fills = trades.filter(t => t.tradeDate <= latest.date).sort((a,b) =>
    a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
  const balances = new Map<string,{quantity:number; bought:string|null}>();
  const exits: PositionRow[] = [];
  let cursor = 0;
  for (const close of closes) {
    while (cursor < fills.length && fills[cursor].tradeDate <= close.date) {
      const t = fills[cursor++];
      const held = balances.get(t.symbol);
      if (t.side === "BUY") {
        balances.set(t.symbol, {quantity:(held?.quantity ?? 0) + t.quantity,
          bought:held ? held.bought : t.tradeDate});
      } else {
        exits.push({key:"sale-" + t.id, symbol:t.symbol, quantity:t.quantity,
          cost:t.saleResult?.cost ?? null, pnl:t.saleResult?.pnl ?? null,
          bought:held?.bought ?? null, sold:t.tradeDate});
        if (held && held.quantity > t.quantity) held.quantity -= t.quantity;
        else balances.delete(t.symbol);
      }
    }
    const marked = new Set(close.holdings.map(h => h.symbol));
    for (const symbol of balances.keys()) if (!marked.has(symbol)) balances.delete(symbol);
    for (const h of close.holdings) {
      balances.set(h.symbol, {quantity:h.quantity, bought:balances.get(h.symbol)?.bought ?? null});
    }
  }
  const open: PositionRow[] = latest.holdings.filter(h => h.quantity > 0)
    .sort((a,b) => b.marketValue - a.marketValue).map(h => ({
      key:"held-" + h.symbol, symbol:h.symbol, quantity:h.quantity,
      cost:Math.round((h.marketValue - h.unrealizedPnl) * 100) / 100, pnl:h.unrealizedPnl,
      bought:balances.get(h.symbol)?.bought ?? null, sold:null, carried:latest.staleMarks?.includes(h.symbol),
    }));
  return {latest, rows:[...open, ...exits.reverse()]};
}
