import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getData } from "@/lib/data";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { returningCopy } from "@/lib/returning-copy";
import { ReturnVisitPulse, DecisionRevisionPanel, PortfolioMovement, UniverseChangeJournal, RoundJournalPanel } from "@/components/returning-panels";
import { InsightUnavailable } from "@/components/insight-panels";

export const revalidate=0;
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {locale}=await params;
  if(!isLocale(locale))return {robots:{index:false}};
  return dashboardMetadata(locale,"/journal",returningCopy(locale).diary);
}
export default async function JournalPage({params}:Props){
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  try{
    const d=await getData();
    // Change announcements bypass the 5-minute dashboard cache and appear as soon as scheduled.
    const {serverSupabase}=await import("@/lib/server-supabase");
    const sb=serverSupabase();
    const {data:exp,error:expError}=await sb.from("experiments").select("id").eq("name",d.experiment.name).single();
    if(expError||!exp)throw new Error("Journal experiment lookup failed");
    const {data:changes,error:changeError}=await sb.from("universe_change_requests")
      .select("id,action,symbol,reason,scheduled_at,effective_session,status,applied_at,applied_round_id")
      .eq("experiment_id",exp.id).order("scheduled_at",{ascending:false});
    if(changeError)throw new Error("Journal change announcements unavailable");
    d.universeChanges=(changes??[]).map((entry)=>({
      id:entry.id,action:entry.action,symbol:entry.symbol,reason:entry.reason,
      scheduledAt:entry.scheduled_at,effectiveSession:entry.effective_session,
      status:entry.status,appliedAt:entry.applied_at??null,
      appliedRoundId:entry.applied_round_id??null,
    }));
    return <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-2"><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{returningCopy(locale).diary}</h1><p className="text-sm leading-6 text-muted">{returningCopy(locale).diarySub}</p></header>
      <UniverseChangeJournal d={d}/>
      <ReturnVisitPulse d={d}/>
      <DecisionRevisionPanel d={d}/>
      <PortfolioMovement d={d}/>
      <RoundJournalPanel d={d}/>
    </div>;
  }catch{return <InsightUnavailable locale={locale}/>;}
}
