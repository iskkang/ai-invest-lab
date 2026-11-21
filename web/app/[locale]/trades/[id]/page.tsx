import { notFound } from "next/navigation";
import TradeDetail from "@/app/trades/[id]/page";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
export const revalidate=300;
export async function generateMetadata({params}:{params:Promise<{locale:string;id:string}>}) {
  const {locale,id}=await params;
  if(!isLocale(locale)||!/^\d+$/.test(id))return {robots:{index:false}};
  return dashboardMetadata(locale,`/trades/${id}`,`Simulated trade ${id}`,{noindex:true});
}
export default async function LocalizedTrade({params}:{params:Promise<{locale:string;id:string}>}) {
  const {locale,id}=await params;
  if(!isLocale(locale)||!/^\d+$/.test(id))notFound();
  return <TradeDetail params={Promise.resolve({id})}/>;
}
