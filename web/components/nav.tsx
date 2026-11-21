"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { isNavActive } from "@/lib/nav-active";
import { NAV_GROUPS, activeNavGroup, type NavGroupId } from "@/lib/nav-groups";
import { t, localizedHref } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

const MENU_COPY={
  ko:{open:"전체 메뉴 열기",close:"전체 메뉴 닫기",navigation:"주 메뉴",sub:"하위 메뉴",theme:"화면 테마"},
  en:{open:"Open navigation",close:"Close navigation",navigation:"Main navigation",sub:"Submenu",theme:"Appearance"},
  zh:{open:"打开全部菜单",close:"关闭全部菜单",navigation:"主导航",sub:"子菜单",theme:"外观主题"},
  ja:{open:"メニューを開く",close:"メニューを閉じる",navigation:"メインメニュー",sub:"サブメニュー",theme:"画面テーマ"},
} as const;

/** The five desktop items and all their dropdown destinations share one data source. */
export function HeaderNav({locale}:{locale:Locale}) {
  const path=usePathname()??"";
  const [openId,setOpenId]=useState<NavGroupId|null>(null);
  const navRef=useRef<HTMLElement>(null);
  const selected=activeNavGroup(path,locale);
  useEffect(()=>setOpenId(null),[path,locale]);
  useEffect(()=>{
    function dismiss(event:PointerEvent){
      if(event.target instanceof Node&&!navRef.current?.contains(event.target))setOpenId(null);
    }
    function escape(event:KeyboardEvent){
      if(event.key==="Escape"&&openId){
        setOpenId(null);
        navRef.current?.querySelector<HTMLButtonElement>('[data-nav-trigger="'+openId+'"]')?.focus();
      }
    }
    document.addEventListener("pointerdown",dismiss);
    document.addEventListener("keydown",escape);
    return ()=>{
      document.removeEventListener("pointerdown",dismiss);
      document.removeEventListener("keydown",escape);
    };
  },[openId]);
  return <nav ref={navRef} aria-label={MENU_COPY[locale].navigation}
    data-header-nav="true" className="mx-auto max-w-[1640px] px-3 sm:px-4 lg:px-8">
    <ul className="flex items-center justify-center gap-2 py-2 xl:gap-4">
      {NAV_GROUPS.map(group=>{
        const chosen=selected===group.id,expanded=openId===group.id;
        const base=cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
          chosen?"bg-accent/10 text-accent":"text-fg hover:bg-panel-2 hover:text-accent",
        );
        return <li key={group.id} className="relative"
          data-top-nav-item={group.id} data-active-group={chosen?group.id:undefined}
          onMouseEnter={()=>{if(group.children.length)setOpenId(group.id);else setOpenId(null);}}
          onMouseLeave={()=>setOpenId(id=>id===group.id?null:id)}>
          {group.children.length===0?
            <Link href={localizedHref(locale,group.href)}
              aria-current={chosen?"page":undefined} className={base}>{group.names[locale]}</Link>
            :<>
              <button type="button" className={base} data-nav-trigger={group.id}
                aria-expanded={expanded} aria-controls={"top-nav-"+group.id}
                onClick={()=>setOpenId(group.id)}
                onKeyDown={e=>{
                  if(e.key==="ArrowDown"){
                    e.preventDefault();setOpenId(group.id);
                    requestAnimationFrame(()=>{
                      navRef.current?.querySelector<HTMLAnchorElement>('#top-nav-'+group.id+' a')?.focus();
                    });
                  }
                }}>
                {group.names[locale]}
                <ChevronDown size={15} aria-hidden className={cn("transition-transform",expanded&&"rotate-180")}/>
              </button>
              {expanded&&<ul id={"top-nav-"+group.id} aria-label={group.names[locale]+" · "+MENU_COPY[locale].sub}
                className="absolute left-1/2 top-full z-50 mt-2 w-[220px] -translate-x-1/2 space-y-1 rounded-2xl border border-line bg-panel p-2 shadow-xl"
                data-submenu={group.id}>
                {group.children.map(child=>{
                  const href=localizedHref(locale,child.href);
                  const childActive=isNavActive(path,href);
                  return <li key={child.href}><Link href={href}
                    onClick={()=>setOpenId(null)} aria-current={childActive?"page":undefined}
                    className={cn("block rounded-lg px-3 py-3 text-[13px] font-semibold transition-colors",
                      childActive?"bg-accent/10 text-accent":"text-fg hover:bg-panel-2")}>
                    {child.names[locale]}
                  </Link></li>;
                })}
              </ul>}
            </>}
        </li>;
      })}
    </ul>
  </nav>;
}

