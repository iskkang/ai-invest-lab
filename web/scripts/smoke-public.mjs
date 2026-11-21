/**
 * Full HTTP public/private gate smoke test against the built Next.js server.
 * Uses synthetic test-only Basic credentials. No DB/API network calls.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const root = new URL("../", import.meta.url).pathname;
const port = 32284;
const base = `http://127.0.0.1:${port}`;
const server = spawn("node", ["./node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    DATA_MODE: "demo",
    SITE_ACCESS: "private",
    SITE_USER: "ci",
    SITE_PASSWORD: "test-password-never-used-in-production",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", c => { output += String(c); });
server.stderr.on("data", c => { output += String(c); });

async function ready() {
  for (let i = 0; i < 55; i += 1) {
    if (server.exitCode !== null) throw new Error("Next.js server exited before ready");
    try {
      const res = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch { /* starting */ }
    await sleep(500);
  }
  throw new Error("Next.js server did not start; log excerpt: " + output.slice(-1300));
}

async function request(path, options = {}) {
  return fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(8000), ...options });
}
async function assertPublic(path, needle) {
  const res = await request(path);
  assert.equal(res.status, 200, `expected anonymous public 200 at ${path}`);
  assert.equal(res.headers.get("www-authenticate"), null, `unexpected Basic prompt at ${path}`);
  const html = await res.text();
  assert.ok(html.includes(needle), `missing expected localized content at ${path}`);
}

try {
  await ready();
  const rootRes = await request("/");
  assert.ok([301, 302, 303, 307, 308].includes(rootRes.status), `root must redirect: ${rootRes.status}`);
  assert.equal(new URL(rootRes.headers.get("location"), base).pathname, "/en");
  assert.equal(rootRes.headers.get("www-authenticate"), null);

  await assertPublic("/en", "Can AI models make better stock decisions");
  await assertPublic("/ko", "어떤 AI가 더 나은");
  await assertPublic("/zh", "哪一个 AI");
  await assertPublic("/ja", "どのAI");
  await assertPublic("/en/methodology", "Comparable information");
  await assertPublic("/ko/faq", "실제 주식을 사거나");
  await assertPublic("/zh/privacy", "数据处理");
  await assertPublic("/ja/advertise", "広告");
  await assertPublic("/robots.txt", "/sitemap.xml");
  await assertPublic("/llms.txt", "# AI Invest Lab");
  await assertPublic("/ads.txt", "No advertising sellers");

  const map = await request("/sitemap.xml");
  assert.equal(map.status, 200);
  const xml = await map.text();
  for (const loc of ["en", "ko", "zh", "ja"]) {
    assert.ok(xml.includes(`/${loc}/methodology`));
    assert.ok(xml.includes(`/${loc}/faq`));
  }

  for (const path of ["/lab", "/portfolio", "/trades", "/performance", "/about", "/api/health/db", "/en/unknown"]) {
    const res = await request(path);
    assert.equal(res.status, 401, `private path escaped gate: ${path}`);
    assert.match(res.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(res.headers.get("www-authenticate") || "", /Basic/);
  }
  console.log("PASS: Public four-language routes, SEO files and private dashboard/API gate.");
} finally {
  server.kill("SIGTERM");
  await sleep(500);
  if (server.exitCode === null) server.kill("SIGKILL");
}
