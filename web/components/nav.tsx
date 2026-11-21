"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { BarChart3, BriefcaseBusiness, GitCompareArrows, Info, LayoutDashboard, ListOrdered, Newspaper, History, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/nav-active";
import { t, localizedHref } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

export const NAV = [
  { href: "/", key: "대시보드", icon: LayoutDashboard },
  { href: "/consensus", key: "AI 비교", icon: GitCompareArrows },
  { href: "/historical", key: "과거 전략 연구", icon: History },
  { href: "/weekly", key: "주간 리포트", icon: Newspaper },
  { href: "/accuracy", key: "판단 검증", icon: ShieldCheck },
  { href: "/performance", key: "성과", icon: BarChart3 },
  { href: "/portfolio", key: "포트폴리오", icon: BriefcaseBusiness },
  { href: "/trades", key: "거래내역", icon: ListOrdered },
  { href: "/about", key: "소개", icon: Info },
] as const;
const MOBILE_NAV = NAV.filter(item =>
  ["/","/consensus","/historical","/weekly","/accuracy"].includes(item.href));

const active = (path: string, target: string) => isNavActive(path, target);

export function SideNav({ locale }: { locale: Locale }) {
  const path = usePathname();
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {NAV.map((item) => {
        const href = localizedHref(locale, item.href);
        return (
          <Link key={item.key} href={href}
            aria-current={active(path, href) ? "page" : undefined}
            className={cn("group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] transition-colors [&_svg]:shrink-0",
              active(path, href) ? "bg-white/10 font-bold text-[#d3fb91] ring-1 ring-inset ring-white/10" : "text-[#c4d1e8] hover:bg-white/[.07] hover:text-white")}>
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 shadow-[0_-10px_35px_rgba(16,26,55,.08)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Mobile navigation">
      <ul className="grid grid-cols-5 px-1">
        {MOBILE_NAV.map((item) => {
          const href = localizedHref(locale, item.href);
          return (
            <li key={item.key}>
              <Link href={href} aria-current={active(path, href) ? "page" : undefined}
                className={cn("relative flex min-h-[61px] flex-col items-center justify-center gap-1 px-0.5 text-[10px] tracking-tight transition-colors",
                  active(path, href) ? "font-bold text-accent before:absolute before:inset-x-3 before:top-0 before:h-[3px] before:rounded-b-full before:bg-accent" : "text-muted hover:text-fg")}>
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
  const listId=useId();
  const go = (value:string) => {
    const term = value.trim().toUpperCase();
    const match = symbols.find(s => s.symbol === term) ??
      symbols.find(s => s.name.toUpperCase().includes(term));
    if(match) {router.push(localizedHref(locale, `/stocks/${match.symbol}`));setQ("");}
  };
  return (
    <form role="search" className="relative w-full" onSubmit={e=>{e.preventDefault();go(q);}}>
      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input value={q} onChange={e=>setQ(e.target.value)} list={listId}
        aria-label={t(locale,"종목 검색")} placeholder={t(locale,"종목 코드 또는 회사명 (예: AAPL, Microsoft)")}
        className="h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent" />
      <datalist id={listId}>
        {symbols.map(s=><option key={s.symbol} value={s.symbol}>{s.name}</option>)}
      </datalist>
    </form>
  );
}


/** Compact mobile header. Search is shown on demand, instead of pushing the
 * leaderboard below a permanent second-row search box. */
export function MobileSearch({symbols,locale}:{
  symbols:{symbol:string;name:string}[];locale:Locale
}){
  const path=usePathname();
  const [open,setOpen]=useState(false);
  useEffect(()=>setOpen(false),[path]);
  return <>
    <button type="button" onClick={()=>setOpen(value=>!value)}
      aria-expanded={open} aria-label={t(locale,"종목 검색")}
      className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-panel-2 text-muted hover:text-accent">
      {open?<X size={18} aria-hidden/>:<Search size={18} aria-hidden/>}
    </button>
    {open&&<div className="absolute inset-x-0 top-full z-50 border-b border-line bg-panel p-4 shadow-xl">
      <StockSearch symbols={symbols} locale={locale}/>
    </div>}
  </>;
}
