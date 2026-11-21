import "server-only";
import { serverSupabase } from "./server-supabase";

export type ActiveMethodology = {
  experimentName:string;
  feeBps:number;
  slippageBps:number;
  models:{id:string;model:string}[];
};

/** Public-safe operational metadata. No prices, prompts, credentials or
 * private account/decision records ever leave this server-only module.
 * An outage means "unverified", NOT a fabricated fallback runtime state.
 */
export async function loadActiveMethodology():Promise<ActiveMethodology|null>{
  try{
    const db=serverSupabase();
    const [{data:experiments,error:experimentError},{data:versions,error:versionsError}]=await Promise.all([
      db.from("experiments").select("name,mode,fee_bps,slippage_bps")
        .eq("name",process.env.AIL_EXPERIMENT||"season-1").eq("mode","live").limit(1),
      db.from("model_versions").select("ai_model_id,openrouter_model_id")
        .is("effective_to",null),
    ]);
    if(experimentError||versionsError||!experiments?.length||!versions?.length)return null;
    const current=experiments[0];
    const fee=Number(current.fee_bps),slippage=Number(current.slippage_bps);
    if(!Number.isFinite(fee)||!Number.isFinite(slippage))return null;
    return {
      experimentName:String(current.name),feeBps:fee,slippageBps:slippage,
      models:versions.map(v=>({id:String(v.ai_model_id),model:String(v.openrouter_model_id)})),
    };
  }catch{
    return null;
  }
}
