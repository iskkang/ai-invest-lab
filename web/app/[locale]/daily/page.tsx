import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DecisionCoverage } from "@/components/decision-coverage";
import { getData } from "@/lib/data";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { retentionCopy } from "@/lib/retention-copy";
import { DailyBriefing, TopConflicts, FollowupsPreview } from "@/components/retention-panels";
import { InsightUnavailable } from "@/components/insight-panels";
import { DecisionRevisionPanel, PortfolioMovement, RoundJournalPanel } from "@/components/returning-panels";

export const revalidate=300;
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {locale}=await params;
  if(!isLocale(locale))return {robots:{index:false}};
  return dashboardMetadata(locale,"/daily",retentionCopy(locale).daily);
}
export default async function DailyPage({params}:Props){
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  try {
    const d=await getData();
    return <div className="mx-auto max-w-5xl space-y-6">
      <DecisionCoverage d={d}/>
      <DailyBriefing d={d}/>
      <div className="grid gap-4 lg:grid-cols-2">
        <PortfolioMovement d={d}/>
        <DecisionRevisionPanel d={d}/>
      </div>
      <TopConflicts d={d}/>
      <RoundJournalPanel d={d} compact/>
      <FollowupsPreview d={d}/>
    </div>;
  }catch{return <InsightUnavailable locale={locale}/>;}
}
