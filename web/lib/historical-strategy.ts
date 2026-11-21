import type { Bar } from "./types";

/**
 * Retrospective, fixed-rule research (NOT historical AI decisions).
 * Input is genuine NH PLUG OHLCV, split-adjusted on the server.
 * Every rank uses data ending at index t-1. Positions are opened on t's
 * regular-session open, which is unavailable at selection time.
 *
 * 80 observation sessions are reserved before the first decision. The
 * 3 weights below are ILLUSTRATIVE hypotheses, not ex-post fitted winners.
 */
export const HISTORY_WARMUP = 80;
export const HISTORY_STEP = 20;
export const HISTORY_TOP = 5;
export const HISTORY_COST_BPS = 10;
export type Feature = "momentum" | "relative" | "lowVol" | "volume" | "lowDrawdown";
export const FEATURES: Feature[] = ["momentum","relative","lowVol","volume","lowDrawdown"];
export type Weights = Record<Feature, number>;
export const HISTORICAL_PROFILES = [
  {id:"balanced",weights:{momentum:35,relative:25,lowVol:20,volume:10,lowDrawdown:10},color:"#60a5fa"},
  {id:"momentum",weights:{momentum:55,relative:30,lowVol:5,volume:5,lowDrawdown:5},color:"#a78bfa"},
  {id:"defensive",weights:{momentum:15,relative:10,lowVol:40,volume:5,lowDrawdown:30},color:"#2dd4bf"},
] as const satisfies readonly {id:string;weights:Weights;color:string}[];

export type HistoricalCurvePoint = {time:string;value:number};
export type HistoricalStrategyResult = {
  id:string;
  returnPct:number;
  drawdownPct:number;
  volatilityPct:number;
  winDays:number;
  sessions:number;
  rebalanceCount:number;
  curve:HistoricalCurvePoint[];
};
export type HistoricalStudy = {
  start:string;end:string;dataFrom:string;dataTo:string;
  inputSessions:number;analysisSessions:number;eligibleSymbols:number;
  excludedSymbols:number;priceSource:"nh_plug";lastDataAsOf:string;
  costBps:number;warmup:number;rebalanceEvery:number;holdings:number;
  results:HistoricalStrategyResult[];
};
const round=(x:number, digits=2)=>Number(x.toFixed(digits));
const average=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const stdev=(v:number[])=>{
  if(v.length<2)return 0;
  const mu=average(v);
  return Math.sqrt(v.reduce((n,x)=>n+(x-mu)**2,0)/(v.length-1));
};
function assertWeights(w:Weights){
  const values=FEATURES.map(k=>w[k]);
  if(values.some(v=>!Number.isFinite(v)||v<0)||values.reduce((a,b)=>a+b,0)!==100)
    throw Error("Historical strategy weights must be nonnegative and add to 100");
}
function signalFeatures(prices:Record<string,Bar[]>,symbol:string,index:number){
  const bars=prices[symbol],spy=prices.SPY;
  const c=(i:number)=>bars[i][4];
  const s=(i:number)=>spy[i][4];
  if(index<60||c(index-60)<=0||s(index-20)<=0)throw Error("Insufficient past-only feature data");
  const daily=[];
  for(let i=index-19;i<=index;i++)daily.push(c(i)/c(i-1)-1);
  let peak=0,maxDd=0;
  for(let i=index-59;i<=index;i++){
    peak=Math.max(peak,c(i));
    maxDd=Math.min(maxDd,c(i)/peak-1);
  }
  const volume5=average(bars.slice(index-4,index+1).map(b=>b[5]));
  const volume20=average(bars.slice(index-19,index+1).map(b=>b[5]));
  return {
    momentum:c(index)/c(index-60)-1,
    relative:c(index)/c(index-20)-1-(s(index)/s(index-20)-1),
    lowVol:-stdev(daily),
    volume:volume20>0?Math.max(-5,Math.min(5,volume5/volume20-1)):0,
    lowDrawdown:maxDd, // closer to zero is safer
  } as Record<Feature,number>;
}

/** The only exposed selection function is for regression tests; no individual
 * historical per-stock ranking is published in the browser.
 */
export function rankHistoricalSymbols(
  prices:Record<string,Bar[]>, symbols:string[],asOf:number,weights:Weights,
):string[]{
  assertWeights(weights);
  const raw=symbols.map(symbol=>({symbol,feature:signalFeatures(prices,symbol,asOf)}));
  const stats=Object.fromEntries(FEATURES.map(key=>{
    const values=raw.map(row=>row.feature[key]);
    return [key,{mean:average(values),sd:stdev(values)}];
  })) as Record<Feature,{mean:number;sd:number}>;
  return raw.map(row=>{
    const score=FEATURES.reduce((sum,key)=>{
      const {mean,sd}=stats[key];
      const z=sd>1e-12?(row.feature[key]-mean)/sd:0;
      return sum+weights[key]*Math.max(-3,Math.min(3,z))/100;
    },0);
    return {symbol:row.symbol,score};
  }).sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol,"en"))
    .map(row=>row.symbol);
}

type Book={id:string;cash:number;quantity:Map<string,number>;daily:number[];
  points:HistoricalCurvePoint[];previous:number;peak:number;maxDd:number;positive:number;rebals:number};
