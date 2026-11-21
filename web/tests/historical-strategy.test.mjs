import assert from "node:assert/strict";
import test from "node:test";
import {
  runHistoricalStudy,rankHistoricalSymbols,HISTORICAL_PROFILES,
  HISTORY_WARMUP,HISTORY_STEP,HISTORY_COST_BPS,
} from "../lib/historical-strategy.ts";

/** Fixtures exist only in CI. Never used to populate or serve the website. */
const fixture=(sessions=220)=>{
  const symbols=["SPY",...Array.from({length:30},(_,i)=>"S"+String(i).padStart(2,"0"))];
  return Object.fromEntries(symbols.map((symbol,j)=>{
    const bars=[];
    for(let i=0;i<sessions;i++){
      const d=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
      const base=100+i*(0.02+(j%8)*0.018)+Math.sin(i/12+j)*0.35;
      bars.push([d,base,base+1,base-1,base+0.2,10000+j*100+i*5]);
    }
    return [symbol,bars];
  }));
};

test("Historical metrics are from separate fixed-weight rule strategies, not AI records",()=>{
  const d=fixture();
  const result=runHistoricalStudy(d);
  assert.equal(result.priceSource,"nh_plug");
  assert.equal(result.eligibleSymbols,30);
  assert.equal(result.inputSessions,220);
  assert.equal(result.analysisSessions,140);
  assert.equal(result.results.length,5);
  assert.equal(result.start,d.SPY[HISTORY_WARMUP][0]);
  assert.equal(result.end,d.SPY.at(-1)[0]);
  assert.ok(result.results.every(x=>Number.isFinite(x.returnPct)&&x.sessions===140));
  assert.ok(result.results.every(x=>x.curve.length>=6&&x.curve.length<=8));
  assert.ok(result.results.filter(x=>x.id!=="spy"&&x.id!=="equal")
    .every(x=>x.rebalanceCount===7));
});

test("Ranking cannot depend on future price/volume observed after decision close",()=>{
  const original=fixture();
  const altered=structuredClone(original);
  const symbols=Object.keys(original).filter(x=>x!=="SPY");
  const weights=HISTORICAL_PROFILES[0].weights;
  const past=rankHistoricalSymbols(original,symbols,79,weights);
  for(let i=80;i<220;i++){
    altered.S00[i][4]*=500;
    altered.S00[i][5]*=500;
    altered.SPY[i][4]*=5;
  }
  assert.deepEqual(rankHistoricalSymbols(altered,symbols,79,weights),past);
});

test("Every strategy costs more with positive costs, same future series",()=>{
  const d=fixture();
  const free=runHistoricalStudy(d,0);
  const cost=runHistoricalStudy(d,HISTORY_COST_BPS);
  for(let i=0;i<5;i++)
    assert.ok(cost.results[i].returnPct<=free.results[i].returnPct+0.001,
      cost.results[i].id+" must not benefit from paying fees");
});

test("Constant prices have no fictitious profits; only transaction costs",()=>{
  const d=fixture();
  for(const bars of Object.values(d))
    for(const row of bars){row[1]=100;row[4]=100;row[2]=101;row[3]=99;row[5]=1000;}
  const free=runHistoricalStudy(d,0);
  assert.ok(free.results.every(x=>Math.abs(x.returnPct)<1e-8));
  const cost=runHistoricalStudy(d,10);
  assert.ok(cost.results.every(x=>x.returnPct<0));
});

test("Misaligned or insufficient price bars fail without interpolation",()=>{
  const d=fixture();
  const m=structuredClone(d);
  m.S00[90][0]="2028-01-01";
  const r=runHistoricalStudy(m);
  assert.equal(r.eligibleSymbols,29);
  assert.equal(r.excludedSymbols,1);
  assert.throws(()=>runHistoricalStudy({SPY:d.SPY,S00:d.S00}),/Insufficient aligned/);
  assert.throws(()=>runHistoricalStudy(fixture(100)),/120\+/);
  assert.throws(()=>runHistoricalStudy(d,-1),/Invalid research/);
});

test("Preset percentages remain fixed and sum to 100 for all alternatives",()=>{
  assert.equal(HISTORY_STEP,20);
  for(const p of HISTORICAL_PROFILES)
    assert.equal(Object.values(p.weights).reduce((a,b)=>a+b,0),100);
});
