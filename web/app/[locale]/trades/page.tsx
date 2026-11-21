import { notFound } from "next/navigation";
import TradesPage from "@/app/trades/page";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { t } from "@/lib/i18n";
export const revalidate = 300;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}) {
  const {locale} = await params;
  if(!isLocale(locale)) return {robots:{index:false}};
  return dashboardMetadata(locale,"/trades",t(locale,"거래 내역"));
}
export default async function LocalizedPage({params,searchParams}:{
  params:Promise<{locale:string}>;searchParams:Promise<{ai?:string;symbol?:string;side?:string;from?:string;to?:string;page?:string}>;
}) {
  const {locale} = await params;
  if(!isLocale(locale)) notFound();
  return <TradesPage searchParams={searchParams}/>;
}
