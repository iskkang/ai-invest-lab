import type { Dataset } from "./types";

// Published regular NYSE holidays (not early closes), valid only for the years below.
// Source: https://www.nyse.com/trade/hours-calendars. Update when NYSE adds a year
// or announces a special closure. Never infer an absence outside this calendar.
const closures = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
  "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
]);
const models = ["gpt", "claude", "gemini", "deepseek"];
const newYork = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function nyClock(at: Date) {
  const p = Object.fromEntries(newYork.formatToParts(at).map(({type, value}) => [type, value]));
  return { date: [p.year, p.month, p.day].join("-"), time: [p.hour, p.minute, p.second].join(":") };
}

export function nyseCalendarStatus(date: string): "open" | "closed" | "unknown" {
  if (date < "2026-01-01" || date > "2028-12-31") return "unknown";
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  return weekday === 0 || weekday === 6 || closures.has(date) ? "closed" : "open";
}

export type CoverageStatus = "recorded" | "hold" | "missed" | "pending" | "unverified";
export type Coverage = { date: string; status: CoverageStatus; models: number };

export function recentDecisionCoverage(
  d: Pick<Dataset, "experiment" | "rounds" | "decisions" | "generatedAt">,
  now = new Date(),
  limit = 5,
): Coverage[] {
  const today = nyClock(now);
  const fetched = new Date(d.generatedAt);
  const read = Number.isNaN(fetched.getTime()) ? null : nyClock(fetched);
  if (today.date < d.experiment.startSession ||
      today.date < "2026-01-01" || today.date > "2028-12-31") return [];
  const days: Coverage[] = [];
  const cursor = new Date(today.date + "T00:00:00Z");
  for (let lookback = 0; lookback < 20 && days.length < limit; lookback++, cursor.setUTCDate(cursor.getUTCDate() - 1)) {
    const date = cursor.toISOString().slice(0, 10);
    if (date < d.experiment.startSession || date < "2026-01-01") break;
    if (cursor.getUTCDay() === 6 || cursor.getUTCDay() === 0 || closures.has(date)) continue;
    const round = d.rounds.find(r => r.sessionDate === date);
    if (round && (round.status === "decided" || round.status === "settled")) {
      const rows = d.decisions.filter(x => x.roundId === round.id && x.sessionDate === date &&
        x.status === "valid" && x.dataAsOf === round.dataAsOf && x.dataAsOf < date &&
        models.includes(x.aiId) && Array.isArray(x.actions));
      const count = new Set(rows.map(x => x.aiId)).size;
      if (count === models.length && rows.length === models.length) {
        // Empty action lists are a valid decision to make no trades. Rejected
        // trade instructions are still BUY/SELL decisions, not all-HOLD.
        const hold = rows.every(x => x.actions.every(a => a.action === "HOLD"));
        days.push({ date, status: hold ? "hold" : "recorded", models: count });
      } else {
        days.push({ date, status: "unverified", models: count });
      }
      continue;
    }
    // A cached read taken before the cutoff must not turn into a "miss" on
    // its own. Only a post-cutoff snapshot can establish the missing round.
    const cutoff = "09:15:00";
    const expired = date < today.date || today.time > cutoff;
    const observed = read && (date < read.date || (date === read.date && read.time > cutoff));
    const paused = !round && d.experiment.status !== "running";
    days.push({
      date, models: 0,
      status: !expired ? "pending" : observed && !paused ? "missed" : "unverified",
    });
  }
  return days;
}
