import assert from "node:assert/strict";
import test from "node:test";
import { recentDecisionCoverage } from "../lib/decision-coverage.ts";

const date = "2026-11-24";
const afterCutoff = "2026-11-24T14:16:00Z";
const models = ["gpt", "claude", "gemini", "deepseek"];
const round = { id: 7, sessionDate: date, dataAsOf: "2026-11-23", status: "settled" };
const rows = models.map(aiId => ({ roundId: 7, aiId, sessionDate: date,
  dataAsOf: round.dataAsOf, status: "valid", actions: [] }));
const result = (overrides = {}, now = afterCutoff) =>
  recentDecisionCoverage({ experiment: {startSession: "2026-11-23", status: "running"},
    generatedAt: afterCutoff, rounds: [], decisions: [], ...overrides }, new Date(now));

test("complete settled all-HOLD records are not missing even without orders or valuations", () => {
  assert.deepEqual(result({rounds:[round], decisions:rows})[0], {date,status:"hold",models:4});
});
test("BUY with no fill (including rejected order) is not all-HOLD", () => {
  const decisions = [{...rows[0], actions: [{action:"BUY",quantity:1}]}, ...rows.slice(1)];
  assert.deepEqual(result({rounds:[round], decisions})[0], {date,status:"recorded",models:4});
});
test("a green or partial status is not all four; duplicate and cross-session decisions do not count", () => {
  const three = rows.slice(0,3);
  for (const decisions of [three, [...three, rows[0]], [...three, {...rows[3],sessionDate:"2026-11-23"}]]) {
    assert.deepEqual(result({rounds:[round], decisions})[0], {date,status:"unverified",models:3});
  }
  assert.equal(result({rounds:[{...round,status:"aborted"}],decisions:rows})[0].status,"missed");
});
test("no report becomes missed only with a post-cutoff read; last session is not relabeled as today", () => {
  const previous = {...round, sessionDate:"2026-11-23", dataAsOf:"2026-11-20"};
  const previousDecisions = rows.map(x=>({...x,sessionDate:previous.sessionDate,dataAsOf:previous.dataAsOf}));
  assert.deepEqual(result({rounds:[previous],decisions:previousDecisions}).map(x=>x.status), ["missed","hold"]);
  assert.equal(result({generatedAt:"2026-11-24T14:14:00Z"})[0].status,"unverified");
  assert.equal(result({generatedAt:"2026-11-24T14:15:00Z"},"2026-11-24T14:15:00Z")[0].status,"pending");
});
test("Thanksgiving is not missed; early-close Friday remains an eligible day", () => {
  const now = "2026-11-27T14:16:00Z";
  assert.deepEqual(result({generatedAt:now},now).map(x=>x.date),
    ["2026-11-27","2026-11-25","2026-11-24","2026-11-23"]);
});
test("NY clock uses EDT in summer and remains on the previous date after UTC midnight", () => {
  const now = "2026-07-06T13:14:00Z";
  const summer={experiment:{startSession:"2026-07-01",status:"running"},generatedAt:now};
  assert.equal(result(summer,now)[0].status,"pending");
  assert.equal(result({...summer,generatedAt:"2026-07-06T13:16:00Z"},"2026-07-06T13:16:00Z")[0].status,"missed");
  assert.equal(result({generatedAt:"2026-11-25T00:05:00Z"},"2026-11-25T00:05:00Z")[0].date,date);
});
