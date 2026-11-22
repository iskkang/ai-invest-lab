import "server-only";
import { unstable_cache } from "next/cache";
import { serverSupabase } from "./server-supabase";
import { evaluateDirectionalAccuracy, verifiedDecisions } from "./insight-analytics";
import { makeAdjustedPriceMap, type PriceRow, type SplitRow } from "./price-adjust";
import type { Dataset } from "./types";

/** Public results expose only aggregate AI accuracy, never licensed price rows. */
export const loadPrivateAdjustedBars = unstable_cache(async (symbols: string[], since: string) => {
  const db = serverSupabase();
  const rows: PriceRow[] = [];
  for (let offset = 0; offset < 60000; offset += 1000) {
    const {data,error} = await db.from("stock_prices")
      .select("symbol,trade_date,open,high,low,close,volume")
      .eq("source","nh_plug").in("symbol",symbols)
      .gte("trade_date",since)
      .order("trade_date",{ascending:true}).order("symbol",{ascending:true})
      .range(offset,offset+999);
    if (error) throw new Error("Unable to retrieve verified NH historical sessions");
    rows.push(...(data??[]) as PriceRow[]);
    if (!data || data.length < 1000) break;
    if (offset >= 59000) throw new Error("Accuracy session pagination cap reached");
  }
  if (!rows.length) return {};
  const last = rows.reduce((v,row) => row.trade_date>v?row.trade_date:v,"");
  const {data:actions,error:actionError}=await db.from("corporate_actions")
    .select("symbol,kind,ex_date,ratio")
    .in("symbol",symbols).eq("price_source","nh_plug").eq("kind","split")
    .lte("ex_date",last).lte("created_at",new Date().toISOString());
  if(actionError)throw new Error("Unable to validate historical stock splits");
  return makeAdjustedPriceMap(rows,(actions??[]) as SplitRow[],last);
},["logicsight-private-accuracy-prices-v1"],{revalidate:3600});

/** No original price, per-stock quote or secret is returned to the browser. */
export async function getAggregateAccuracy(d: Dataset) {
  const settled=new Set(d.rounds.filter(r=>r.status==="settled").map(r=>r.id));
  const directional=verifiedDecisions(d).filter(dec=>settled.has(dec.roundId))
    .flatMap(dec=>dec.actions.filter(action=>
    (action.action==="BUY" || action.action==="SELL") && action.quantity>0 && action.symbol!=="SPY"
  ).map(action=>({symbol:action.symbol,session:dec.sessionDate})));
  if(!directional.length)return evaluateDirectionalAccuracy(d,{});
  const symbols=[...new Set(["SPY",...directional.map(row=>row.symbol)])].sort();
  const since=directional.map(row=>row.session).sort()[0];
  const adjusted=await loadPrivateAdjustedBars(symbols,since);
  return evaluateDirectionalAccuracy(d,adjusted);
}


/** Resolve past directional outcomes on the server. Price rows never reach RSC. */
export async function getDecisionFollowups(d:Dataset,limit=100) {
  const {followupInputs,evaluateDecisionFollowups}=await import("./retention-analytics");
  const input=followupInputs(d);
  if(!input.since)return [];
  const adjusted=await loadPrivateAdjustedBars(input.symbols,input.since);
  return evaluateDecisionFollowups(d,adjusted,limit);
}