function valueAt(book:Book,prices:Record<string,Bar[]>,i:number,field:1|4){
  let total=book.cash;
  for(const [ticker,q] of book.quantity)total+=q*prices[ticker][i][field];
  if(!(Number.isFinite(total)&&total>0))throw Error("Non-positive historical simulation equity");
  return total;
}
function createBook(id:string):Book{
  return {id,cash:100000,quantity:new Map(),daily:[],points:[],
    previous:100000,peak:100000,maxDd:0,positive:0,rebals:0};
}
function rebalance(book:Book,prices:Record<string,Bar[]>,session:number,targets:string[],costBps:number){
  const opening=valueAt(book,prices,session,1);
  const oldValue=new Map([...book.quantity].map(([symbol,qty])=>
    [symbol,qty*prices[symbol][session][1]]
  ));
  let investable=opening;
  for(let iteration=0;iteration<10;iteration++){
    const targetValue=investable/targets.length;
    const all=new Set([...oldValue.keys(),...targets]);
    let traded=0;
    for(const ticker of all){
      const desired=targets.includes(ticker)?targetValue:0;
      traded+=Math.abs(desired-(oldValue.get(ticker)??0));
    }
    const revised=opening-traded*costBps/10000;
    if(revised<=0)throw Error("Historical turnover costs exceed equity");
    if(Math.abs(revised-investable)<0.0000001){investable=revised;break;}
    investable=revised;
  }
  book.quantity.clear();
  for(const ticker of targets)
    book.quantity.set(ticker,(investable/targets.length)/prices[ticker][session][1]);
  book.cash=opening-investable-(opening-investable); // fully invested, costs deducted
  book.rebals++;
}
function track(book:Book,priceMap:Record<string,Bar[]>,t:number,report:boolean){
  const nav=valueAt(book,priceMap,t,4);
  const r=nav/book.previous-1;
  if(book.previous>0&&Number.isFinite(r)){
    book.daily.push(r);
    if(r>0)book.positive++;
  }
  book.previous=nav;
  book.peak=Math.max(book.peak,nav);
  book.maxDd=Math.min(book.maxDd,nav/book.peak-1);
  if(report)book.points.push({time:priceMap.SPY[t][0],value:round((nav/100000-1)*100,3)});
}
function result(book:Book):HistoricalStrategyResult{
  return {
    id:book.id,returnPct:round((book.previous/100000-1)*100),
    drawdownPct:round(book.maxDd*100),volatilityPct:round(stdev(book.daily)*Math.sqrt(252)*100),
    winDays:book.positive,sessions:book.daily.length,
    rebalanceCount:book.rebals,curve:book.points,
  };
}

/**
 * No interpolation of missing bars, no dates before true first entry, no
 * fabricated AI decisions. Every ticker must align with the SPY date series;
 * unmatched symbols are excluded, and fewer than 20 aligned stocks FAIL.
 * Source index constituents are current-selection biased: explicitly disclose.
 */
export function runHistoricalStudy(priceMap:Record<string,Bar[]>,costBps=HISTORY_COST_BPS):HistoricalStudy{
  if(!Number.isFinite(costBps)||costBps<0||costBps>100)throw Error("Invalid research fee assumption");
  const spy=priceMap.SPY;
  if(!spy||spy.length<HISTORY_WARMUP+40)throw Error("Historical research needs 120+ trading sessions");
  const valid=(rows:Bar[])=>rows.length===spy.length&&rows.every((row,i)=>
    row[0]===spy[i][0]&&Number.isFinite(row[1])&&row[1]>0&&
    Number.isFinite(row[4])&&row[4]>0&&Number.isFinite(row[5])&&row[5]>=0
  );
  if(!valid(spy)||spy.some((row,i)=>i>0&&row[0]<=spy[i-1][0]))
    throw Error("Benchmark dates or bars are invalid");
  const candidates=Object.keys(priceMap).filter(x=>x!=="SPY");
  const symbols=candidates.filter(x=>valid(priceMap[x])).sort();
  if(symbols.length<20)throw Error("Insufficient aligned investable price histories");
  const books=HISTORICAL_PROFILES.map(p=>createBook(p.id));
  const spyBook=createBook("spy");
  const equalBook=createBook("equal");
  for(let t=HISTORY_WARMUP;t<spy.length;t++){
    if(t===HISTORY_WARMUP){
      rebalance(spyBook,priceMap,t,["SPY"],costBps);
      rebalance(equalBook,priceMap,t,symbols,costBps);
    }
    if((t-HISTORY_WARMUP)%HISTORY_STEP===0){
      for(let j=0;j<HISTORICAL_PROFILES.length;j++){
        const profile=HISTORICAL_PROFILES[j];
        const selected=rankHistoricalSymbols(priceMap,symbols,t-1,profile.weights).slice(0,HISTORY_TOP);
        rebalance(books[j],priceMap,t,selected,costBps);
      }
    }
    const show=(t-HISTORY_WARMUP+1)%HISTORY_STEP===0||t===spy.length-1;
    for(const book of [...books,spyBook,equalBook])track(book,priceMap,t,show);
  }
  return {
    start:spy[HISTORY_WARMUP][0],end:spy.at(-1)![0],
    dataFrom:spy[0][0],dataTo:spy.at(-1)![0],
    inputSessions:spy.length,analysisSessions:spy.length-HISTORY_WARMUP,
    eligibleSymbols:symbols.length,excludedSymbols:candidates.length-symbols.length,
    priceSource:"nh_plug",lastDataAsOf:spy.at(-1)![0],
    costBps,warmup:HISTORY_WARMUP,rebalanceEvery:HISTORY_STEP,holdings:HISTORY_TOP,
    results:[...books,spyBook,equalBook].map(result),
  };
}
