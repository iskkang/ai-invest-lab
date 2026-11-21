import { notFound } from "next/navigation";
import AiPage from "@/app/ai/[id]/page";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";

const IDS=["gpt","claude","gemini","deepseek"] as const;
export const revalidate=300;
export function generateStaticParams() {
  return ["en","zh","ko","ja"].flatMap(locale=>IDS.map(id=>({locale,id})));
}
export async function generateMetadata({params}:{params:Promise<{locale:string;id:string}>}) {
  const {locale,id}=await params;
  if(!isLocale(locale)||!IDS.includes(id as typeof IDS[number])) return {robots:{index:false}};
  return dashboardMetadata(locale,`/ai/${id}`,`${id.toUpperCase()} AI Paper Trading`);
}
export default async function LocalizedAi({params}:{params:Promise<{locale:string;id:string}>}) {
  const {locale,id}=await params;
  if(!isLocale(locale)||!IDS.includes(id as typeof IDS[number])) notFound();
  return <AiPage params={Promise.resolve({id})}/>;
}
