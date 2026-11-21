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
      <header className="space-y-2"><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{returningCopy(locale).diary}</h1><p className="text-sm leading-6 text-muted">{returningCopy(locale).diarySub}</p></header>
      <ReturnVisitPulse d={d}/>
      <DecisionRevisionPanel d={d}/>
      <PortfolioMovement d={d}/>
      <RoundJournalPanel d={d}/>
    </div>;
  }catch{return <InsightUnavailable locale={locale}/>;}
}
