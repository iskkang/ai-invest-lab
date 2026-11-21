import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { patternCopy } from "@/lib/pattern-copy";
import { patternResearch } from "@/lib/pattern-server";
import { PatternDashboard, PatternUnavailable } from "@/components/pattern-dashboard";

export const revalidate=14400;
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {locale}=await params;
  if(!isLocale(locale))return {robots:{index:false}};
  return dashboardMetadata(locale,"/patterns",patternCopy(locale).headline);
}
export default async function PatternsPage({params}:Props){
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  try{
    const result=await patternResearch();
    return <PatternDashboard locale={locale} data={result}/>;
  }catch(error){
    console.error("[pattern-lab] aggregate unavailable",error instanceof Error?error.message:"unknown");
    return <PatternUnavailable locale={locale}/>;
  }
}
