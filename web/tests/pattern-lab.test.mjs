/** Synthetic fixtures are for CI ONLY; never served to the public. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  PATTERNS,PATTERN_WARMUP,PATTERN_COOLDOWN,PATTERN_MIN_SAMPLES,
  calculatePatternIndicators,detectPatternsAt,runPatternStudy,
} from "../lib/pattern-lab.ts";
import { comparePatternModels } from "../lib/pattern-compare.ts";

const day=i=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
function bar(i,close){
  return [day(i),close-0.1,close+0.5,close-0.5,close,10000];
}
function spy(n=180){
  return Array.from({length:n},(_,i)=>[day(i),100,100.3,99.7,100,15000]);
}
function sample(n=180){
  return Array.from({length:n},(_,i)=>bar(i,100+0.08*i+2*Math.sin(i/9)));
}
function market(n=180){
  const benchmark=spy(n);
  const symbols=Array.from({length:20},(_,i)=>"ST"+String(i).padStart(2,"0"));
  return {SPY:benchmark,...Object.fromEntries(symbols.map((s,i)=>[
    s,sample(n).map(b=>[b[0],b[1]+i*0.2,b[2]+i*0.2,b[3]+i*0.2,b[4]+i*0.2,b[5]])
  ]))};
}
function inverter(n=190){
  const result=Array.from({length:n},(_,i)=>{
    const close=i<120?150-0.7*i:66+0.3*(i-120);
    return bar(i,close);
  });
  result[120]=[day(120),66.0,70,65.7,65.8,12000];
  return result;
}

test("Eight explicit pattern definitions and a 110-session warmup",()=>{
  assert.equal(PATTERNS.length,8);
  assert.equal(new Set(PATTERNS.map(p=>p.id)).size,8);
  assert.equal(PATTERN_WARMUP,110);
  assert.equal(PATTERN_COOLDOWN,20);
  assert.equal(PATTERN_MIN_SAMPLES,20);
});

test("Inverted hammer is only detected after decline with strict candle geometry",()=>{
  const bars=inverter();
  assert.ok(detectPatternsAt(bars,120).includes("inverted-hammer"));
  const inverted=structuredClone(bars);
  inverted[120]=[day(120),66,66.4,63.0,65.8,12000]; // lower wick, no long upper
  assert.ok(!detectPatternsAt(inverted,120).includes("inverted-hammer"));
});

test("Indicators and signal generation never use tomorrow or later bars",()=>{
  const bars=inverter(),index=120;
  const before=detectPatternsAt(bars,index);
  const modified=structuredClone(bars);
  for(let i=index+1;i<modified.length;i++){
    modified[i]=[day(i),20,210,19,200,999999];
  }
  assert.deepEqual(detectPatternsAt(modified,index),before);
  const initial=calculatePatternIndicators(bars);
  const future=calculatePatternIndicators(modified);
  assert.equal(future.macd[index],initial.macd[index]);
  assert.equal(future.rsi[index],initial.rsi[index]);
});

test("A constant market has no invented signals, wins or returns",()=>{
  const n=180,flat=Array.from({length:n},(_,i)=>[day(i),100,100.1,99.9,100,10000]);
  const map={SPY:flat,...Object.fromEntries(
    Array.from({length:20},(_,i)=>["S"+i,structuredClone(flat)]))};
  const {publicStudy,signals}=runPatternStudy(map);
  assert.deepEqual(signals,[]);
  for(const p of publicStudy.patterns){
    assert.equal(p.occurrences,0);
    assert.equal(p.horizons[0].hitRate,null);
    assert.equal(p.horizons[1].averageRelativeToSpyPct,null);
    assert.equal(p.horizons[0].observations,0);
  }
});

test("Real pattern studies start at next session OPEN, mature 5/20 later, and suppress repeated signals",()=>{
  const data={SPY:spy(190),...Object.fromEntries(
    Array.from({length:20},(_,i)=>["ST"+i,inverter()]))};
  const {publicStudy,signals}=runPatternStudy(data);
  const hammer=publicStudy.patterns.find(p=>p.id==="inverted-hammer");
  assert.equal(publicStudy.eligibleSymbols,20);
  assert.equal(publicStudy.priceSource,"reconciled_live_v1");
  assert.ok(hammer.occurrences>=20);
  assert.equal(hammer.horizons[0].observations,20);
  assert.equal(hammer.horizons[0].hitRate,100);
  assert.equal(hammer.horizons[1].observations,20);
  for(const sym of new Set(signals.map(s=>s.symbol))){
    for(const id of PATTERNS.map(p=>p.id)){
      const entries=signals.filter(s=>s.symbol===sym&&s.id===id).sort((a,b)=>a.index-b.index);
      for(let j=1;j<entries.length;j++)
        assert.ok(entries[j].index-entries[j-1].index>=PATTERN_COOLDOWN);
    }
  }
  assert.ok(!JSON.stringify(publicStudy).includes("ST0"),"Public aggregate must never contain per-ticker symbols");

  // The next day's OPEN, not the signal-day CLOSE, must be the reference.
  const changed=structuredClone(data);
  for(const sym of Object.keys(changed).filter(s=>s!=="SPY")){
    changed[sym][121]=[day(121),80,81,66,66.3,12000];
  }
  const altered=runPatternStudy(changed).publicStudy.patterns.find(p=>p.id==="inverted-hammer");
  assert.equal(altered.horizons[0].observations,20);
  assert.equal(altered.horizons[0].hitRate,0);
});

test("Observation never peeks into unrecorded future; only mature horizons score",()=>{
  const full={SPY:spy(190),...Object.fromEntries(
    Array.from({length:20},(_,i)=>["ST"+i,inverter()]))};
  const trimmed=Object.fromEntries(Object.entries(full).map(([k,v])=>[k,v.slice(0,124)]));
  // Insufficient warmup+21 is an explicit data error, not a false 0% result.
  assert.throws(()=>runPatternStudy(trimmed),/131\+/);
  const data=Object.fromEntries(Object.entries(full).map(([k,v])=>[k,v.slice(0,134)]));
  const summary=runPatternStudy(data).publicStudy.patterns.find(p=>p.id==="inverted-hammer");
  assert.equal(summary.horizons[0].observations,20);
  assert.equal(summary.horizons[1].observations,0);
  assert.equal(summary.horizons[1].pending,20);
  assert.equal(summary.horizons[1].hitRate,null);
});

test("Missing or misaligned bars are excluded, never forward-filled",()=>{
  const data=market();
  data.ST00[120][0]="2024-01-01";
  const report=runPatternStudy(data).publicStudy;
  assert.equal(report.excludedSymbols,1);
  assert.equal(report.eligibleSymbols,19);
  assert.throws(()=>runPatternStudy({SPY:spy(180),ST00:sample(180)}),/15 fully aligned/);
  const bad=market();
  bad.SPY[40][4]=-5;
  assert.throws(()=>runPatternStudy(bad),/valid aligned benchmark/);
});

test("AI vs Pattern compares only equal-information sessions and explicit same-symbol votes",()=>{
  const data={SPY:spy(190),...Object.fromEntries(
    Array.from({length:20},(_,i)=>["ST"+i,inverter()]))};
  const study=runPatternStudy(data);
  const event=study.signals.find(x=>x.id==="inverted-hammer"&&x.symbol==="ST0");
  assert.ok(event);
  const date=study.sessions[event.index+1];
  const accounts=[
    {id:1,kind:"ai",aiId:"gpt",name:"GPT"},
    {id:2,kind:"ai",aiId:"claude",name:"Claude"},
    {id:3,kind:"ai",aiId:"gemini",name:"Gemini"},
    {id:4,kind:"ai",aiId:"deepseek",name:"DeepSeek"},
  ];
  const actions=[
    {id:1,aiId:"gpt",actions:[{symbol:"ST0",action:"BUY",quantity:1}]},
    {id:2,aiId:"claude",actions:[{symbol:"ST0",action:"SELL",quantity:1}]},
    {id:3,aiId:"gemini",actions:[{symbol:"ST0",action:"HOLD",quantity:0}]},
    {id:4,aiId:"deepseek",actions:[{symbol:"ST0",action:"BUY",quantity:1}],dataAsOf:day(0)},
  ];
  const d={
    accounts,universe:Object.keys(data).filter(s=>s!=="SPY").map(symbol=>({symbol,role:"investable"})),
    rounds:[{id:1,sessionDate:date,dataAsOf:event.date,status:"decided"}],
    decisions:actions.map(x=>({
      id:x.id,roundId:1,model:x.aiId,aiId:x.aiId,status:"valid",
      summary:"",sessionDate:date,dataAsOf:x.dataAsOf??event.date,
      actions:x.actions,
    })),
  };
  const result=comparePatternModels(d,study).find(row=>row.id==="inverted-hammer");
  assert.equal(result.total,3);
  assert.deepEqual(result.rows.map(x=>[x.agreement,x.opposition,x.hold]),
    [[1,0,0],[0,1,0],[0,0,1],[0,0,0]]);
  d.rounds[0].status="aborted";
  assert.equal(comparePatternModels(d,study).find(row=>row.id==="inverted-hammer").total,0);
});
