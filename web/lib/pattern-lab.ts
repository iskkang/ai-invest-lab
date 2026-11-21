import type { Bar } from "./types";

/**
 * Pattern Lab: fixed, reproducible research rules, not AI trades or financial advice.
 * Signal(t) sees bars [0..t] ONLY. Its first hypothetical observation starts
 * at OPEN(t+1); endpoints are CLOSE(t+5) and CLOSE(t+20).
 * No stock-level OHLCV, stock rankings, signal dates or entry prices are
 * included in the public projection. Historical constituents are today's.
 */
export type PatternId =
  | "inverted-hammer" | "golden-cross" | "bullish-stack" | "bearish-stack"
  | "fibonacci-618" | "rsi-rebound" | "macd-cross" | "bollinger-reclaim";
export type PatternDirection = "up" | "down";
export type Horizon = 5 | 20;
export const PATTERN_WARMUP = 110;
export const PATTERN_COOLDOWN = 20;
export const PATTERN_MIN_SAMPLES = 20;
export const PATTERNS = [
  {id:"inverted-hammer",direction:"up",category:"candle"},
  {id:"golden-cross",direction:"up",category:"moving"},
  {id:"bullish-stack",direction:"up",category:"moving"},
  {id:"bearish-stack",direction:"down",category:"moving"},
  {id:"fibonacci-618",direction:"up",category:"levels"},
  {id:"rsi-rebound",direction:"up",category:"momentum"},
  {id:"macd-cross",direction:"up",category:"momentum"},
  {id:"bollinger-reclaim",direction:"up",category:"volatility"},
] as const satisfies ReadonlyArray<{id:PatternId;direction:PatternDirection;category:string}>;

export const isPatternId=(id:string):id is PatternId=>PATTERNS.some(p=>p.id===id);
export type PatternSignal = {id:PatternId;symbol:string;date:string;index:number;direction:PatternDirection};
export type HorizonStudy = {
  horizon:Horizon;observations:number;pending:number;
  up:number;down:number;flat:number;
  hitRate:number|null;averageDirectionalPct:number|null;
  averageRelativeToSpyPct:number|null;
};
export type PatternSummary = {
  id:PatternId;direction:PatternDirection;category:string;
  occurrences:number;lastDate:string|null;recentFiveSessions:number;
  horizons:[HorizonStudy,HorizonStudy];
};
export type PatternStudy = {
  dataFrom:string;dataTo:string;inputSessions:number;analysisSessions:number;
  eligibleSymbols:number;excludedSymbols:number;priceSource:"nh_plug";
  warmup:number;cooldown:number;minimumSamples:number;
  patterns:PatternSummary[];
};
export type InternalPatternStudy={publicStudy:PatternStudy;signals:PatternSignal[];sessions:string[]};

const avg=(rows:number[])=>rows.reduce((sum,n)=>sum+n,0)/rows.length;
const finite=(n:number)=>Number.isFinite(n)&&n>0;
const round=(n:number)=>Number(n.toFixed(3));

type Indicators={
  ma20:(number|null)[];ma50:(number|null)[];ma100:(number|null)[];
  rsi:(number|null)[];macd:number[];signal:number[];
  lower:(number|null)[];
};
function rollingMean(values:number[],n:number): (number|null)[] {
  const result:(number|null)[]=Array(values.length).fill(null);
  let sum=0;
  for(let i=0;i<values.length;i++){
    sum+=values[i];
    if(i>=n)sum-=values[i-n];
    if(i>=n-1)result[i]=sum/n;
  }
  return result;
}
function ema(values:number[],period:number):number[]{
  const out:number[]=[];const factor=2/(period+1);
  for(let i=0;i<values.length;i++)out.push(i===0?values[0]:factor*values[i]+(1-factor)*out[i-1]);
  return out;
}
/** Wilder RSI, seeded with the first 14 past changes. */
function rsi14(closes:number[]):(number|null)[]{
  const out:(number|null)[]=Array(closes.length).fill(null);
  if(closes.length<15)return out;
  let gain=0,loss=0;
  for(let i=1;i<=14;i++){
    const delta=closes[i]-closes[i-1];
    gain+=Math.max(0,delta);loss+=Math.max(0,-delta);
  }
  gain/=14;loss/=14;
  const value=()=>gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
  out[14]=value();
  for(let i=15;i<closes.length;i++){
    const change=closes[i]-closes[i-1];
    gain=(gain*13+Math.max(0,change))/14;
    loss=(loss*13+Math.max(0,-change))/14;
    out[i]=value();
  }
  return out;
}
export function calculatePatternIndicators(bars:Bar[]):Indicators{
  const closes=bars.map(b=>b[4]);
  const ma20=rollingMean(closes,20),ma50=rollingMean(closes,50),ma100=rollingMean(closes,100);
  const macd12=ema(closes,12),macd26=ema(closes,26);
  const macd=macd12.map((v,i)=>v-macd26[i]);
  const signal=ema(macd,9);
  const lower:(number|null)[]=Array(closes.length).fill(null);
  for(let t=19;t<closes.length;t++){
    const mean=ma20[t]!;
    const variance=closes.slice(t-19,t+1).reduce((sum,v)=>sum+(v-mean)**2,0)/20;
    lower[t]=mean-2*Math.sqrt(variance);
  }
  return {ma20,ma50,ma100,rsi:rsi14(closes),macd,signal,lower};
}