/** Mobile hamburger, with the same 5 groups and accessible accordion submenus.
 * A portal keeps the drawer outside the sticky header's backdrop-filter context.
 */
export function MobileMenu({locale}:{locale:Locale}) {
  const path=usePathname()??"";
  const current=activeNavGroup(path,locale);
  const [isOpen,setIsOpen]=useState(false);
  const [expanded,setExpanded]=useState<NavGroupId|null>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const sheetRef=useRef<HTMLElement>(null);
  const copy=MENU_COPY[locale];
  const dismiss=()=>setIsOpen(false);
  useEffect(()=>{setIsOpen(false);setExpanded(null);},[path,locale]);
  useEffect(()=>{
    if(!isOpen)return;
    const original=document.body.style.overflow;
    document.body.style.overflow="hidden";
    setExpanded(current);
    closeRef.current?.focus();
    function onKey(e:KeyboardEvent){
      if(e.key==="Escape"){e.preventDefault();dismiss();return;}
      if(e.key!=="Tab")return;
      const focusable=sheetRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),select:not([disabled])',
      );
      if(!focusable?.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
    document.addEventListener("keydown",onKey);
    return ()=>{
      document.body.style.overflow=original;
      document.removeEventListener("keydown",onKey);
      triggerRef.current?.focus();
    };
  },[isOpen,current]);
  return <>
    <button type="button" ref={triggerRef} onClick={()=>setIsOpen(true)}
      aria-label={copy.open} aria-expanded={isOpen} aria-haspopup="dialog"
      aria-controls={isOpen?"marketsights-mobile-navigation":undefined}
      data-mobile-menu-trigger="true"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 text-fg hover:text-accent">
      <Menu size={20} strokeWidth={1.9} aria-hidden/>
    </button>
    {isOpen&&createPortal(
      <div className="fixed inset-0 z-[100] lg:hidden" data-mobile-nav-overlay="true">
        <button type="button" className="absolute inset-0 w-full bg-[#081328]/65"
          tabIndex={-1} aria-label={copy.close} onClick={dismiss}/>
        <section ref={sheetRef} role="dialog" aria-modal="true" aria-label={copy.navigation}
          id="marketsights-mobile-navigation"
          className="absolute inset-y-0 right-0 flex w-[min(89vw,370px)] flex-col overflow-hidden border-l border-line bg-panel shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-4">
            <h2 className="text-lg font-extrabold">{copy.navigation}</h2>
            <button ref={closeRef} type="button" aria-label={copy.close} onClick={dismiss}
              className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-fg">
              <X size={20} aria-hidden/>
            </button>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label={copy.navigation}>
            <ul className="space-y-1.5" data-mobile-nav-groups="true">
              {NAV_GROUPS.map(group=>{
                const chosen=current===group.id;
                const isExpanded=expanded===group.id;
                return <li key={group.id} data-mobile-nav-group={group.id}>
                  {group.children.length===0?
                    <Link href={localizedHref(locale,group.href)}
                      onClick={dismiss} aria-current={chosen?"page":undefined}
                      className={cn("flex min-h-12 items-center rounded-xl px-3 text-sm font-bold",
                        chosen?"bg-accent/10 text-accent":"text-fg hover:bg-panel-2")}>
                      {group.names[locale]}
                    </Link>
                    :<>
                      <button type="button" aria-expanded={isExpanded}
                        aria-controls={"mobile-nav-"+group.id}
                        onClick={()=>setExpanded(g=>g===group.id?null:group.id)}
                        className={cn("flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-sm font-bold",
                          chosen?"bg-accent/10 text-accent":"text-fg hover:bg-panel-2")}>
                        {group.names[locale]}
                        <ChevronDown size={17} aria-hidden className={cn("transition-transform",isExpanded&&"rotate-180")}/>
                      </button>
                      {isExpanded&&<ul id={"mobile-nav-"+group.id}
                        className="mt-1 space-y-1 border-l-2 border-line py-1 pl-3"
                        data-mobile-submenu={group.id}>
                        {group.children.map(child=>{
                          const href=localizedHref(locale,child.href),selected=isNavActive(path,href);
                          return <li key={child.href}><Link href={href} onClick={dismiss}
                            aria-current={selected?"page":undefined}
                            className={cn("flex min-h-11 items-center rounded-lg px-3 text-[13px]",
                              selected?"bg-accent/10 font-bold text-accent":"text-fg hover:bg-panel-2")}>
                            {child.names[locale]}
                          </Link></li>;
                        })}
                      </ul>}
                    </>}
                </li>;
              })}
            </ul>
            <div className="mt-6 flex items-center justify-between rounded-xl border border-line bg-panel-2 px-3 py-2">
              <span className="text-xs font-semibold">{copy.theme}</span>
              <ThemeToggle locale={locale}/>
            </div>
          </nav>
        </section>
      </div>,document.body)}
  </>;
}

