import type { Dataset, DecisionAction, Round } from "./types";
import { verifiedDecisions } from "./insight-analytics.ts";
import type { FollowupHorizon, FollowupSignal, FollowupVerdict } from "./retention-analytics.ts";

/** All content is computed from immutable experiment records.
 * No prose generation, synthetic performance or missing-vote inference.
 */
const published=(r:Round)=>r.status==="decided"||r.status==="settled";
const scored=(v:FollowupVerdict)=>v==="hit"||v==="miss"||v==="flat";
const ordering=(a:Round,b:Round)=>b.sessionDate.localeCompare(a.sessionDate)||b.id-a.id;

function validActions(d:Dataset, actions:DecisionAction[]) {
  const investable=new Set(d.universe.filter(s=>s.role==="investable").map(s=>s.symbol));
  const seen=new Set<string>();
  return actions.filter(a=>{
    if(!investable.has(a.symbol)||seen.has(a.symbol)||
       !["BUY","SELL","HOLD"].includes(a.action)||
       (a.action!=="HOLD"&&(!Number.isFinite(a.quantity)||a.quantity<=0)))return false;
    seen.add(a.symbol);return true;
  });
}

export function publicationPulse(d:Dataset){
  const last=d.rounds.slice().sort(ordering)[0]??null;
  const latestPublished=d.rounds.filter(published).slice().sort(ordering)[0]??null;
  const publishedDecisions=verifiedDecisions(d);
  const latestDecisions=publishedDecisions.filter(x=>x.roundId===latestPublished?.id);
  const ai=new Set(d.accounts.filter(a=>a.kind==="ai").map(a=>a.aiId));
  const valuations=d.snapshots.filter(s=>d.accounts.some(a=>a.id===s.accountId&&a.kind==="ai"));
  const latestValuation=valuations.map(s=>s.date).sort().at(-1)??null;
  const liveRounds=d.rounds.filter(published).length;
  return {
    latestSession:last?.sessionDate??null,
    latestRoundStatus:last?.status??null,
    latestPublishedDate:latestPublished?.sessionDate??null,
    latestValuation,
    verifiedModels:new Set(latestDecisions.map(x=>x.aiId).filter(id=>ai.has(id))).size,
    totalModels:ai.size,
    publishedRounds:liveRounds,
    startSession:d.experiment.startSession,
  };
}

export type RoundEntry={
  id:number;
  date:string;
  dataAsOf:string;
  status:string;
  models:number;
  totalModels:number;
  buy:number;
  sell:number;
  hold:number;
  trades:number;
  valuedModels:number;
};

export function recentRoundJournal(d:Dataset,limit=12):RoundEntry[]{
  const ids=new Set(d.accounts.filter(a=>a.kind==="ai").map(a=>a.id));
  const aiIds=new Set(d.accounts.filter(a=>a.kind==="ai").map(a=>a.aiId));
  const verified=verifiedDecisions(d);
  return d.rounds.filter(r=>published(r)||r.status==="aborted")
    .slice().sort(ordering).slice(0,limit).map(r=>{
      const decisions=published(r)?verified.filter(dec=>dec.roundId===r.id&&aiIds.has(dec.aiId)):[];
      const actions=decisions.flatMap(dec=>validActions(d,dec.actions));
      return {
        id:r.id,date:r.sessionDate,dataAsOf:r.dataAsOf,status:r.status,
        models:new Set(decisions.map(dec=>dec.aiId)).size,totalModels:aiIds.size,
        buy:actions.filter(a=>a.action==="BUY").length,
        sell:actions.filter(a=>a.action==="SELL").length,
        hold:actions.filter(a=>a.action==="HOLD").length,
        trades:d.trades.filter(t=>ids.has(t.accountId)&&t.tradeDate===r.sessionDate).length,
        valuedModels:new Set(d.snapshots.filter(s=>ids.has(s.accountId)&&s.date===r.sessionDate)
          .map(s=>s.accountId)).size,
      };
    });
}

export type DecisionRevision={
  id:string;model:string;aiId:string;symbol:string;from:"BUY"|"SELL"|"HOLD";
  to:"BUY"|"SELL"|"HOLD";previousDate:string;currentDate:string;
};

