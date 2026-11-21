import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getData } from "@/lib/data";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { insightCopy } from "@/lib/insight-copy";
import { ConsensusBody, InsightUnavailable } from "@/components/insight-panels";

export const revalidate=300;
type RouteProps={params:Promise<{locale:string}>};
export async function generateMetadata({params}:RouteProps):Promise<Metadata>{
  const {locale}=await params;
  if(!isLocale(locale))return {robots:{index:false}};
  return dashboardMetadata(locale,"/consensus",insightCopy(locale).consensus);
}
export default async function ConsensusPage({params}:RouteProps){
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  try { return <ConsensusBody d={await getData()}/>; }
  catch { return <InsightUnavailable locale={locale}/>; }
}
