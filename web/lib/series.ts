import type { Dataset } from "./types";
import type { LineInput } from "@/components/charts";

export function returnLines(d: Dataset, opts: { benchmarks?: boolean; only?: number[] } = {}): LineInput[] {
  const accounts = d.accounts.filter((a) => (opts.only ? opts.only.includes(a.id) : a.kind === "ai" || opts.benchmarks));
  return accounts.map((a) => ({
    name: a.name,
    color: a.color,
    dashed: a.kind === "benchmark",
    data: d.snapshots
      .filter((s) => s.accountId === a.id)
      .sort((x, y) => x.date.localeCompare(y.date))
      .map((s) => ({ time: s.date, value: Number((s.cumReturn * 100).toFixed(4)) })),
  }));
}

export function sma(values: { time: string; value: number }[], n: number) {
  const out: { time: string; value: number }[] = [];
  let sum = 0;
  values.forEach((v, i) => {
    sum += v.value;
    if (i >= n) sum -= values[i - n].value;
    if (i >= n - 1) out.push({ time: v.time, value: sum / n });
  });
  return out;
}

export function rsi(values: { time: string; value: number }[], n = 14) {
  const out: { time: string; value: number }[] = [];
  if (values.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const ch = values[i].value - values[i - 1].value;
    g += Math.max(ch, 0); l += Math.max(-ch, 0);
  }
  g /= n; l /= n;
  out.push({ time: values[n].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  for (let i = n + 1; i < values.length; i++) {
    const ch = values[i].value - values[i - 1].value;
    g = (g * (n - 1) + Math.max(ch, 0)) / n;
    l = (l * (n - 1) + Math.max(-ch, 0)) / n;
    out.push({ time: values[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  }
  return out;
}
