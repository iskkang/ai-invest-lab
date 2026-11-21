"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BottomNav, Footer, Sidebar, TopBar } from "@/components/shell";
import { isLocale, type Locale } from "@/lib/public-content";

/**
 * Next.js preserves app/layout.tsx between client-side route transitions.
 * The initial SSR locale MUST NOT be used forever for the header, dropdown,
 * sidebar or fixed bottom navigation: otherwise /zh -> /ja produces mixed UI.
 *
 * Derive one locale from the current URL and pass it to EVERY chrome component.
 * Browser language changes also force a full document navigation in
 * LanguageSwitcher, so the document <html lang> and RSC content always agree.
 */
export function AppShell({
  children, initialLocale, symbols, asOf,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  symbols: { symbol: string; name: string }[];
  asOf: string;
}) {
  const pathname = usePathname() ?? "";
  const segment = pathname.split("/")[1] ?? "";
  const locale: Locale = isLocale(segment) ? segment : initialLocale;

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  }, [locale]);

  return (
    <div className="flex" data-active-locale={locale} key={locale}>
      <Sidebar locale={locale} />
      <div className="min-w-0 flex-1">
        <TopBar locale={locale} asOf={asOf} symbols={symbols} />
        <main className="mx-auto max-w-[1580px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">{children}</main>
        <Footer locale={locale} />
      </div>
      <BottomNav locale={locale} />
    </div>
  );
}
