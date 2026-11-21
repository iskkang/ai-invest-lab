import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/shell";
import { Section } from "@/components/blocks";
import { LOCALES, PUBLIC_SECTIONS, PUBLIC_COPY, isLocale, isPublicSection } from "@/lib/public-content";
import { dashboardMetadata } from "@/lib/seo";
import { localizedHref } from "@/lib/i18n";

export const revalidate=86400;
export function generateStaticParams() {
  return LOCALES.flatMap(locale=>PUBLIC_SECTIONS.map(section=>({locale,section})));
}
export async function generateMetadata({params}:{params:Promise<{locale:string;section:string}>}):Promise<Metadata> {
  const {locale,section}=await params;
  if(!isLocale(locale)||!isPublicSection(section))return {robots:{index:false}};
  return dashboardMetadata(locale,`/${section}`,PUBLIC_COPY[locale].nav[section]);
}
export default async function ResearchArticle({params}:{
  params:Promise<{locale:string;section:string}>
}) {
  const {locale,section}=await params;
  if(!isLocale(locale)||!isPublicSection(section))notFound();
  const copy = PUBLIC_COPY[locale];
  const items = section==="faq" ? copy.faq.map(x=>({heading:x.q,body:x.a}))
    : section==="methodology" ? copy.method : copy.privacy;
  const summary = section==="faq" ? copy.aboutFaq
    : section==="methodology" ? copy.aboutMethod : copy.aboutPrivacy;
  const schema = {
    "@context":"https://schema.org",
    "@type":section==="faq"?"FAQPage":"WebPage",
    inLanguage: locale==="zh"?"zh-CN":locale,
    headline:copy.nav[section],
    mainEntity:section==="faq"?copy.faq.map(({q,a})=>({
      "@type":"Question",name:q,acceptedAnswer:{"@type":"Answer",text:a}
    })):undefined,
  };
  return (
    <div className="space-y-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html:JSON.stringify(schema).replace(/</g,"\\u003c")
      }}/>
      <PageTitle title={copy.nav[section]} sub={summary}/>
      <div className="grid gap-4">
        {items.map((row,i)=>(
          <Section key={i} title={row.heading}>
            <p className="text-sm leading-7 text-muted">{row.body}</p>
          </Section>
        ))}
      </div>
      <p className="text-xs leading-6 text-muted">{copy.safety}</p>
      <Link href={localizedHref(locale,"/")} className="text-sm text-accent underline underline-offset-4">{copy.back}</Link>
    </div>
  );
}
