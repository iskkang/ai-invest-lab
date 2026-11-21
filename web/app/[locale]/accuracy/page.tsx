import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getData } from "@/lib/data";
import { getAggregateAccuracy } from "@/lib/insight-server";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { insightCopy } from "@/lib/insight-copy";
import { AccuracyBody, InsightUnavailable } from "@/components/insight-panels";

export const revalidate=300;
type RouteProps={params:Promise<{locale:string}>};
export async function generateMetadata({params}:RouteProps):Promise<Metadata>{
  const {locale}=await params;
  if(!isLocale(locale))return {robots:{index:false}};
  return dashboardMetadata(locale,"/accuracy",insightCopy(locale).accuracy);
}
export default async function AccuracyPage({params}:RouteProps){
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  try{
    const d=await getData();
    const rows=await getAggregateAccuracy(d);
    return <AccuracyBody d={d} rows={rows}/>;
  }catch{return <InsightUnavailable locale={locale}/>;}
}
