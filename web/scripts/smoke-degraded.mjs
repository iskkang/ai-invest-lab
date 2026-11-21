/** Regression: public educational pages survive a LIVE database outage without fake returns. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const root = new URL("../", import.meta.url).pathname;
const port = 32285;
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATA_MODE: "live", SITE_ACCESS: "private", SITE_USER: "ci", SITE_PASSWORD: "integration-test" };
delete env.SUPABASE_URL;
delete env.SUPABASE_SECRET_KEY;
const server = spawn("node", ["./node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: root, env, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", x => { output += String(x); });
server.stderr.on("data", x => { output += String(x); });
const req = path => fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(8000) });
try {
  let ok = false;
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw Error("Server exited before ready");
    try {
      const res = await req("/status");
      if (res.ok) { ok = true; break; }
    } catch {}
    await sleep(400);
  }
  if (!ok) throw Error("Degraded server did not start: " + output.slice(-1000));
  const status = await req("/status");
  assert.equal(status.status, 200);
  assert.equal((await status.json()).dataMode, "live");
  for (const path of ["/ko/methodology", "/en/faq", "/ja/privacy"]) {
    const response = await req(path);
    assert.equal(response.status, 200, "editorial must remain available: " + path);
    const html = await response.text();
    assert.ok(html.includes("AI Invest Lab"), "editorial content missing: " + path);
  }
  const privateApi = await req("/api/health/db");
  assert.equal(privateApi.status, 401, "private health endpoint unexpectedly public");
  const publicDashboard = await req("/ko");
  const html = await publicDashboard.text();
  assert.ok(html.includes("투자 데이터 화면을 불러오지 못했습니다."), "must show explicit data-unavailable state");
  assert.ok(!html.includes("DEMO —"), "must not fall back to demo while live");
  console.log("PASS: LIVE outage leaves editorial/status available; dashboard shows no fabricated returns.");
} finally {
  server.kill("SIGTERM");
  await sleep(500);
  if (server.exitCode === null) server.kill("SIGKILL");
}
