import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getData } from "@/lib/data";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { returningCopy } from "@/lib/returning-copy";
import { ReturnVisitPulse, DecisionRevisionPanel, PortfolioMovement, RoundJournalPanel } from "@/components/returning-panels";
import { InsightUnavailable } from "@/components/insight-panels";

export const revalidate=300;
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
    return <div className="mx-auto max-w-5xl space-y-5">
      <ReturnVisitPulse d={d}/>
      <DecisionRevisionPanel d={d}/>
      <PortfolioMovement d={d}/>
      <RoundJournalPanel d={d}/>
    </div>;
  }catch{return <InsightUnavailable locale={locale}/>;}
}
