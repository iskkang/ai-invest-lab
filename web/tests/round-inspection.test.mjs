import test from "node:test";
import assert from "node:assert/strict";
import { inspectRound } from "../lib/round-inspection.ts";
import { fixtureRound, fixtureNow } from "../app/visual-layout-check/round/fixtures.ts";

test("official-looking data requires four timely valid decisions on one common snapshot", () => {
  const d = fixtureRound("recorded");
  const r = inspectRound(d, fixtureNow);
  assert.equal(r.state, "recorded");
  assert.equal(r.count, 4);
  assert.equal(r.shared, true);
  assert.equal(r.models[0].fills[0].quantity, 24);
  assert.equal(r.models[2].unfilled[0].status, "REJECTED");
  d.decisions[3].marketHash = "0".repeat(64);
  assert.equal(inspectRound(d, fixtureNow).state, "unverified");
});
test("late, future and unparsed responses do not count as verified decisions", () => {
  const d = fixtureRound("recorded");
  d.decisions[0].completedAt = "2026-11-27T14:15:00.001Z";
  d.decisions[1].completedAt = "2026-11-27T14:45:00Z";
  d.decisions[2].parsedActions = false;
  assert.equal(inspectRound(d, fixtureNow).count, 1);
  assert.equal(inspectRound(d, fixtureNow).state, "unverified");
});
test("an all-Hold result is not a missing, failed, or unreachable round", () => {
  assert.equal(inspectRound(fixtureRound("hold"), fixtureNow).state, "hold");
  assert.equal(inspectRound(fixtureRound("missing"), fixtureNow).state, "missing");
  assert.equal(inspectRound(fixtureRound("price-error"), fixtureNow).state, "price-error");
  assert.equal(inspectRound(null, fixtureNow).state, "unavailable");
});
test("never infer a missing round from stale data or on an NYSE holiday", () => {
  const d = fixtureRound("missing");
  d.generatedAt = "2026-11-27T14:11:00Z";
  assert.equal(inspectRound(d, fixtureNow).state, "unverified");
  d.generatedAt = "2026-11-27T13:21:00Z";
  const now = new Date("2026-11-27T13:22:00Z");
  assert.equal(inspectRound(d, now).state, "scheduled");
  d.dailyJobs = [{sessionDate:"2026-11-27", status:"running", priceError:false}];
  assert.equal(inspectRound(d, now).state, "running");
  assert.equal(inspectRound(null, new Date("2026-11-26T14:41:00Z")).state, "closed");
});
