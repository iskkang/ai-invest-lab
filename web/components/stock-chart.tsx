"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, createSeriesMarkers,
  type IChartApi, type SeriesMarker, type Time,
} from "lightweight-charts";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

type BarIn = { time: string; open: number; high: number; low: number; close: number; volume: number };
export type ChartMarker = { time: string; side: "BUY" | "SELL"; color: string; ai: string };

const RANGES = [
  { key: "1M", label: "1M", bars: 22 }, { key: "3M", label: "3M", bars: 66 },
  { key: "6M", label: "6M", bars: 130 }, { key: "1Y", label: "1Y", bars: 252 },
] as const;

function smaSeries(bars: BarIn[], n: number) {
  const out: { time: Time; value: number }[] = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= n) sum -= bars[i - n].close;
    if (i >= n - 1) out.push({ time: b.time as Time, value: sum / n });
  });
  return out;
}

function rsiSeries(bars: BarIn[], n = 14) {
  const out: { time: Time; value: number }[] = [];
  if (bars.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const c = bars[i].close - bars[i - 1].close; g += Math.max(c, 0); l += Math.max(-c, 0); }
  g /= n; l /= n;
  const push = (i: number) => out.push({ time: bars[i].time as Time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  push(n);
  for (let i = n + 1; i < bars.length; i++) {
    const c = bars[i].close - bars[i - 1].close;
    g = (g * (n - 1) + Math.max(c, 0)) / n; l = (l * (n - 1) + Math.max(-c, 0)) / n;
    push(i);
  }
  return out;
}

export function StockChart({ bars, markers, locale="ko" }: { bars: BarIn[]; markers: ChartMarker[]; locale?:Locale }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("6M");
  const [show, setShow] = useState({ ma20: true, ma50: true, rsi: true, volume: false, trades: true });
  const [tall, setTall] = useState(false);
  const ma20 = useMemo(() => smaSeries(bars, 20), [bars]);
  const ma50 = useMemo(() => smaSeries(bars, 50), [bars]);
  const rsi = useMemo(() => rsiSeries(bars), [bars]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const render = () => {
      chartRef.current?.remove();
      const cs = getComputedStyle(document.documentElement);
      const v = (k: string) => cs.getPropertyValue(k).trim();
      const chart = createChart(el, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: v("--panel") }, textColor: v("--muted"), fontSize: 11, attributionLogo: true },
        grid: { vertLines: { visible: false }, horzLines: { color: v("--line") } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, fixRightEdge: true },
        crosshair: { mode: 0 },
        handleScroll: { vertTouchDrag: false },
      });
      chartRef.current = chart;
      const up = v("--up"), down = v("--down");
      const candle = chart.addSeries(CandlestickSeries, {
        upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down,
      });
      candle.setData(bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
      const line = (data: { time: Time; value: number }[], color: string) =>
        chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(data);
      if (show.ma20) line(ma20, "#3b82f6");
      if (show.ma50) line(ma50, "#a855f7");
      let pane = 1;
      if (show.volume) {
        const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, pane);
        vol.setData(bars.map((b) => ({ time: b.time as Time, value: b.volume, color: (b.close >= b.open ? up : down) + "70" })));
        chart.panes()[pane]?.setHeight(64);
        pane++;
      }
      if (show.rsi) {
        const r = chart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1, priceLineVisible: false }, pane);
        r.setData(rsi);
        r.createPriceLine({ price: 70, color: v("--muted"), lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
        r.createPriceLine({ price: 30, color: v("--muted"), lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
        chart.panes()[pane]?.setHeight(80);
      }
      if (show.trades) {
        const ms: SeriesMarker<Time>[] = markers.slice().sort((a, b) => a.time.localeCompare(b.time)).map((m) => ({
          time: m.time as Time, position: m.side === "BUY" ? "belowBar" : "aboveBar",
          shape: m.side === "BUY" ? "arrowUp" : "arrowDown", color: m.color, size: 0.8,
        }));
        createSeriesMarkers(candle, ms);
      }
      const n = RANGES.find((r) => r.key === range)!.bars;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - n), to: bars.length - 1 });
    };
    render();
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { mo.disconnect(); chartRef.current?.remove(); chartRef.current = null; };
  }, [bars, markers, ma20, ma50, rsi, show, range]);

  const toggles: [keyof typeof show, string, string][] = [
    ["ma20", "MA20", "#3b82f6"], ["ma50", "MA50", "#a855f7"], ["rsi", "RSI", "#8b5cf6"], ["volume", t(locale,"거래량"), "#94a3b8"], ["trades", t(locale,"AI 매매"), "#f59e0b"],
  ];
  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex self-start rounded-lg bg-panel-2 p-0.5" role="tablist" aria-label={t(locale,"기간")}>
          {RANGES.map((r) => (
            <button key={r.key} role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)}
              className={cn("min-w-11 rounded-md px-3 py-1.5 text-sm font-medium", range === r.key ? "bg-accent text-white" : "text-muted")}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
          {toggles.map(([k, label, color]) => (
            <label key={k} className="flex cursor-pointer select-none items-center gap-1.5 text-sm">
              <input type="checkbox" checked={show[k]} onChange={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
                className="h-4 w-4 rounded" style={{ accentColor: color }} />
              {label}
            </label>
          ))}
          <button onClick={() => setTall((t) => !t)} aria-label={t(locale,tall ? "차트 줄이기" : "차트 키우기")}
            className="hidden h-8 w-8 place-items-center rounded-md border border-line text-muted sm:grid">
            {tall ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>
      <div ref={ref} className={cn("w-full", tall ? "h-[560px]" : "h-[300px] sm:h-[380px]")} role="img" aria-label={t(locale,"주가 차트")} />
    </div>
  );
}
