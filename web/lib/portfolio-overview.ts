import type { Dataset } from "./types";

export function portfolioOverview(d: Dataset) {
  const names = new Map(d.universe.map(s => [s.symbol, s.name]));
  const latest = new Map<number, Dataset["snapshots"][number]>();
  for (const s of d.snapshots) {
    if ((latest.get(s.accountId)?.date ?? "") < s.date) latest.set(s.accountId, s);
  }
  const rows = d.accounts.filter(a => a.kind === "ai").map(a => {
    const s = latest.get(a.id);
    const positions = (s?.holdings ?? []).filter(h => h.quantity > 0).map(h => {
      const basis = h.marketValue - h.unrealizedPnl;
      return {
        symbol: h.symbol, name: names.get(h.symbol) ?? "", quantity: h.quantity,
        value: h.marketValue, pnl: h.unrealizedPnl,
        gain: basis > 0 ? h.unrealizedPnl / basis : null,
        weight: s && s.equity > 0 ? h.marketValue / s.equity : null,
        carried: s?.staleMarks?.includes(h.symbol) ?? false,
      };
    }).sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol));
    const pnl = positions.reduce((sum, p) => sum + p.pnl, 0);
    const cost = positions.reduce((sum, p) => sum + p.value - p.pnl, 0);
    return {
      id: a.id, name: a.name, color: a.color, date: s?.date ?? null,
      equity: s?.equity ?? null, cash: s?.cash ?? null, gain: s?.cumReturn ?? null,
      positions, openGain: cost > 0 ? pnl / cost : null,
    };
  });
  return rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") ||
    (b.gain ?? -Infinity) - (a.gain ?? -Infinity) || a.id - b.id);
}

export type PortfolioRow = ReturnType<typeof portfolioOverview>[number];
