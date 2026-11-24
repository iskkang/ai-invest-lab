import { recentDecisionCoverage, type CoverageStatus } from "@/lib/decision-coverage";
import type { Dataset } from "@/lib/types";

const label: Record<CoverageStatus, string> = {
  recorded: "4 model decisions recorded",
  hold: "All 4 models held",
  missed: "Missed · no official round",
  pending: "Decision window open or upcoming",
  unverified: "Official outcome not verified",
};

export function DecisionCoverage({ d, now }: { d: Dataset; now?: Date }) {
  const rows = recentDecisionCoverage(d, now);
  if (!rows.length) return null;
  return (
    <section className="rounded-xl border border-line bg-panel p-4" aria-label="NYSE decision coverage">
      <h2 className="text-sm font-semibold">NYSE decision coverage</h2>
      <p className="mt-1 text-xs text-muted">New York session dates. Decisions are separate from fills and returns. Missed decisions are not backfilled.</p>
      <ul className="mt-2 divide-y divide-line text-sm">
        {rows.map(row => (
          <li key={row.date} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2" data-decision-status={row.status}>
            <time className="tabular-nums" dateTime={row.date}>{row.date}</time>
            <span>{label[row.status]}{row.status === "unverified" && row.models > 0 ? ` (${row.models}/4)` : ""}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
