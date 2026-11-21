import assert from "node:assert/strict";
import test from "node:test";
import {
  publicationPulse, recentRoundJournal, decisionRevisions,
  latestPortfolioMoves, followupScorecard, recentlyResolvedOutcomes,
} from "../lib/returning-analytics.ts";

const account=(id,name)=>({id,kind:"ai",aiId:name.toLowerCase(),name,color:"#888"});
const a=(symbol,action,quantity=1)=>({symbol,action,quantity,reason:"Real recorded view"});
const dec=(id,roundId,aiId,date,actions)=>({
  id,roundId,aiId,status:"valid",sessionDate:date,dataAsOf:"2026-11-19",
  actions,
});
const base=()=>({
  locale:"ko",mode:"live",
  experiment:{startSession:"2026-11-23",status:"running"},
  accounts:[account(1,"GPT"),account(2,"Claude")],
  universe:[{symbol:"AAPL",role:"investable"},{symbol:"NVDA",role:"investable"}],
  rounds:[],decisions:[],snapshots:[],trades:[],rejected:[],
});

test("Before the first real round, public pulse has no invented claims",()=>{
  const d=base();
  assert.equal(publicationPulse(d).latestPublishedDate,null);
  assert.equal(publicationPulse(d).latestValuation,null);
  assert.equal(publicationPulse(d).publishedRounds,0);
  assert.deepEqual(recentRoundJournal(d),[]);
  assert.deepEqual(decisionRevisions(d),[]);
  assert.deepEqual(latestPortfolioMoves(d),[]);
});

test("A newer aborted round does not erase the last verified publication or become a vote",()=>{
  const d=base();
  d.rounds=[
    {id:12,sessionDate:"2026-11-24",dataAsOf:"2026-11-23",status:"aborted"},
    {id:11,sessionDate:"2026-11-23",dataAsOf:"2026-11-19",status:"settled"},
  ];
  d.decisions=[dec(1,11,"gpt","2026-11-23",[a("AAPL","BUY")]),
               dec(2,12,"claude","2026-11-24",[a("NVDA","SELL")])];
  const pulse=publicationPulse(d);
  assert.equal(pulse.latestSession,"2026-11-24");
  assert.equal(pulse.latestRoundStatus,"aborted");
  assert.equal(pulse.latestPublishedDate,"2026-11-23");
  assert.equal(pulse.verifiedModels,1);
  assert.equal(recentRoundJournal(d)[0].models,0);
  assert.equal(recentRoundJournal(d)[0].buy,0);
  assert.equal(recentRoundJournal(d)[1].buy,1);
});

test("Revisions require the same model and ticker explicitly voted in consecutive published rounds",()=>{
  const d=base();
  d.rounds=[
    {id:3,sessionDate:"2026-11-24",status:"decided",dataAsOf:"2026-11-23"},
    {id:2,sessionDate:"2026-11-23",status:"settled",dataAsOf:"2026-11-19"},
  ];
  d.decisions=[
    dec(1,2,"gpt","2026-11-23",[a("AAPL","BUY"),a("NVDA","HOLD",0)]),
    dec(2,3,"gpt","2026-11-24",[a("AAPL","SELL"),a("NVDA","HOLD",0)]),
    dec(3,3,"claude","2026-11-24",[a("NVDA","SELL")]),
  ];
  const changed=decisionRevisions(d);
  assert.deepEqual(changed.map(x=>[x.aiId,x.symbol,x.from,x.to]),[["gpt","AAPL","BUY","SELL"]]);
  d.rounds[0].status="aborted";
  assert.deepEqual(decisionRevisions(d),[]);
});

test("Portfolio moves require stored daily portfolio returns",()=>{
  const d=base();
  d.snapshots=[
    {date:"2026-11-23",accountId:1,dailyReturn:null},
    {date:"2026-11-24",accountId:1,dailyReturn:0.012},
    {date:"2026-11-24",accountId:2,dailyReturn:-0.004},
  ];
  const x=latestPortfolioMoves(d);
  assert.deepEqual(x.map(v=>[v.aiId,v.dailyReturn]),[["gpt",0.012],["claude",-0.004]]);
});

test("Outcome scorecards exclude pending/unavailable and hide rates below 20 samples",()=>{
  const d=base();
  const signals=[
    {aiId:"gpt",observed:[{horizon:1,verdict:"hit",date:"2026-11-24"},{horizon:5,verdict:"pending",date:null},{horizon:20,verdict:"pending",date:null}],
      id:"1:AAPL",aiName:"GPT",symbol:"AAPL",side:"BUY",sessionDate:"2026-11-23"},
    {aiId:"gpt",observed:[{horizon:1,verdict:"flat",date:"2026-11-24"},{horizon:5,verdict:"unavailable",date:"2026-12-01"},{horizon:20,verdict:"pending",date:null}],
      id:"2:NVDA",aiName:"GPT",symbol:"NVDA",side:"SELL",sessionDate:"2026-11-23"},
    {aiId:"claude",observed:[{horizon:1,verdict:"miss",date:"2026-11-24"}],
      id:"3:AAPL",aiName:"Claude",symbol:"AAPL",side:"SELL",sessionDate:"2026-11-23"},
  ];
  const one=followupScorecard(d,signals,1);
  assert.equal(one[0].samples,2);
  assert.equal(one[0].hits,1);
  assert.equal(one[0].flats,1);
  assert.equal(one[0].qualified,false);
  assert.equal(followupScorecard(d,signals,5)[0].samples,0);
  assert.equal(recentlyResolvedOutcomes(signals).length,3);
  assert.ok(!JSON.stringify(recentlyResolvedOutcomes(signals)).includes("pending"));
  const many=Array.from({length:25},(_,i)=>({...signals[0],id:String(i),symbol:"AAPL"}));
  assert.equal(followupScorecard(d,many,1)[0].samples,25);
  assert.equal(followupScorecard(d,many,1)[0].qualified,true);
});

test("Homepage switches to full dashboard only after a published official round",()=>{
  const d=base();
  // Having prepared accounts, snapshots or failed runs is not a first
  // published decision; nothing may unlock an empty leaderboard.
  d.snapshots=[{accountId:1,date:"2026-11-22",equity:100000}];
  assert.equal(publicationPulse(d).publishedRounds,0);
  d.rounds=[{id:1,sessionDate:"2026-11-23",status:"aborted"}];
  assert.equal(publicationPulse(d).publishedRounds,0);
  d.rounds.push({id:2,sessionDate:"2026-11-24",status:"skipped"});
  assert.equal(publicationPulse(d).publishedRounds,0);
  d.rounds.push({id:3,sessionDate:"2026-11-25",status:"decided"});
  assert.equal(publicationPulse(d).publishedRounds,1);
  d.rounds[2].status="settled";
  assert.equal(publicationPulse(d).publishedRounds,1);
  d.rounds.push({id:4,sessionDate:"2026-11-26",status:"decided"});
  assert.equal(publicationPulse(d).publishedRounds,2);
});
