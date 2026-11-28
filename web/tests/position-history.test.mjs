import test from "node:test";
import assert from "node:assert/strict";
import { positionHistory } from "../lib/position-history.ts";

test("carried closing marks, partial sales, splits and reopened holdings keep their own basis and dates", () => {
  const holding = q => [{symbol:"ABC",quantity:q,marketValue:90,unrealizedPnl:-10}];
  const snap = (date,q) => ({date,holdings:q?holding(q):[],staleMarks:["ABC"]});
  const trade = (id, side, quantity, tradeDate) => ({id,side,quantity,tradeDate,symbol:"ABC",
    saleResult:side==="SELL"?{pnl:-4,cost:50}:undefined});
  const {rows} = positionHistory([snap("01",4),snap("02",8),snap("03",5),snap("04",0),snap("05",3)],[
    trade(1,"BUY",4,"01"),trade(2,"SELL",3,"03"),trade(3,"SELL",5,"04"),trade(4,"BUY",3,"05")]);
  assert.deepEqual(rows.map(r=>[r.quantity,r.bought,r.sold,r.cost,r.pnl]),[
    [3,"05",null,100,-10],[5,"01","04",50,-4],[3,"01","03",50,-4]]);
  assert.equal(rows[0].carried,true);
});
