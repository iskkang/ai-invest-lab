// Cloudflare controls when to ask GitHub to run; the engine alone decides whether
// today's NYSE session is eligible, whether it is in-window, and whether to commit.
const localClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const endpoint = "https://api.github.com/repos/iskkang/ai-invest-lab/actions/workflows/daily.yml/dispatches";
const launchMinutes = new Set([17, 37, 57]);
const weekdays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

function local(ms) {
  if (!Number.isFinite(ms)) return null;
  const p = Object.fromEntries(localClock.formatToParts(ms).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, hour: Number(p.hour), minute: Number(p.minute) };
}

export function plannedSession(scheduledTime, now) {
  const scheduled = local(scheduledTime);
  const actual = local(now);
  const delay = now - scheduledTime;
  if (!scheduled || !actual || !weekdays.has(scheduled.weekday) || scheduled.hour !== 8 ||
      !launchMinutes.has(scheduled.minute) || scheduled.day !== actual.day ||
      delay < 0 || delay > 5 * 60_000 || actual.hour * 60 + actual.minute > 9 * 60 + 10) return null;
  return scheduled.day;
}

export async function tick(scheduledTime, now, env, request = fetch) {
  const session = plannedSession(scheduledTime, now);
  if (!session) return { status: "skipped" };
  if (env.SCHEDULER_MODE !== "live") return { status: "dry-run", session };
  if (!env.GITHUB_ACTIONS_TOKEN) throw new Error("GITHUB_ACTIONS_TOKEN is missing");
  const response = await request(endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "LogicSight-scheduler",
    },
    body: JSON.stringify({ ref: "main", inputs: { job: "run-daily", scheduled_session: session } }),
    signal: AbortSignal.timeout(9_000),
  });
  // GitHub acceptance proves only dispatch, never a saved decision.
  if (!response.ok) throw new Error(`GitHub daily-engine dispatch failed (HTTP ${response.status})`);
  return { status: "dispatch-accepted", session };
}
export default {
  async scheduled(event, env) {
    console.log(JSON.stringify(await tick(event.scheduledTime, Date.now(), env)));
  },
};
