import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getData } from "@/lib/data";
import { isLocale, LOCALES } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { isPatternId, PATTERNS } from "@/lib/pattern-lab";
import { patternDetail } from "@/lib/pattern-copy";
import { patternResearch } from "@/lib/pattern-server";
import { PatternDetailDashboard, PatternUnavailable } from "@/components/pattern-dashboard";

export const revalidate=14400;
type Props={params:Promise<{locale:string;id:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {locale,id}=await params;
  if(!isLocale(locale)||!isPatternId(id))return {robots:{index:false}};
  return dashboardMetadata(locale,"/patterns/"+id,patternDetail(locale,id).name,{description:patternDetail(locale,id).intro});
}
export async function generateStaticParams(){
  return LOCALES.flatMap(locale=>
    PATTERNS.map(p=>({locale,id:p.id})));
}
export default async function PatternDetailPage({params}:Props){
  const {locale,id}=await params;
  if(!isLocale(locale)||!isPatternId(id))notFound();
  let dataset:Awaited<ReturnType<typeof getData>>|undefined;
  try{dataset=await getData();}catch{/* Pattern study is independent of the AI dataset. */}
  try{
    const data=await patternResearch(dataset);
    return <PatternDetailDashboard locale={locale} data={data} id={id}/>;
  }catch(error){
    console.error("[pattern-lab/detail] aggregate unavailable",error instanceof Error?error.message:"unknown");
    return <PatternUnavailable locale={locale}/>;
  }
}
