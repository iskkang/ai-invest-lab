import test from "node:test";
import assert from "node:assert/strict";
import { plannedSession, tick } from "./worker.mjs";

const utc = s => Date.parse(s);
test("same New York slots in summer and winter; wrong UTC candidates skipped", () => {
  for (const [willRun, wontRun, day] of [
    ["2026-07-28T12:17:00Z", "2026-07-28T13:17:00Z", "2026-07-28"],
    ["2026-11-25T13:17:00Z", "2026-11-25T12:17:00Z", "2026-11-25"],
  ]) {
    assert.equal(plannedSession(utc(willRun), utc(willRun) + 1000), day);
    assert.equal(plannedSession(utc(wontRun), utc(wontRun) + 1000), null);
  }
});
test("weekend, delayed, wrong minute and future events cannot trigger backfill", () => {
  for (const [slot, now] of [
    ["2026-11-28T13:17:00Z", "2026-11-28T13:17:02Z"],
    ["2026-11-25T13:57:00Z", "2026-11-25T14:15:00Z"],
    ["2026-11-25T13:57:00Z", "2026-11-26T13:57:00Z"],
    ["2026-11-25T13:37:00Z", "2026-11-25T13:36:59Z"],
    ["2026-11-25T13:38:00Z", "2026-11-25T13:38:00Z"],
  ]) assert.equal(plannedSession(utc(slot), utc(now)), null);
});
test("dry-run makes no network call, and live requires a binding", async () => {
  const slot = utc("2026-11-25T13:17:00Z");
  const never = () => assert.fail("unexpected request");
  assert.deepEqual(await tick(slot, slot, {}, never), { status: "dry-run", session: "2026-11-25" });
  await assert.rejects(tick(slot, slot, { SCHEDULER_MODE: "live" }, never), /is missing/);
});
test("one restricted private dispatch, no retry and no remote body in errors", async () => {
  const slot = utc("2026-11-25T13:57:00Z");
  const env = { SCHEDULER_MODE: "live", GITHUB_ACTIONS_TOKEN: "test-only" };
  let calls = 0;
  const result = await tick(slot, slot, env, (url, init) => {
    calls++;
    assert.match(url, /iskkang\/ai-invest-lab\/actions\/workflows\/daily.yml\/dispatches$/);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.deepEqual(JSON.parse(init.body), { ref: "main", inputs: { job: "run-daily", scheduled_session: "2026-11-25" } });
    return new Response(null, { status: 204 });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "dispatch-accepted", session: "2026-11-25" });
  await assert.rejects(tick(slot, slot, env, () => new Response("raw remote body", { status: 403 })), /^Error: GitHub daily-engine dispatch failed \(HTTP 403\)$/);
});
test("Workers-compatible fetch rejects a redirect without forwarding credentials", async () => {
  const slot = utc("2026-11-25T13:17:00Z");
  const env = { SCHEDULER_MODE: "live", GITHUB_ACTIONS_TOKEN: "test-only" };
  const requests = [];
  const workersFetch = (url, init) => {
    requests.push({ url, init });
    // Cloudflare Workers implements only follow/manual, unlike Node fetch.
    if (!["follow", "manual"].includes(init.redirect)) {
      throw new TypeError("Invalid redirect value, must be one of follow or manual");
    }
    assert.equal(init.redirect, "manual", "credential-bearing requests must not follow redirects");
    return new Response("remote redirect body", {
      status: 302,
      headers: { Location: "https://outside.example/collect" },
    });
  };
  await assert.rejects(tick(slot, slot, env, workersFetch),
    /^Error: GitHub daily-engine dispatch failed \(HTTP 302\)$/);
  assert.equal(requests.length, 1, "must not retry or request the Location URL");
  assert.equal(new URL(requests[0].url).origin, "https://api.github.com");
  assert.equal(requests[0].init.headers.Authorization, "Bearer test-only");
});
