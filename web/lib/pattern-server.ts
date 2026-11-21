import "server-only";
import { unstable_cache } from "next/cache";
import { serverSupabase } from "./server-supabase";
import { loadPrivateAdjustedBars } from "./insight-server";
import { runPatternStudy, type PatternStudy, type InternalPatternStudy } from "./pattern-lab";
import { comparePatternModels, type PatternOverlap } from "./pattern-compare";
import type { Dataset } from "./types";

/** Fixed study, computed with server-side NH PLUG adjusted bars.
 * Cached internal events stay on the server. Public React props receive
 * ONLY aggregate PatternStudy + aggregated AI comparison.
 */
const cachedPatternStudy=unstable_cache(async ():Promise<InternalPatternStudy>=>{
  const db=serverSupabase();
  const {data,error}=await db.from("stock_universe")
    .select("symbol,role").eq("role","investable").is("removed_at",null);
  if(error)throw new Error("Pattern Lab universe unavailable");
  const candidates=(data??[]).map(row=>String(row.symbol))
    .filter(symbol=>/^[A-Z.]{1,8}$/.test(symbol)).sort();
  if(candidates.length<15)throw new Error("Pattern Lab stock universe is not ready");
  const symbols=[...new Set(["SPY",...candidates])].sort();
  const bars=await loadPrivateAdjustedBars(symbols,"2000-01-01");
  return runPatternStudy(bars);
},["ail-pattern-lab-v1-nh-plug"],{revalidate:14400});

export type PublicPatternLab={study:PatternStudy;aiOverlap:PatternOverlap[]|null};
export async function patternResearch(d?:Dataset):Promise<PublicPatternLab>{
  const internal=await cachedPatternStudy();
  const aiOverlap=d?comparePatternModels(d,internal):null;
  // Never return internal signals/sessions or licensed price observations.
  return {study:internal.publicStudy,aiOverlap};
}
