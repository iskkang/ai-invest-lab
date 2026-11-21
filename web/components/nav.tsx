"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BarChart3, BriefcaseBusiness, GitCompareArrows, Info, LayoutDashboard, ListOrdered, Newspaper, History, Search, ShieldCheck, X, Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
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
// Four high-frequency destinations stay one tap away. Less frequent
// research/portfolio pages remain accessible through a real mobile sheet.
const MOBILE_NAV = NAV.filter(item =>
  ["/","/consensus","/historical","/weekly"].includes(item.href));
const MORE_NAV = NAV.filter(item=>!MOBILE_NAV.includes(item));
const MORE_LABEL={
  ko:{more:"더보기",all:"전체 메뉴",close:"메뉴 닫기"},
  en:{more:"More",all:"All pages",close:"Close menu"},
  zh:{more:"更多",all:"全部页面",close:"关闭菜单"},
  ja:{more:"その他",all:"すべてのメニュー",close:"メニューを閉じる"},
} as const;


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
  const [moreOpen,setMoreOpen] = useState(false);
  const sheetRef=useRef<HTMLDivElement>(null);
  const moreButtonRef=useRef<HTMLButtonElement>(null);
  const activeMore=MORE_NAV.some(item=>isNavActive(path,localizedHref(locale,item.href)));
  const copy=MORE_LABEL[locale];
  useEffect(()=>setMoreOpen(false),[path]);
  useEffect(()=>{
    if(!moreOpen)return;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const first=sheetRef.current?.querySelector<HTMLAnchorElement>("a");
    first?.focus();
    function onKey(e:KeyboardEvent){
      if(e.key==="Escape"){e.preventDefault();setMoreOpen(false);return;}
      if(e.key!=="Tab")return;
      const focusables=sheetRef.current?.querySelectorAll<HTMLElement>("a,button:not([disabled])");
      if(!focusables?.length)return;
      const first=focusables[0],last=focusables[focusables.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
    document.addEventListener("keydown",onKey);
    return ()=>{
      document.body.style.overflow=originalOverflow;
      document.removeEventListener("keydown",onKey);
      moreButtonRef.current?.focus();
    };
  },[moreOpen]);
  return <>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 shadow-[0_-10px_35px_rgba(16,26,55,.08)] backdrop-blur-xl lg:hidden"
      style={{paddingBottom:"env(safe-area-inset-bottom)"}} aria-label="Mobile navigation">
      <ul className="grid grid-cols-5 px-1">
        {MOBILE_NAV.map(item=>{
          const href=localizedHref(locale,item.href);
          return <li key={item.key}>
            <Link href={href} aria-current={isNavActive(path,href)?"page":undefined}
              className={cn("relative flex min-h-[61px] flex-col items-center justify-center gap-1 px-0.5 text-[10px] tracking-tight transition-colors",
                isNavActive(path,href)?"font-bold text-accent before:absolute before:inset-x-3 before:top-0 before:h-[3px] before:rounded-b-full before:bg-accent":"text-muted hover:text-fg")}>
              <item.icon size={20} strokeWidth={1.8} aria-hidden/>{t(locale,item.key)}
            </Link>
          </li>;
        })}
        <li>
          <button type="button" ref={moreButtonRef}
            aria-expanded={moreOpen} aria-haspopup="dialog"
            aria-controls={moreOpen?"marketsights-mobile-more-menu":undefined}
            onClick={()=>setMoreOpen(value=>!value)}
            className={cn("relative flex min-h-[61px] w-full flex-col items-center justify-center gap-1 px-0.5 text-[10px] tracking-tight",
              (activeMore||moreOpen)?"font-bold text-accent before:absolute before:inset-x-3 before:top-0 before:h-[3px] before:rounded-b-full before:bg-accent":"text-muted")}>
            <Ellipsis size={20} strokeWidth={1.8} aria-hidden/>
            {copy.more}
          </button>
        </li>
      </ul>
    </nav>
    {moreOpen&&<div className="fixed inset-0 z-40 lg:hidden">
      <button type="button" aria-label={copy.close}
        className="absolute inset-0 h-full w-full bg-[#081328]/60"
        onClick={()=>setMoreOpen(false)}/>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={copy.all}
        id="marketsights-mobile-more-menu"
        className="absolute inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] max-h-[min(66vh,480px)] overflow-y-auto rounded-2xl border border-line bg-panel p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{copy.all}</h2>
          <button type="button" aria-label={copy.close}
            className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-fg"
            onClick={()=>setMoreOpen(false)}>
            <X size={19} aria-hidden/>
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {MORE_NAV.map(item=>{
            const href=localizedHref(locale,item.href);
            return <li key={item.key}>
              <Link href={href} onClick={()=>setMoreOpen(false)}
                aria-current={isNavActive(path,href)?"page":undefined}
                className={cn("flex min-h-[62px] items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
                  isNavActive(path,href)?"border-accent/50 bg-accent/10 text-accent":"border-line bg-panel-2 text-fg")}>
                <item.icon size={18} className="shrink-0" aria-hidden/>
                <span>{t(locale,item.key)}</span>
              </Link>
            </li>;
          })}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2">
          <span className="text-xs font-semibold">
            {({ko:"화면 테마",en:"Appearance",zh:"外观主题",ja:"画面テーマ"} as Record<Locale,string>)[locale]}
          </span>
          <ThemeToggle locale={locale}/>
        </div>
      </div>
    </div>}
  </>;
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
      className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-muted hover:text-accent">
      {open?<X size={18} aria-hidden/>:<Search size={18} aria-hidden/>}
    </button>
    {open&&<div className="absolute inset-x-0 top-full z-50 border-b border-line bg-panel p-4 shadow-xl">
      <StockSearch symbols={symbols} locale={locale}/>
    </div>}
  </>;
}
