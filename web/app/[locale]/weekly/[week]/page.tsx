import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getData } from "@/lib/data";
import { generateWeeklyReports } from "@/lib/insight-analytics";
import { insightCopy } from "@/lib/insight-copy";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { InsightUnavailable, WeeklyReportBody } from "@/components/insight-panels";

export const revalidate=300;
type Props={params:Promise<{locale:string;week:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {locale,week}=await params;
  if(!isLocale(locale)||!/^20\d\d-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(week))
    return {robots:{index:false}};
  return dashboardMetadata(locale,"/weekly/"+week,insightCopy(locale).report+" "+week);
}
export default async function WeeklyReportPage({params}:Props){
  const {locale,week}=await params;
  if(!isLocale(locale)||!/^20\d\d-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(week))notFound();
  let d:Awaited<ReturnType<typeof getData>>;
  try{d=await getData();}
  catch{return <InsightUnavailable locale={locale}/>;}
  const report=generateWeeklyReports(d).find(item=>item.week===week);
  if(!report)notFound();
  return <WeeklyReportBody d={d} report={report}/>;
}
