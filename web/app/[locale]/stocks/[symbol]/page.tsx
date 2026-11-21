import { notFound } from "next/navigation";
import StockPage from "@/app/stocks/[symbol]/page";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
export const revalidate=300;
export async function generateMetadata({params}:{params:Promise<{locale:string;symbol:string}>}) {
  const {locale,symbol}=await params;
  if(!isLocale(locale))return {robots:{index:false}};
  // No individual licensed market-data chart is indexed until redistribution rights are confirmed.
  return dashboardMetadata(locale,`/stocks/${symbol.toUpperCase()}`,symbol.toUpperCase(),{noindex:true});
}
export default async function LocalizedStock({params}:{params:Promise<{locale:string;symbol:string}>}) {
  const {locale,symbol}=await params;
  if(!isLocale(locale)||!/^[A-Z0-9.-]{1,15}$/i.test(symbol))notFound();
  return <StockPage params={Promise.resolve({symbol})}/>;
}
