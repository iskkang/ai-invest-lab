import { notFound } from "next/navigation";
import AboutPage from "@/app/about/page";
import { isLocale } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { t } from "@/lib/i18n";
export const revalidate = 300;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}) {
  const {locale} = await params;
  if(!isLocale(locale)) return {robots:{index:false}};
  return dashboardMetadata(locale,"/about",t(locale,"소개"));
}
export default async function LocalizedPage({params}:{
  params:Promise<{locale:string}>;
}) {
  const {locale} = await params;
  if(!isLocale(locale)) notFound();
  return <AboutPage/>;
}
