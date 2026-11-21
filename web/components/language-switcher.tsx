"use client";

import { usePathname, useRouter } from "next/navigation";
import { Globe2 } from "lucide-react";
import { LANG_LABELS, LOCALES, type Locale } from "@/lib/public-content";

export function LanguageSwitcher({locale}:{locale:Locale}) {
  const pathname = usePathname();
  const router = useRouter();
  const pathLocale = pathname.match(/^\/(en|zh|ko|ja)(?=\/|$)/)?.[1] ?? locale;
  const suffix = pathname.startsWith(`/${pathLocale}`) ? pathname.slice(pathLocale.length + 1) : "";
  const switchTo = (next:string) => {
    if (!LOCALES.includes(next as Locale)) return;
    router.push(`/${next}${suffix}`);
  };
  return (
    <label className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-muted"
      aria-label="Display language">
      <Globe2 size={15} aria-hidden/>
      <select className="max-w-[104px] cursor-pointer bg-transparent text-xs text-fg outline-none"
        aria-label="Language / 언어 / 语言 / 言語" value={locale} onChange={e=>switchTo(e.target.value)}>
        {LOCALES.map(code=><option key={code} value={code}>{LANG_LABELS[code]}</option>)}
      </select>
    </label>
  );
}