const SEARCH_COPY = {
  ko: {empty:"검색 가능한 종목이 아직 없습니다.",noMatch:"검색 결과가 없습니다.",hint:"종목명이나 티커로 찾기",close:"검색 닫기"},
  en: {empty:"No searchable stocks are available yet.",noMatch:"No matching stocks.",hint:"Search by company or ticker",close:"Close search"},
  zh: {empty:"暂无可搜索的股票。",noMatch:"没有匹配的股票。",hint:"按公司名称或代码搜索",close:"关闭搜索"},
  ja: {empty:"検索できる銘柄はまだありません。",noMatch:"該当する銘柄はありません。",hint:"社名またはティッカーで検索",close:"検索を閉じる"},
} as const;

export function StockSearch({ symbols, locale, onNavigate }: {
  symbols: {symbol:string;name:string}[]; locale:Locale; onNavigate?:()=>void;
}) {
  const router = useRouter();
  const [q,setQ] = useState("");
  const [showResults,setShowResults] = useState(false);
  const formRef=useRef<HTMLFormElement>(null);
  const listId=useId();
  const term=q.trim().toLocaleLowerCase();
  const matches=symbols.filter(s=>
    !term || s.symbol.toLowerCase().includes(term) || s.name.toLocaleLowerCase().includes(term)
  ).slice(0,6);
  const copy=SEARCH_COPY[locale];

  useEffect(()=>{
    function dismiss(e:PointerEvent){
      if(e.target instanceof Node && !formRef.current?.contains(e.target))setShowResults(false);
    }
    document.addEventListener("pointerdown",dismiss);
    return ()=>document.removeEventListener("pointerdown",dismiss);
  },[]);

  const navigate=(symbol:string)=>{
    router.push(localizedHref(locale,`/stocks/${symbol}`));
    setQ("");
    setShowResults(false);
    onNavigate?.();
  };
  return (
    <form ref={formRef} role="search" className="relative w-full"
      onSubmit={e=>{e.preventDefault();if(matches[0])navigate(matches[0].symbol);}}>
      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input type="search" autoComplete="off" value={q}
        onFocus={()=>setShowResults(true)}
        onChange={e=>{setQ(e.target.value);setShowResults(true);}}
        onKeyDown={e=>{if(e.key==="Escape"){setShowResults(false);e.currentTarget.blur();}}}
        role="combobox" aria-autocomplete="list" aria-expanded={showResults} aria-controls={listId}
        aria-label={t(locale,"종목 검색")} placeholder={copy.hint}
        className="h-11 w-full min-w-0 rounded-xl border border-line bg-panel pl-9 pr-3 text-base outline-none placeholder:text-muted focus:border-accent lg:text-sm" />
      {showResults && <div id={listId} role="listbox"
        className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[min(55dvh,340px)] overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-1.5 shadow-xl">
        {!symbols.length?<p className="px-3 py-4 text-sm text-muted">{copy.empty}</p>
        :!matches.length?<p className="px-3 py-4 text-sm text-muted">{copy.noMatch}</p>
        :matches.map(s=><button key={s.symbol} type="button" role="option" aria-selected={false}
          onClick={()=>navigate(s.symbol)}
          className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-panel-2 focus:bg-panel-2 focus:outline-none active:bg-panel-2">
          <span className="min-w-[54px] shrink-0 text-sm font-bold text-accent">{s.symbol}</span>
          <span className="min-w-0 truncate text-sm text-fg">{s.name}</span>
        </button>)}
      </div>}
    </form>
  );
}

/** Compact mobile search opens a full-width, touch-friendly suggestion panel. */
export function MobileSearch({symbols,locale}:{
  symbols:{symbol:string;name:string}[];locale:Locale
}){
  const path=usePathname();
  const [open,setOpen]=useState(false);
  const searchId=useId();
  useEffect(()=>setOpen(false),[path]);
  return <>
    <button type="button" onClick={()=>setOpen(value=>!value)}
      aria-expanded={open} aria-controls={searchId}
      aria-label={open?SEARCH_COPY[locale].close:t(locale,"종목 검색")}
      className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-muted hover:text-accent">
      {open?<X size={18} aria-hidden/>:<Search size={18} aria-hidden/>}
    </button>
    {open&&<div id={searchId} className="absolute inset-x-0 top-full z-50 border-b border-line bg-panel p-3 shadow-xl sm:p-4">
      <StockSearch symbols={symbols} locale={locale} onNavigate={()=>setOpen(false)}/>
    </div>}
  </>;
}