/** A fixed, backward-looking 60-session swing approximation.
 * The low is earlier than the high, and the high must already be 3-25
 * sessions old. No future-confirmed pivot is used.
 */
function fibonacciTouch(bars:Bar[],t:number):boolean{
  if(t<61)return false;
  const start=t-60;
  let lowIndex=start;
  for(let i=start+1;i<t;i++)
    if(bars[i][3]<bars[lowIndex][3])lowIndex=i;
  if(lowIndex>=t-3)return false;
  let highIndex=lowIndex+1;
  for(let i=highIndex+1;i<t;i++)
    if(bars[i][2]>bars[highIndex][2])highIndex=i;
  const age=t-highIndex;
  if(age<3||age>25)return false;
  const lo=bars[lowIndex][3],hi=bars[highIndex][2];
  if(!finite(lo)||!finite(hi)||hi/lo<1.08)return false;
  const level=hi-0.618*(hi-lo);
  const tolerance=(hi-lo)*0.025;
  return bars[t-1][4]>level && bars[t][4]<=level+tolerance &&
    bars[t][4]>=level-tolerance && bars[t][4]<bars[t-1][4];
}

/** Signal computation is causal: the caller may append any future bars without
 * changing the set returned at t. These rules are hypotheses, not universal
 * textbook definitions or calibrated optimal parameters.
 */
export function detectPatternsAt(
  bars:Bar[],t:number,ind:Indicators=calculatePatternIndicators(bars)
):PatternId[]{
  if(t<PATTERN_WARMUP||t>=bars.length)return [];
  const close=bars[t][4],prev=bars[t-1][4];
  const result:PatternId[]=[];
  const [,_open,high,low]=bars[t];
  const body=Math.abs(close-_open),range=high-low;
  const upper=high-Math.max(close,_open),lower=Math.min(close,_open)-low;
  const prevDown=prev<=bars[t-6][4]*0.97 &&
    ind.ma20[t-1]!==null && prev<ind.ma20[t-1]!;
  if(prevDown&&range>0&&body<=range*0.25&&
    upper>=Math.max(body*2,range*0.45)&&lower<=range*0.15)
    result.push("inverted-hammer");

  const ma20=ind.ma20[t]!,ma50=ind.ma50[t]!,ma100=ind.ma100[t]!;
  const old20=ind.ma20[t-1]!,old50=ind.ma50[t-1]!,old100=ind.ma100[t-1]!;
  if(ma20>ma50&&old20<=old50)result.push("golden-cross");
  if(ma20>ma50&&ma50>ma100&&!(old20>old50&&old50>old100))
    result.push("bullish-stack");
  if(ma20<ma50&&ma50<ma100&&!(old20<old50&&old50<old100))
    result.push("bearish-stack");
  if(fibonacciTouch(bars,t))result.push("fibonacci-618");
  const rsi=ind.rsi[t],oldRsi=ind.rsi[t-1];
  if(rsi!==null&&oldRsi!==null&&oldRsi<=30&&rsi>30)
    result.push("rsi-rebound");
  if(ind.macd[t-1]<=ind.signal[t-1]&&ind.macd[t]>ind.signal[t])
    result.push("macd-cross");
  if(ind.lower[t]!==null&&ind.lower[t-1]!==null&&
    prev<=ind.lower[t-1]!&&close>ind.lower[t]!)
    result.push("bollinger-reclaim");
  return result;
}

