import Link from "next/link";
import type { ReactNode } from "react";
import {
  LANG_LABELS, LOCALES, PUBLIC_COPY,
  type Locale, type PublicSection
} from "@/lib/public-content";

const SECTIONS: PublicSection[] = ["methodology", "faq", "advertise", "privacy"];

export function PublicShell({
  locale, current, children
}: { locale: Locale; current?: PublicSection; children: ReactNode }) {
  const c = PUBLIC_COPY[locale];
  const sponsorName = process.env.NEXT_PUBLIC_SPONSOR_NAME?.trim();
  const sponsorUrl = process.env.NEXT_PUBLIC_SPONSOR_URL?.trim();
  let sponsorHref: string | null = null;
  if (sponsorName && sponsorUrl) {
    try {
      const url = new URL(sponsorUrl);
      if (url.protocol === "https:") sponsorHref = url.toString();
    } catch { /* no invalid or insecure sponsor URL */ }
  }
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <Link href={`/${locale}`} className="mr-auto text-lg font-bold tracking-tight">
            AI Invest Lab
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Public research navigation">
            <Link href={`/${locale}`} className={!current ? "font-semibold text-accent" : "hover:text-accent"}>{c.nav.home}</Link>
            {SECTIONS.map((section) =>
              <Link href={`/${locale}/${section}`} key={section}
                aria-current={current === section ? "page" : undefined}
                className={current === section ? "font-semibold text-accent" : "hover:text-accent"}>
                {c.nav[section]}
              </Link>
            )}
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2 px-4 pb-3 sm:px-6" aria-label="Choose language">
          {LOCALES.map((lang) => (
            <Link
              key={lang}
              href={`/${lang}${current ? `/${current}` : ""}`}
              lang={lang === "zh" ? "zh-CN" : lang}
              hrefLang={lang === "zh" ? "zh-CN" : lang}
              aria-current={lang === locale ? "page" : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${lang === locale
                ? "border-accent bg-accent/10 font-semibold text-accent"
                : "border-line text-muted hover:border-accent hover:text-accent"}`}
            >{LANG_LABELS[lang]}</Link>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-9 sm:px-6 sm:py-14">
        {children}
        {sponsorHref && sponsorName && (
          <aside aria-label={c.sponsorLabel}
            className="mt-12 rounded-xl border border-line bg-panel p-5">
            <p className="text-xs uppercase tracking-widest text-muted">{c.sponsorLabel}</p>
            <p className="mt-2 text-sm">
              <a href={sponsorHref} target="_blank" rel="sponsored nofollow noopener noreferrer"
                className="underline decoration-accent underline-offset-4">{sponsorName}</a>
            </p>
          </aside>
        )}
      </main>
      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 py-7 text-xs text-muted sm:px-6">
          <p>{c.copyright}</p>
          <nav className="flex gap-4" aria-label="Site information">
            <Link className="hover:text-accent" href={`/${locale}/methodology`}>{c.nav.methodology}</Link>
            <Link className="hover:text-accent" href={`/${locale}/privacy`}>{c.nav.privacy}</Link>
            <Link className="hover:text-accent" href={`/${locale}/advertise`}>{c.nav.advertise}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
