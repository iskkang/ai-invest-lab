import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import {
  LOCALES, PUBLIC_COPY, isLocale, languageAlternates,
  localeUrl, publicOrigin, type Locale
} from "@/lib/public-content";

export const revalidate = 86400;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: pathLocale } = await params;
  if (!isLocale(pathLocale)) return { robots: { index: false, follow: false } };
  const locale: Locale = pathLocale;
  const c = PUBLIC_COPY[locale];
  return {
    metadataBase: new URL(publicOrigin()),
    title: { absolute: c.title },
    description: c.description,
    alternates: {
      canonical: localeUrl(locale),
      languages: languageAlternates(),
    },
    openGraph: {
      title: c.title,
      description: c.description,
      type: "website",
      url: localeUrl(locale),
      locale: locale === "zh" ? "zh_CN" : locale === "ko" ? "ko_KR" : locale === "ja" ? "ja_JP" : "en_US",
      siteName: "AI Invest Lab",
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicHome({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const c = PUBLIC_COPY[locale];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AI Invest Lab",
    url: localeUrl(locale),
    inLanguage: locale === "zh" ? "zh-CN" : locale,
    description: c.description,
    publisher: { "@type": "Organization", name: "AI Invest Lab", url: publicOrigin() },
  };

  return (
    <PublicShell locale={locale}>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-accent">{c.tagline}</p>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{c.hero}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-muted sm:text-lg">{c.heroSub}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href={`/${locale}/methodology`}
            className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
            {c.actionLearn}
          </Link>
          <Link href="/" rel="nofollow"
            className="rounded-lg border border-line px-5 py-3 text-sm font-medium hover:border-accent">
            {c.actionDashboard}
          </Link>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted">{c.safety}</p>
      </section>

      <section className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Experiment design">
        {c.metrics.map(([title, sub]) => (
          <div key={title} className="rounded-xl border border-line bg-panel p-5">
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-muted">{sub}</p>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold">{c.why}</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-muted">{c.whyBody}</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {c.features.map((f) => (
            <article key={f.heading} className="rounded-xl border border-line bg-panel p-6">
              <h3 className="text-base font-semibold">{f.heading}</h3>
              <p className="mt-3 text-sm leading-7 text-muted">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-line bg-panel p-6">
        <h2 className="text-xl font-bold">{c.current}</h2>
        <p className="mt-3 text-sm leading-7 text-muted">{c.currentBody}</p>
      </section>

      <nav className="mt-10 flex flex-wrap gap-5 text-sm" aria-label="Related resources">
        <Link href={`/${locale}/methodology`} className="font-semibold text-accent underline underline-offset-4">{c.nav.methodology}</Link>
        <Link href={`/${locale}/faq`} className="font-semibold text-accent underline underline-offset-4">{c.nav.faq}</Link>
        <Link href={`/${locale}/advertise`} className="font-semibold text-accent underline underline-offset-4">{c.nav.advertise}</Link>
      </nav>
      <p className="mt-10 border-t border-line pt-6 text-xs leading-6 text-muted">{c.footnote}</p>
    </PublicShell>
  );
}