function validBars(bars:Bar[],spy:Bar[]):boolean{
  if(bars.length!==spy.length)return false;
  return bars.every((b,i)=>{
    const [date,o,h,l,c,v]=b;
    return date===spy[i][0] &&
      [o,h,l,c].every(finite)&&Number.isFinite(v)&&v>=0 &&
      l<=Math.min(o,c)&&h>=Math.max(o,c)&&h>=l &&
      (i===0||date>bars[i-1][0]);
  });
}
function evaluate(
  signals:PatternSignal[], bars:Record<string,Bar[]>, spy:Bar[],
  horizon:Horizon
):HorizonStudy {
  let pending=0,up=0,down=0,flat=0,sum=0,sumRelative=0;
  for(const s of signals){
    const entryIdx=s.index+1,exitIdx=s.index+horizon;
    if(exitIdx>=spy.length||entryIdx>=spy.length){pending++;continue;}
    const price=bars[s.symbol],entry=price[entryIdx][1],exit=price[exitIdx][4];
    const benchmarkEntry=spy[entryIdx][1],benchmarkExit=spy[exitIdx][4];
    const direction=s.direction==="up"?1:-1;
    const movement=direction*(exit/entry-1);
    const market=direction*(benchmarkExit/benchmarkEntry-1);
    if(movement>1e-12)up++;else if(movement< -1e-12)down++;else flat++;
    sum+=movement;sumRelative+=movement-market;
  }
  const observations=up+down+flat,qualified=observations>=PATTERN_MIN_SAMPLES;
  return {
    horizon,observations,pending,up,down,flat,
    hitRate:qualified?round(up/observations*100):null,
    averageDirectionalPct:qualified?round(sum/observations*100):null,
    averageRelativeToSpyPct:qualified?round(sumRelative/observations*100):null,
  };
}
export function runPatternStudy(priceMap:Record<string,Bar[]>):InternalPatternStudy{
  const spy=priceMap.SPY;
  if(!spy||spy.length<PATTERN_WARMUP+21||
     !validBars(spy,spy))throw Error("Pattern Lab requires 131+ valid aligned benchmark sessions");
  // No future-dated market records or silently interpolated missing sessions.
  if(spy.some(row=>row[0]>new Date().toISOString().slice(0,10)))
    throw Error("Pattern Lab refuses future-dated market rows");
  const candidates=Object.keys(priceMap).filter(s=>s!=="SPY");
  const symbols=candidates.filter(s=>validBars(priceMap[s],spy)).sort();
  if(symbols.length<15)throw Error("Pattern Lab requires at least 15 fully aligned stocks");
  const signals:PatternSignal[]=[];
  const lastSeen=new Map<string,number>();
  for(const symbol of symbols){
    const bars=priceMap[symbol],ind=calculatePatternIndicators(bars);
    for(let t=PATTERN_WARMUP;t<spy.length;t++){
      for(const id of detectPatternsAt(bars,t,ind)){
        const key=symbol+":"+id;
        if(t-(lastSeen.get(key)??-100000)<PATTERN_COOLDOWN)continue;
        lastSeen.set(key,t);
        const definition=PATTERNS.find(p=>p.id===id)!;
        signals.push({id,symbol,date:spy[t][0],index:t,direction:definition.direction});
      }
    }
  }
  const lastFive=spy[Math.max(0,spy.length-5)][0];
  const summaries=PATTERNS.map(p=>{
    const observed=signals.filter(s=>s.id===p.id);
    return {
      ...p,occurrences:observed.length,
      lastDate:observed.map(s=>s.date).sort().at(-1)??null,
      recentFiveSessions:observed.filter(s=>s.date>=lastFive).length,
      horizons:[evaluate(observed,priceMap,spy,5),evaluate(observed,priceMap,spy,20)] as [HorizonStudy,HorizonStudy],
    };
  });
  return {
    publicStudy:{
      dataFrom:spy[0][0],dataTo:spy.at(-1)![0],
      inputSessions:spy.length,analysisSessions:spy.length-PATTERN_WARMUP,
      eligibleSymbols:symbols.length,excludedSymbols:candidates.length-symbols.length,
      priceSource:"nh_plug",warmup:PATTERN_WARMUP,
      cooldown:PATTERN_COOLDOWN,minimumSamples:PATTERN_MIN_SAMPLES,patterns:summaries,
    },
    // NEVER pass this array through React Server Components or an API route.
    signals,sessions:spy.map(b=>b[0]),
  };
}
