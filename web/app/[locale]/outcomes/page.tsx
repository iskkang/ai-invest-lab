import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getData } from "@/lib/data";
import { getDecisionFollowups } from "@/lib/insight-server";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { retentionCopy } from "@/lib/retention-copy";
import { FollowupsPage } from "@/components/retention-panels";
import { ModelOutcomeScorecard, RecentResolvedPanel } from "@/components/returning-panels";
import { InsightUnavailable } from "@/components/insight-panels";

export const revalidate=3600;
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {locale}=await params;
  if(!isLocale(locale))return {robots:{index:false}};
  return dashboardMetadata(locale,"/outcomes",retentionCopy(locale).followups);
}
export default async function OutcomesPage({params}:Props) {
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  try {
    const d=await getData();
    const signals=await getDecisionFollowups(d);
    return <div className="mx-auto max-w-5xl space-y-5">
      <ModelOutcomeScorecard d={d} signals={signals}/>
      <RecentResolvedPanel d={d} signals={signals}/>
      <FollowupsPage d={d} signals={signals}/>
    </div>;
  }catch{return <InsightUnavailable locale={locale}/>;}
}