export function decisionRevisions(d:Dataset,limit=12):DecisionRevision[]{
  const verified=verifiedDecisions(d);
  const rounds=d.rounds.filter(r=>published(r)&&verified.some(dec=>dec.roundId===r.id))
    .slice().sort(ordering);
  if(rounds.length<2)return [];
  const current=rounds[0],previous=rounds[1];
  const names=new Map(d.accounts.filter(a=>a.kind==="ai").map(a=>[a.aiId,a.name]));
  const prevByModel=new Map(verified.filter(dec=>dec.roundId===previous.id)
    .map(dec=>[dec.aiId,new Map(validActions(d,dec.actions).map(a=>[a.symbol,a.action]))]));
  const result:DecisionRevision[]=[];
  for(const dec of verified.filter(x=>x.roundId===current.id)){
    const previousActions=prevByModel.get(dec.aiId);
    if(!previousActions)continue;
    for(const action of validActions(d,dec.actions)){
      const from=previousActions.get(action.symbol);
      if(from&&from!==action.action){
        result.push({
          id:dec.aiId+":"+action.symbol,model:names.get(dec.aiId)??dec.aiId,
          aiId:dec.aiId,symbol:action.symbol,from,to:action.action,
          previousDate:previous.sessionDate,currentDate:current.sessionDate,
        });
      }
    }
  }
  return result.sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.aiId.localeCompare(b.aiId)).slice(0,limit);
}

export type PortfolioMove={aiId:string;name:string;color:string;dailyReturn:number;date:string};
export function latestPortfolioMoves(d:Dataset):PortfolioMove[]{
  const dates=[...new Set(d.snapshots.map(s=>s.date))].sort();
  const date=dates.at(-1);
  if(!date)return [];
  return d.accounts.filter(a=>a.kind==="ai").flatMap(a=>{
    const s=d.snapshots.find(s=>s.accountId===a.id&&s.date===date);
    if(!s||s.dailyReturn===null||!Number.isFinite(s.dailyReturn))return [];
    return [{aiId:a.aiId??a.name,name:a.name,color:a.color,date,dailyReturn:s.dailyReturn}];
  }).sort((a,b)=>b.dailyReturn-a.dailyReturn);
}

export type ModelOutcome={
  id:string;name:string;color:string;horizon:FollowupHorizon;
  samples:number;hits:number;misses:number;flats:number;
  hitRate:number|null;qualified:boolean;
};
export function followupScorecard(d:Dataset,signals:FollowupSignal[],horizon:FollowupHorizon):ModelOutcome[]{
  return d.accounts.filter(a=>a.kind==="ai").map(a=>{
    const observations=signals.filter(s=>s.aiId===a.aiId)
      .map(s=>s.observed.find(x=>x.horizon===horizon)?.verdict)
      .filter((v):v is FollowupVerdict=>Boolean(v)&&scored(v!));
    const hits=observations.filter(v=>v==="hit").length;
    const misses=observations.filter(v=>v==="miss").length;
    const flats=observations.filter(v=>v==="flat").length;
    return {
      id:a.aiId??a.name,name:a.name,color:a.color,horizon,
      samples:observations.length,hits,misses,flats,
      hitRate:observations.length?hits/observations.length:null,
      qualified:observations.length>=20,
    };
  });
}

export type NewlyObserved={
  id:string;aiId:string;aiName:string;symbol:string;side:"BUY"|"SELL";
  decisionDate:string;observedDate:string;horizon:FollowupHorizon;
  verdict:"hit"|"miss"|"flat";
};
export function recentlyResolvedOutcomes(signals:FollowupSignal[],limit=8):NewlyObserved[]{
  return signals.flatMap(signal=>signal.observed.flatMap(row=>
    row.date&&scored(row.verdict)?[{
      id:signal.id+":"+row.horizon,aiId:signal.aiId,aiName:signal.aiName,
      symbol:signal.symbol,side:signal.side,decisionDate:signal.sessionDate,
      observedDate:row.date,horizon:row.horizon,
      verdict:row.verdict as "hit"|"miss"|"flat",
    }]:[]
  )).sort((a,b)=>b.observedDate.localeCompare(a.observedDate)||
    a.horizon-b.horizon||a.symbol.localeCompare(b.symbol)).slice(0,limit);
}
