/** Algorithm-only fixtures. Synthetic numbers are NEVER served as market data. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  isoWeek,compareLatestRound,generateWeeklyReports,evaluateDirectionalAccuracy,
} from "../lib/insight-analytics.ts";
import { dailyBrief, rankedDisagreements, evaluateDecisionFollowups, followupInputs } from "../lib/retention-analytics.ts";

const model=(id,name)=>({id,kind:"ai",aiId:name.toLowerCase(),benchmarkCode:null,name,color:"#777",model:name,initialCash:100000});
const base=()=>({
  mode:"live",locale:"en",publicQuotesRedacted:true,
  accounts:[model(1,"GPT"),model(2,"Claude"),model(3,"Gemini"),model(4,"DeepSeek")],
  universe:[{symbol:"AAPL",name:"Apple",sector:"Tech",role:"investable"},{symbol:"NVDA",name:"Nvidia",role:"investable"}],
  rounds:[],decisions:[],snapshots:[],stats:{},trades:[],prices:{},
});
const decision=(id,roundId,aiId,sessionDate,actions)=>({
  id,roundId,aiId,model:aiId,status:"valid",error:null,summary:null,
  sessionDate,dataAsOf:"2026-11-19",actions,
});
const action=(symbol,dir,quantity=1)=>({
  symbol,action:dir,quantity,reason:"Recorded statement",risks:[],indicators_used:[],
  expected_return_pct:null,confidence:null,
});

test("ISO 8601 weeks are stable over New Year",()=>{
  assert.equal(isoWeek("2026-12-31"),"2026-W53");
  assert.equal(isoWeek("2027-01-01"),"2026-W53");
  assert.equal(isoWeek("2026-11-23"),"2026-W48");
});

test("No verified decisions means no consensus, no weekly reports and no rankings",()=>{
  const d=base();
  const c=compareLatestRound(d);
  assert.equal(c.date,null);
  assert.equal(c.consensus.length,0);
  assert.deepEqual(generateWeeklyReports(d,new Date("2026-12-07T12:00:00Z")),[]);
  assert.ok(evaluateDirectionalAccuracy(d,{}).every(x=>x.samples===0&&x.hitRate===null));
});

test("Consensus counts only explicit valid model actions from settled rounds",()=>{
  const d=base();
  d.rounds=[{id:3,sessionDate:"2026-11-23",status:"settled",dataAsOf:"2026-11-19"}];
  d.decisions=[
    decision(1,3,"gpt","2026-11-23",[action("AAPL","BUY"),action("NVDA","BUY")]),
    decision(2,3,"claude","2026-11-23",[action("AAPL","BUY"),action("NVDA","SELL")]),
    decision(3,3,"gemini","2026-11-23",[]),
    decision(4,3,"deepseek","2026-11-23",[action("NVDA","HOLD",0)]),
  ];
  const c=compareLatestRound(d);
  assert.equal(c.participatingModels,4);
  assert.equal(c.consensus.length,1);
  assert.equal(c.consensus[0].symbol,"AAPL");
  assert.equal(c.disagreements.length,1);
  assert.equal(c.disagreements[0].symbol,"NVDA");
  assert.equal(c.all.find(x=>x.symbol==="AAPL").votes.length,2);
  // Incomplete week does not get a published historical report.
  assert.deepEqual(generateWeeklyReports(d,new Date("2026-11-25T12:00:00Z")),[]);
  const r=generateWeeklyReports(d,new Date("2026-11-30T12:00:00Z"));
  assert.equal(r.length,1);
  assert.equal(r[0].week,"2026-W48");
  assert.equal(generateWeeklyReports(d,new Date("2026-11-28T04:00:00Z")).length,1);
  assert.equal(generateWeeklyReports(d,new Date("2026-11-27T22:00:00Z")).length,0);
  assert.equal(r[0].actionCount,5);
  assert.ok(r[0].models.every(m=>m.weeklyReturn===null));
});

test("Invalid/aborted rounds never produce retrospective opinions",()=>{
  const d=base();
  d.rounds=[{id:3,sessionDate:"2026-11-23",status:"aborted",dataAsOf:"2026-11-19"}];
  d.decisions=[decision(1,3,"gpt","2026-11-23",[action("AAPL","BUY")])];
  assert.equal(compareLatestRound(d).date,null);
  assert.deepEqual(generateWeeklyReports(d,new Date("2026-12-10T00:00:00Z")),[]);
});

test("Directional accuracy requires a later 5th and 20th verified SPY session",()=>{
  const d=base();
  d.rounds=[{id:3,sessionDate:"2026-11-23",status:"settled",dataAsOf:"2026-11-19"}];
  d.decisions=[
    decision(1,3,"gpt","2026-11-23",[action("AAPL","BUY"),action("NVDA","HOLD",0)]),
    decision(2,3,"claude","2026-11-23",[action("AAPL","SELL")]),
  ];
  const bars={SPY:[],AAPL:[]};
  for(let i=0;i<25;i++){
    const day=new Date(Date.UTC(2026,10,23+i)).toISOString().slice(0,10);
    bars.SPY.push([day,100,100,100,100+i,100]);
    bars.AAPL.push([day,100,100,100,100+2*i,100]);
  }
  const rows=evaluateDirectionalAccuracy(d,bars,1);
  assert.equal(rows.find(x=>x.aiId==="gpt"&&x.horizon===5).samples,1);
  assert.equal(rows.find(x=>x.aiId==="gpt"&&x.horizon===5).hits,1);
  assert.equal(rows.find(x=>x.aiId==="claude"&&x.horizon===5).hits,0);
  assert.equal(rows.find(x=>x.aiId==="gpt"&&x.horizon===20).samples,1);
  assert.equal(rows.find(x=>x.aiId==="gemini"&&x.horizon===5).samples,0);
  assert.ok(evaluateDirectionalAccuracy(d,bars).every(x=>!x.qualified));
});

test("Official decided round appears in comparisons before simulated fills, but not accuracy",()=>{
  const d=base();
  d.rounds=[{id:9,sessionDate:"2026-11-23",status:"decided",dataAsOf:"2026-11-19"}];
  d.decisions=[decision(1,9,"gpt","2026-11-23",[action("AAPL","BUY")])];
  assert.equal(compareLatestRound(d).date,"2026-11-23");
  assert.equal(compareLatestRound(d).comparedSymbols,1);
  assert.ok(evaluateDirectionalAccuracy(d,{}).every(row=>row.samples===0));
  assert.deepEqual(generateWeeklyReports(d,new Date("2026-12-07T12:00:00Z")),[]);
});


test("Daily brief shows no invented conclusions and counts only valid explicit actions",()=>{
  const d=base();
  const waiting=dailyBrief(d);
  assert.equal(waiting.date,null);
  assert.equal(waiting.buy,0);
  assert.equal(waiting.participants,0);
  d.rounds=[{id:7,sessionDate:"2026-11-23",status:"decided",dataAsOf:"2026-11-19"}];
  d.decisions=[
    decision(1,7,"gpt","2026-11-23",[action("AAPL","BUY"),action("NVDA","SELL")]),
    decision(2,7,"claude","2026-11-23",[action("AAPL","SELL"),action("NVDA","HOLD",0)]),
    {...decision(3,7,"gemini","2026-11-23",[action("NVDA","BUY")]),status:"invalid"},
  ];
  const summary=dailyBrief(d);
  assert.equal(summary.date,"2026-11-23");
  assert.equal(summary.participants,2);
  assert.equal(summary.buy,1);
  assert.equal(summary.sell,2);
  assert.equal(summary.hold,1);
  assert.equal(summary.disagreements[0].symbol,"AAPL");
  assert.equal(rankedDisagreements(compareLatestRound(d).disagreements).length,2);
});

test("Follow-ups do not treat holds or aborted rounds as predictions",()=>{
  const d=base();
  d.rounds=[{id:4,sessionDate:"2026-11-23",status:"aborted",dataAsOf:"2026-11-19"}];
  d.decisions=[decision(1,4,"gpt","2026-11-23",[action("AAPL","BUY")])];
  assert.equal(evaluateDecisionFollowups(d,{}).length,0);
  assert.equal(followupInputs(d).since,null);
  d.rounds[0].status="settled";
  d.decisions[0].actions=[action("NVDA","HOLD",0)];
  assert.equal(evaluateDecisionFollowups(d,{}).length,0);
});

test("Decision follow-ups use future actual sessions, no forward fill and no raw prices",()=>{
  const d=base();
  d.rounds=[{id:5,sessionDate:"2026-11-23",status:"settled",dataAsOf:"2026-11-19"}];
  d.decisions=[
    decision(1,5,"gpt","2026-11-23",[action("AAPL","BUY"),action("NVDA","HOLD",0)]),
    decision(2,5,"claude","2026-11-23",[action("AAPL","SELL")]),
  ];
  const prices={SPY:[],AAPL:[]};
  for(let i=0;i<8;i++){
    const date=new Date(Date.UTC(2026,10,23+i)).toISOString().slice(0,10);
    prices.SPY.push([date,100,100,100,101,200]);
    prices.AAPL.push([date,100,100,100,105+i,200]);
  }
  const records=evaluateDecisionFollowups(d,prices);
  assert.equal(records.length,2);
  assert.deepEqual(records[0].observed.map(x=>x.verdict),["hit","hit","pending"]);
  assert.deepEqual(records[1].observed.map(x=>x.verdict),["miss","miss","pending"]);
  assert.ok(!JSON.stringify(records).includes('"prices"'));
  delete prices.AAPL[1];
  const withGap=evaluateDecisionFollowups(d,prices);
  assert.equal(withGap[0].observed[0].verdict,"unavailable");
});
