import "server-only";
import { unstable_cache } from "next/cache";
import { serverSupabase } from "./server-supabase";
import { makeAdjustedPriceMap, type PriceRow, type SplitRow } from "./price-adjust";
import { runHistoricalStudy, type HistoricalStudy } from "./historical-strategy";

/**
 * Build a cached aggregate server-side. The API secret and NH PLUG per-stock
 * OHLCV must never appear in RSC props, JSON route responses or browser JS.
 * This is separate from the REAL AI investment experiment and ledger.
 */
const runCachedResearch = unstable_cache(async (): Promise<HistoricalStudy> => {
  const sb=serverSupabase();
  const {data:universe,error:universeError}=await sb.from("stock_universe")
    .select("symbol,role").is("removed_at",null);
  if(universeError)throw new Error("Historical universe lookup failed");
  const investable=(universe??[]).filter(row=>row.role==="investable")
    .map(row=>String(row.symbol)).filter(symbol=>/^[A-Z.]{1,8}$/.test(symbol)).sort();
  if(investable.length<20)throw new Error("Historical universe is not ready");
  const symbols=[...new Set(["SPY",...investable])];
  const rows:PriceRow[]=[];
  for(let offset=0;offset<60000;offset+=1000){
    const {data,error}=await sb.from("stock_prices")
      .select("symbol,trade_date,open,high,low,close,volume")
      .eq("source","nh_plug")
      .in("symbol",symbols)
      .order("trade_date",{ascending:true})
      .order("symbol",{ascending:true})
      .range(offset,offset+999);
    if(error)throw new Error("Historical NH PLUG data unavailable");
    rows.push(...(data??[]) as PriceRow[]);
    if(!data||data.length<1000)break;
    if(offset>=59000)throw new Error("Too many historical bars for this research job");
  }
  if(!rows.length)throw new Error("No verified NH PLUG historical bars");
  const cutoff=rows.reduce((max,row)=>row.trade_date>max?row.trade_date:max,"");
  const {data:actions,error:splitError}=await sb.from("corporate_actions")
    .select("symbol,kind,ex_date,ratio")
    .in("symbol",symbols)
    .eq("price_source","nh_plug").eq("kind","split")
    .lte("ex_date",cutoff)
    .lte("created_at",new Date().toISOString());
  if(splitError)throw new Error("Could not validate split history");
  const priceMap=makeAdjustedPriceMap(rows,(actions??[]) as SplitRow[],cutoff);
  // Only derived, portfolio-level returns leave the server.
  return runHistoricalStudy(priceMap);
},["logicsight-historical-study-nh-plug-v1"],{revalidate:14400});

export async function historicalResearch():Promise<HistoricalStudy>{
  return runCachedResearch();
}
