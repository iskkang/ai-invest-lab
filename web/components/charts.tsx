"use client";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

import { useEffect, useRef } from "react";
import {
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type Time,
} from "lightweight-charts";

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => cs.getPropertyValue(k).trim();
  return { bg: v("--panel"), fg: v("--muted"), line: v("--line"), up: v("--up"), down: v("--down") };
}

function useChart(build: (el: HTMLDivElement, chart: IChartApi) => void, deps: unknown[], height: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let chart: IChartApi | null = null;
    const render = () => {
      chart?.remove();
      const c = themeColors();
      chart = createChart(el, {
        autoSize: true,
        height,
        layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.fg, fontSize: 11,
                  attributionLogo: true },
        grid: { vertLines: { color: c.line }, horzLines: { color: c.line } },
        rightPriceScale: { borderColor: c.line },
        timeScale: { borderColor: c.line, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: 0 },
        handleScroll: { vertTouchDrag: false },
      });
      chart.timeScale().fitContent();
      build(el, chart);
    };
    render();
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { mo.disconnect(); chart?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export interface LineInput { name: string; color: string; dashed?: boolean; data: { time: string; value: number }[] }

/** 누적 수익률(%) 비교 차트 */
export function ReturnChart({ lines, height = 300, locale="ko" }: { lines: LineInput[]; height?: number; locale?:Locale }) {
  const ref = useChart((_, chart) => {
    for (const l of lines) {
      const s = chart.addSeries(LineSeries, {
        color: l.color, lineWidth: l.dashed ? 1 : 2, lineStyle: l.dashed ? 2 : 0,
        priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(2)}%`, minMove: 0.01 },
        lastValueVisible: !l.dashed, priceLineVisible: false, title: "",
      });
      s.setData(l.data.map((p) => ({ time: p.time as Time, value: p.value })));
    }
  }, [JSON.stringify(lines.map((l) => [l.name, l.data.length, l.data.at(-1)?.value]))], height);
  return <div ref={ref} style={{ height }} className="w-full" aria-label={t(locale,"누적 수익률 차트")} role="img" />;
}
