import type { Dataset, Decision } from "./types";
import { nyClock, nyseCalendarStatus } from "./decision-coverage.ts";

export const MODEL_LABELS = { gpt: "GPT", claude: "Claude", gemini: "Gemini", deepseek: "DeepSeek" } as const;
export const MODEL_IDS = Object.keys(MODEL_LABELS) as (keyof typeof MODEL_LABELS)[];
export type RoundState = "closed" | "scheduled" | "running" | "missing" | "price-error" | "failed" | "unverified" | "hold" | "recorded" | "unavailable";
const cutoff = "09:15:00";
const priceError = /inconsistent OHLC|non-positive price|negative volume|NH period:|NH request failed/i;

export function inspectRound(d: Dataset | null, now = new Date()) {
  const today = nyClock(now);
  const calendar = nyseCalendarStatus(today.date);
  const readDate = d?.generatedAt ? new Date(d.generatedAt) : null;
  const read = readDate && Number.isFinite(readDate.getTime()) ? nyClock(readDate) : null;
  const round = d?.rounds.find(r => r.sessionDate === today.date);
  const slotPassed = today.time > cutoff;
  const readAfterCutoff = read?.date === today.date && read.time > cutoff;
  const models = MODEL_IDS.map(id => {
    const rows = d?.decisions.filter(x => x.roundId === round?.id && x.sessionDate === today.date && x.aiId === id) ?? [];
    const row = rows.length === 1 ? rows[0] : null;
    const timestamp = row?.completedAt ? new Date(row.completedAt) : null;
    const clock = timestamp && Number.isFinite(timestamp.getTime()) ? nyClock(timestamp) : null;
    const valid = Boolean(row && row.status === "valid" && row.parsedActions &&
      row.dataAsOf === round?.dataAsOf && row.dataAsOf < today.date &&
      timestamp && timestamp <= now && readDate && timestamp <= readDate &&
      clock?.date === today.date && clock.time >= "08:00:00" && clock.time <= cutoff &&
      (clock.time !== cutoff || timestamp.getUTCMilliseconds() === 0));
    const hashed = valid && row?.marketHash && /^[a-f\d]{64}$/i.test(row.marketHash) ? row.marketHash : null;
    const actionable = (a: Decision["actions"][number]) => a.action === "BUY" || a.action === "SELL";
    const proposed = valid ? (row?.actions.filter(actionable) ?? []) : [];
    const fills = valid ? (d?.trades.filter(x => x.decisionId === row?.id && x.tradeDate === today.date) ?? []) : [];
    const unfilled = valid ? (d?.rejected.filter(x => x.decisionId === row?.id && x.sessionDate === today.date) ?? []) : [];
    return { id, row, valid, clock: clock?.time ?? null, hashed, proposed, fills, unfilled };
  });
  const count = models.filter(m => m.valid).length;
  const hashes = new Set(models.map(m => m.hashed).filter(Boolean));
  const shared = count === 4 && hashes.size === 1 && models.every(m => m.hashed) && hashes.has(round?.snapshotHash ?? null);
  const complete = (round?.status === "decided" || round?.status === "settled") && shared;
  const jobs = d?.dailyJobs?.filter(j => j.sessionDate === today.date) ?? [];
  const active = jobs.some(j => j.status === "running") || round?.status === "deciding" || round?.status === "created";

  let state: RoundState;
  if (calendar === "closed") state = "closed";
  else if (!d) state = "unavailable";
  else if (complete) state = models.every(m => !m.proposed.length) ? "hold" : "recorded";
  else if (round?.status === "aborted") state = priceError.test(round.abortReason ?? "") ? "price-error" : "failed";
  else if (jobs.some(j => j.priceError)) state = "price-error";
  else if (jobs.some(j => j.status === "failed")) state = "failed";
  else if (active && !slotPassed) state = "running";
  else if (calendar === "unknown" || round || active || d.experiment.status !== "running" || today.date < d.experiment.startSession) state = "unverified";
  else if (!slotPassed) state = "scheduled";
  else state = readAfterCutoff ? "missing" : "unverified";

  return { date: today.date, state, round, models, count, shared, complete, readTime: read?.date === today.date ? read.time : null };
}
