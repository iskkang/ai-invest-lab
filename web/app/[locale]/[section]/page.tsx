import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import {
  LOCALES, PUBLIC_SECTIONS, PUBLIC_COPY, isLocale, isPublicSection,
  languageAlternates, localeUrl, publicOrigin, type Locale,
  type PublicSection
} from "@/lib/public-content";

export const revalidate = 86400;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => PUBLIC_SECTIONS.map((section) => ({ locale, section })));
}

function sectionContent(locale: Locale, section: PublicSection) {
  const c = PUBLIC_COPY[locale];
  const headline = c.nav[section];
  const description = section === "methodology" ? c.aboutMethod
    : section === "faq" ? c.aboutFaq
    : section === "privacy" ? c.aboutPrivacy
    : c.aboutAdvertise;
  return { c, headline, description };
}

export async function generateMetadata({
  params
}: { params: Promise<{ locale: string; section: string }> }): Promise<Metadata> {
  const { locale, section } = await params;
  if (!isLocale(locale) || !isPublicSection(section)) {
    return { robots: { index: false, follow: false } };
  }
  const { headline, description } = sectionContent(locale, section);
  return {
    metadataBase: new URL(publicOrigin()),
    title: { absolute: `${headline} | AI Invest Lab` },
    description,
    alternates: { canonical: localeUrl(locale, section), languages: languageAlternates(section) },
    openGraph: {
      title: `${headline} | AI Invest Lab`,
      description,
      url: localeUrl(locale, section),
      type: "article",
      siteName: "AI Invest Lab",
    },
    robots: { index: true, follow: true },
  };
}

export default async function EditorialPage({
  params
}: { params: Promise<{ locale: string; section: string }> }) {
  const { locale, section } = await params;
  if (!isLocale(locale) || !isPublicSection(section)) notFound();
  const { c, headline, description } = sectionContent(locale, section);
  const pieces = section === "methodology" ? c.method
    : section === "privacy" ? c.privacy
    : section === "advertise" ? c.advertise : [];
  const schema = {
    "@context": "https://schema.org",
    "@type": section === "faq" ? "FAQPage" : "WebPage",
    headline,
    description,
    inLanguage: locale === "zh" ? "zh-CN" : locale,
    url: localeUrl(locale, section),
    ...(section === "faq" ? {
      mainEntity: c.faq.map(({q,a}) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    } : {}),
  };
  return (
    <PublicShell locale={locale} current={section}>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <div className="max-w-4xl">
        <Link href={`/${locale}`} className="text-sm text-accent hover:underline">
          {c.back}
        </Link>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">{headline}</h1>
        <p className="mt-4 text-base leading-8 text-muted">{description}</p>
        <div className="mt-10 space-y-4">
          {section === "faq"
            ? c.faq.map(({q,a},index) => (
              <article key={q} className="rounded-xl border border-line bg-panel p-5 sm:p-7">
                <h2 className="text-lg font-semibold">{index + 1}. {q}</h2>
                <p className="mt-3 text-sm leading-8 text-muted">{a}</p>
              </article>
            ))
            : pieces.map(({heading,body}) => (
              <section key={heading} className="rounded-xl border border-line bg-panel p-5 sm:p-7">
                <h2 className="text-lg font-semibold">{heading}</h2>
                <p className="mt-3 text-sm leading-8 text-muted">{body}</p>
              </section>
            ))}
        </div>
        <p className="mt-9 border-t border-line pt-6 text-xs leading-7 text-muted">{c.safety}</p>
      </div>
    </PublicShell>
  );
}
