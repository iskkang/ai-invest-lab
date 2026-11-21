import type { LineInput } from "@/components/charts";
import type { Locale } from "@/lib/public-content";

const LEGEND_LABEL: Record<Locale, string> = {
  ko: "차트 범례",
  en: "Chart legend",
  zh: "图表图例",
  ja: "チャートの凡例",
};

/** Shared by AI performance and historical research charts.
 * Real colored dots, stable chip boundaries and semantic list items.
 */
export function ChartLegend({
  lines, locale,
}: {
  lines: ReadonlyArray<Pick<LineInput, "name" | "color" | "dashed">>;
  locale: Locale;
}) {
  if (!lines.length) return null;
  return (
    <ul aria-label={LEGEND_LABEL[locale]} data-chart-legend="true"
      className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
      {lines.map((line, index) => (
        <li key={line.name + "-" + index}
          data-legend-item={line.name}
          className="inline-flex min-h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-panel-2 px-3 py-1.5 text-[11px] font-semibold text-fg">
          <span aria-hidden="true" data-legend-dot={line.name}
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-line"
            style={{ backgroundColor: line.color }} />
          <span>{line.name}</span>
          {line.dashed && <span aria-hidden="true" className="h-0 w-3 shrink-0 border-t border-dashed border-current opacity-60" />}
        </li>
      ))}
    </ul>
  );
}
