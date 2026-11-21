import type { Dataset } from "./types";
import { verifiedDecisions } from "./insight-analytics.ts";
import { PATTERNS, type InternalPatternStudy, type PatternId } from "./pattern-lab.ts";

/** Historical pattern at day D CLOSE vs official model decision at D+1 PREOPEN.
 * Both have access only to data through D. Aggregates only; no per-stock
 * activity or licensed source quotes enter public React props.
 */
export type ModelPatternOverlap={
  modelId:string;model:string;agreement:number;opposition:number;hold:number;
};
export type PatternOverlap={id:PatternId;total:number;rows:ModelPatternOverlap[]};
export function comparePatternModels(
  d:Dataset,study:InternalPatternStudy
):PatternOverlap[]{
  const indexes=new Map(study.sessions.map((date,i)=>[date,i]));
  const byDateSymbol=new Map<string,{direction:"up"|"down";id:PatternId}[]>();
  for(const signal of study.signals){
    const next=study.sessions[signal.index+1];
    if(!next)continue;
    const key=next+":"+signal.date+":"+signal.symbol;
    const list=byDateSymbol.get(key)??[];
    list.push({direction:signal.direction,id:signal.id});
    byDateSymbol.set(key,list);
  }
  const models=d.accounts.filter(a=>a.kind==="ai");
  const modelIds=new Set(models.map(a=>a.aiId));
  const result=new Map(PATTERNS.map(p=>[p.id,new Map(
    models.map(m=>[m.aiId!,{
      modelId:m.aiId!,model:m.name,agreement:0,opposition:0,hold:0,
    }])
  )]));
  for(const decision of verifiedDecisions(d)){
    if(!modelIds.has(decision.aiId))continue;
    const idx=indexes.get(decision.dataAsOf);
    if(idx===undefined||study.sessions[idx+1]!==decision.sessionDate)continue;
    const seen=new Set<string>();
    for(const action of decision.actions){
      if(seen.has(action.symbol))continue;
      if(!["BUY","SELL","HOLD"].includes(action.action))continue;
      if(action.action!=="HOLD"&&(!Number.isFinite(action.quantity)||action.quantity<=0))continue;
      seen.add(action.symbol);
      const signals=byDateSymbol.get(decision.sessionDate+":"+decision.dataAsOf+":"+action.symbol)??[];
      for(const signal of signals){
        const row=result.get(signal.id)?.get(decision.aiId);
        if(!row)continue;
        if(action.action==="HOLD")row.hold++;
        else if((action.action==="BUY"&&signal.direction==="up")||
                (action.action==="SELL"&&signal.direction==="down"))row.agreement++;
        else row.opposition++;
      }
    }
  }
  return PATTERNS.map(p=>{
    const rows=[...(result.get(p.id)?.values()??[])];
    return {id:p.id,rows,total:rows.reduce((n,r)=>n+r.agreement+r.opposition+r.hold,0)};
  });
}
