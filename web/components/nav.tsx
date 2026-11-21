"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, BriefcaseBusiness, GitCompareArrows, Info, LayoutDashboard, ListOrdered, Newspaper, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, localizedHref } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

export const NAV = [
  { href: "/", key: "대시보드", icon: LayoutDashboard },
  { href: "/consensus", key: "AI 비교", icon: GitCompareArrows },
  { href: "/weekly", key: "주간 리포트", icon: Newspaper },
  { href: "/accuracy", key: "판단 검증", icon: ShieldCheck },
  { href: "/performance", key: "성과", icon: BarChart3 },
  { href: "/portfolio", key: "포트폴리오", icon: BriefcaseBusiness },
  { href: "/trades", key: "거래내역", icon: ListOrdered },
  { href: "/about", key: "소개", icon: Info },
] as const;
const MOBILE_NAV = NAV.filter(item =>
  ["/","/consensus","/weekly","/accuracy","/portfolio"].includes(item.href));

const active = (path: string, target: string) =>
  target === path || (target !== "/" && path.startsWith(target + "/"));

export function SideNav({ locale }: { locale: Locale }) {
  const path = usePathname();
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {NAV.map((item) => {
        const href = localizedHref(locale, item.href);
        return (
          <Link key={item.key} href={href}
            aria-current={active(path, href) ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
              active(path, href) ? "bg-accent/10 font-semibold text-accent" : "text-fg/80 hover:bg-panel-2")}>
            <item.icon size={19} strokeWidth={1.8} aria-hidden />{t(locale, item.key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ locale }: { locale: Locale }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Mobile navigation">
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const href = localizedHref(locale, item.href);
          return (
            <li key={item.key}>
              <Link href={href} aria-current={active(path, href) ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px]",
                  active(path, href) ? "font-semibold text-accent" : "text-muted")}>
                <item.icon size={20} strokeWidth={1.8} aria-hidden />{t(locale, item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function StockSearch({ symbols, locale }: { symbols: {symbol:string;name:string}[];locale:Locale }) {
  const router = useRouter();
  const [q,setQ] = useState("");
  const go = (value:string) => {
    const term = value.trim().toUpperCase();
    const match = symbols.find(s => s.symbol === term) ??
      symbols.find(s => s.name.toUpperCase().includes(term));
    if(match) {router.push(localizedHref(locale, `/stocks/${match.symbol}`));setQ("");}
  };
  return (
    <form role="search" className="relative w-full" onSubmit={e=>{e.preventDefault();go(q);}}>
      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input value={q} onChange={e=>setQ(e.target.value)} list="ail-symbols"
        aria-label={t(locale,"종목 검색")} placeholder={t(locale,"종목 코드 또는 회사명 (예: AAPL, Microsoft)")}
        className="h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent" />
      <datalist id="ail-symbols">
        {symbols.map(s=><option key={s.symbol} value={s.symbol}>{s.name}</option>)}
      </datalist>
    </form>
  );
}
