import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Dashboard from "@/components/dashboard-view";
import {
  LOCALES, PUBLIC_COPY, isLocale, languageAlternates,
  localeUrl, publicOrigin,
} from "@/lib/public-content";

export const revalidate = 300;
export function generateStaticParams() { return LOCALES.map(locale => ({locale})); }

export async function generateMetadata({params}: {params: Promise<{locale: string}>}): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) return {robots:{index:false}};
  const c = PUBLIC_COPY[locale];
  return {
    metadataBase: new URL(publicOrigin()),
    title: {absolute: c.title},
    description: c.description,
    alternates: {canonical: localeUrl(locale), languages: languageAlternates()},
    openGraph: {title:c.title,description:c.description,url:localeUrl(locale),siteName:"LogicSight",type:"website"},
    robots: {index:true,follow:true},
  };
}

export default async function LocalizedDashboard({
  params,searchParams
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{sort?: string}>;
}) {
  const {locale} = await params;
  if(!isLocale(locale)) notFound();
  return <Dashboard searchParams={searchParams}/>;
}
