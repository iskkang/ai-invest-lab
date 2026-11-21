"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, BriefcaseBusiness, Info, LayoutDashboard, ListOrdered, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/lab", label: "Dashboard", ko: "대시보드", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", ko: "포트폴리오", icon: BriefcaseBusiness },
  { href: "/trades", label: "Trade History", ko: "거래내역", icon: ListOrdered },
  { href: "/performance", label: "Performance", ko: "성과", icon: BarChart3 },
  { href: "/about", label: "About", ko: "소개", icon: Info },
];

const isActive = (path: string, href: string) => (href === "/lab" ? path === "/lab" : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="space-y-1" aria-label="주 메뉴">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href}
          className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
            isActive(path, n.href) ? "bg-accent/10 font-semibold text-accent" : "text-fg/80 hover:bg-panel-2")}>
          <n.icon size={19} strokeWidth={1.8} aria-hidden />{n.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur lg:hidden"
         style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="모바일 내비게이션">
      <ul className="grid grid-cols-5">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
              isActive(path, n.href) ? "font-semibold text-accent" : "text-muted")}>
              <n.icon size={20} strokeWidth={1.8} aria-hidden />{n.ko}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 투자 대상 종목 검색 — 페이지 이동만 하며 AI 를 호출하지 않는다 */
export function StockSearch({ symbols }: { symbols: { symbol: string; name: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (value: string) => {
    const v = value.trim().toUpperCase();
    const hit = symbols.find((s) => s.symbol === v) ?? symbols.find((s) => s.name.toUpperCase().includes(v));
    if (hit) { router.push(`/stocks/${hit.symbol}`); setQ(""); }
  };
  return (
    <form role="search" className="relative w-full" onSubmit={(e) => { e.preventDefault(); go(q); }}>
      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input value={q} onChange={(e) => setQ(e.target.value)} list="ail-symbols" aria-label="종목 검색"
        placeholder="종목 코드 또는 회사명 (예: AAPL, Microsoft)"
        className="h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent" />
      <datalist id="ail-symbols">
        {symbols.map((s) => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
      </datalist>
    </form>
  );
}
