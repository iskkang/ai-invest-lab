import { notFound } from "next/navigation";
import PerformancePage from "@/app/performance/page";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { t } from "@/lib/i18n";
export const revalidate = 300;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}) {
  const {locale} = await params;
  if(!isLocale(locale)) return {robots:{index:false}};
  return dashboardMetadata(locale,"/performance",t(locale,"성과 비교"));
}
export default async function LocalizedPage({params}:{
  params:Promise<{locale:string}>;
}) {
  const {locale} = await params;
  if(!isLocale(locale)) notFound();
  return <PerformancePage/>;
}
