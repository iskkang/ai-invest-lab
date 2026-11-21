"use client";

import { usePathname } from "next/navigation";
import { Globe2 } from "lucide-react";
import { LANG_LABELS, LOCALES, isLocale, type Locale } from "@/lib/public-content";

/**
 * Read the SELECTED value from the current URL, not a stale RootLayout prop.
 * Full-document navigation is intentional. Next.js keeps its root layout
 * mounted across router.push() locale changes, which previously mixed Chinese
 * shell labels with Japanese/English page content on mobile Safari.
 */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "";
  const segment = pathname.split("/")[1] ?? "";
  const activeLocale = isLocale(segment) ? segment : locale;
  const suffix = pathname.startsWith(`/${activeLocale}/`)
    ? pathname.slice(activeLocale.length + 1)
    : "";

  const switchTo = (next: string) => {
    if (!LOCALES.includes(next as Locale) || next === activeLocale) return;
    const target = `/${next}${suffix}${window.location.search}${window.location.hash}`;
    // Completely refresh root layout, its data cache, HTML language and menus.
    window.location.assign(target);
  };

  return (
    <label className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-1.5 py-1.5 text-xs text-muted sm:px-2" aria-label="Display language">
      <Globe2 size={15} className="hidden sm:block" aria-hidden />
      <select
        key={activeLocale}
        className="max-w-[68px] cursor-pointer bg-transparent text-[11px] text-fg outline-none sm:max-w-[104px] sm:text-xs"
        aria-label="Language / 언어 / 语言 / 言語"
        value={activeLocale}
        onChange={(e) => switchTo(e.target.value)}
      >
        {LOCALES.map((code) => <option key={code} value={code}>{LANG_LABELS[code]}</option>)}
      </select>
    </label>
  );
}
