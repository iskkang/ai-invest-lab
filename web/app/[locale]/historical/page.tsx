import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { historicalCopy } from "@/lib/historical-copy";
import { historicalResearch } from "@/lib/historical-server";
import { HistoricalDashboard, HistoricalUnavailable } from "@/components/historical-dashboard";

export const revalidate=14400;
type RouteProps={params:Promise<{locale:string}>};

export async function generateMetadata({params}:RouteProps):Promise<Metadata>{
  const {locale}=await params;
  if(!isLocale(locale))return {robots:{index:false,follow:false}};
  const copy=historicalCopy(locale);
  return dashboardMetadata(locale,"/historical",copy.headline);
}
export default async function HistoricalPage({params}:RouteProps){
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  try{
    const study=await historicalResearch();
    return <HistoricalDashboard locale={locale} study={study}/>;
  }catch(error){
    console.error("[historical/research] Unable to assemble aggregate study",
      error instanceof Error?error.message:"unknown error");
    return <HistoricalUnavailable locale={locale}/>;
  }
}
