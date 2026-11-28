import assert from "node:assert/strict";
import test from "node:test";
import { portfolioOverview } from "../lib/portfolio-overview.ts";

test("open returns use remaining cost even when public unit prices are redacted", () => {
  const valued = {accountId: 1, date: "2026-11-27", cash: 700, equity: 1010, cumReturn: .01,
    staleMarks: ["B"], holdings: [
      {symbol:"A",quantity:1,marketValue:110,unrealizedPnl:10,avgCost:0,close:0},
      {symbol:"B",quantity:2,marketValue:200,unrealizedPnl:-40,avgCost:0,close:0},
    ]};
  const [row, empty] = portfolioOverview({
    accounts:[{id:1,kind:"ai"},{id:2,kind:"ai"},{id:3,kind:"benchmark"}], universe:[],
    snapshots:[valued,{...valued,date:"2026-11-25",holdings:[],cumReturn:0}],
  });
  assert.equal(row.date,valued.date);
  assert.equal(row.gain,.01);
  assert.equal(row.openGain,-30/340);
  assert.deepEqual(row.positions.map(p => [p.symbol,p.gain,p.carried]),[["B",-40/240,true],["A",.1,false]]);
  assert.equal(empty.gain,null);
  assert.equal(empty.openGain,null);
  assert.deepEqual(empty.positions,[]);
});
