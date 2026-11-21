import type { Bar, Dataset, DecisionAction } from "./types";
import { compareLatestRound, verifiedDecisions, type SymbolComparison } from "./insight-analytics";

/** Stored-data summaries only. No AI call on a page view, no implied HOLD. */
export function rankedDisagreements(rows: SymbolComparison[]): SymbolComparison[] {
  return rows.filter(row=>row.conflicted).slice().sort((a,b)=>{
    const oppositeA=Number(a.buy>0&&a.sell>0);
    const oppositeB=Number(b.buy>0&&b.sell>0);
    const balanceA=a.votes.length-a.agreement;
    const balanceB=b.votes.length-b.agreement;
    return oppositeB-oppositeA || balanceB-balanceA ||
      b.votes.length-a.votes.length || a.symbol.localeCompare(b.symbol);
  });
}

export function dailyBrief(d: Dataset) {
  const comparison=compareLatestRound(d);
  const round=d.rounds.find(r=>r.sessionDate===comparison.date &&
    (r.status==="decided" || r.status==="settled"));
  const included=verifiedDecisions(d).filter(dec=>dec.roundId===round?.id);
  const actions=included.flatMap(dec=>{
    const seen=new Set<string>();
    return dec.actions.filter(a=>{
      if(!["BUY","SELL","HOLD"].includes(a.action)||seen.has(a.symbol))return false;
      if((a.action==="BUY"||a.action==="SELL") && a.quantity<=0)return false;
      seen.add(a.symbol);return true;
    });
  });
  const ai=d.accounts.filter(a=>a.kind==="ai");
  const models=ai.map(a=>{
    const dec=included.find(x=>x.aiId===a.aiId);
    return {id:a.aiId ?? a.name,name:a.name,color:a.color,
      summary:dec?.summary ?? null,participated:!!dec,
      actions:dec?.actions.filter(x=>["BUY","SELL","HOLD"].includes(x.action)).length ?? 0};
  });
  return {
    date:comparison.date,dataAsOf:round?.dataAsOf??null,
    participants:included.length,total:ai.length,models,
    buy:actions.filter(a=>a.action==="BUY").length,
    sell:actions.filter(a=>a.action==="SELL").length,
    hold:actions.filter(a=>a.action==="HOLD").length,
    disagreements:rankedDisagreements(comparison.disagreements).slice(0,5),
    consensus:comparison.consensus.slice(0,5),
  };
}

export const FOLLOWUP_HORIZONS=[1,5,20] as const;
export type FollowupHorizon=(typeof FOLLOWUP_HORIZONS)[number];
export type FollowupVerdict="hit"|"miss"|"flat"|"pending"|"unavailable";
export type FollowupObservation={
  horizon:FollowupHorizon;
  date:string|null;
  verdict:FollowupVerdict;
};
export type FollowupSignal={
  id:string;
  decisionId:number;
  aiId:string;
  aiName:string;
  color:string;
  sessionDate:string;
  symbol:string;
  side:"BUY"|"SELL";
  reason:string;
  observed:FollowupObservation[];
};
const finitePositive=(n:number)=>Number.isFinite(n)&&n>0;

/** Directional follow-ups, not execution P&L or proof of model skill.
 * Evaluate a recorded BUY/SELL against the decision session's opening
 * reference and the close after 1/5/20 SUBSEQUENT verified SPY sessions.
 * Raw per-ticker bars never leave the server; only outcomes are rendered.
 */
export function evaluateDecisionFollowups(d:Dataset,bars:Record<string,Bar[]>):FollowupSignal[] {
  const settled=new Set(d.rounds.filter(r=>r.status==="settled").map(r=>r.id));
  const models=new Map(d.accounts.filter(a=>a.kind==="ai").map(a=>[a.aiId,a]));
  const investable=new Set(d.universe.filter(s=>s.role==="investable").map(s=>s.symbol));
  const spy=bars.SPY??[];
  const dates=spy.map(row=>row[0]);
  const dateIndex=new Map(dates.map((date,i)=>[date,i]));
  const bySymbol=new Map(Object.entries(bars).map(([symbol,rows])=>
    [symbol,new Map(rows.map(row=>[row[0],row]))]));
  const decisions=verifiedDecisions(d).filter(dec=>settled.has(dec.roundId))
    .slice().sort((a,b)=>b.sessionDate.localeCompare(a.sessionDate)||b.id-a.id);
  const result:FollowupSignal[]=[];
  for(const dec of decisions){
    const ai=models.get(dec.aiId);
    if(!ai)continue;
    const seen=new Set<string>();
    for(const action of dec.actions){
      if(!investable.has(action.symbol)||seen.has(action.symbol)||
         (action.action!=="BUY"&&action.action!=="SELL")||action.quantity<=0)continue;
      seen.add(action.symbol);
      const sessionIndex=dateIndex.get(dec.sessionDate);
      const start=bySymbol.get(action.symbol)?.get(dec.sessionDate);
      const observed:FollowupObservation[]=FOLLOWUP_HORIZONS.map(horizon=>{
        if(sessionIndex===undefined){
          return {horizon,date:null,verdict:dates.length===0||
            dec.sessionDate>dates[dates.length-1]?"pending":"unavailable"};
        }
        const endDate=dates[sessionIndex+horizon];
        if(!endDate)return {horizon,date:null,verdict:"pending"};
        const end=bySymbol.get(action.symbol)?.get(endDate);
        if(!start||!end||!finitePositive(start[1])||!finitePositive(end[4])){
          return {horizon,date:endDate,verdict:"unavailable"};
        }
        const change=end[4]-start[1];
        const aligned=(action.action==="BUY"?1:-1)*change;
        return {horizon,date:endDate,verdict:aligned>0?"hit":aligned<0?"miss":"flat"};
      });
      result.push({
        id:String(dec.id)+":"+action.symbol,decisionId:dec.id,
        aiId:dec.aiId,aiName:ai.name,color:ai.color,
        sessionDate:dec.sessionDate,symbol:action.symbol,side:action.action,
        reason:action.reason,observed,
      });
    }
  }
  // Keep the public page bounded while preserving newest-first chronology.
  return result.slice(0,100);
}

/** Extract the exact directional universe necessary for server-side follow-ups. */
export function followupInputs(d:Dataset):{symbols:string[];since:string|null}{
  const settled=new Set(d.rounds.filter(r=>r.status==="settled").map(r=>r.id));
  const eligible=verifiedDecisions(d).filter(dec=>settled.has(dec.roundId));
  const rows=eligible.flatMap(dec=>dec.actions.filter((a:DecisionAction)=>
    (a.action==="BUY"||a.action==="SELL")&&a.quantity>0
  ).map(a=>({symbol:a.symbol,date:dec.sessionDate})));
  if(!rows.length)return {symbols:[],since:null};
  return {symbols:[...new Set(["SPY",...rows.map(x=>x.symbol)])].sort(),
    since:rows.map(x=>x.date).sort()[0]};
}
