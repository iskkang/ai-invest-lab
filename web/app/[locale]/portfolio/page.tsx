import { notFound } from "next/navigation";
import PortfolioPage from "@/app/portfolio/page";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { t } from "@/lib/i18n";
export const revalidate = 300;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}) {
  const {locale} = await params;
  if(!isLocale(locale)) return {robots:{index:false}};
  return dashboardMetadata(locale,"/portfolio",t(locale,"포트폴리오"));
}
export default async function LocalizedPage({params}:{
  params:Promise<{locale:string}>;
}) {
  const {locale} = await params;
  if(!isLocale(locale)) notFound();
  return <PortfolioPage/>;
}
