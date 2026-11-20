import Link from "next/link";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { BottomNav, SideNav, StockSearch } from "./nav";
import { ThemeToggle } from "./theme-toggle";

export { BottomNav };

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="AI Invest Lab 홈">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">
        <ChartNoAxesColumnIncreasing size={18} strokeWidth={2.4} aria-hidden />
      </span>
      <span className="text-[17px] font-bold tracking-tight">AI Invest Lab</span>
    </Link>
  );
}

export function DemoBanner({ mode }: { mode: "live" | "demo" }) {
  if (mode !== "demo") return null;
  return (
    <div className="bg-warn text-black">
      <p className="px-4 py-1.5 text-center text-xs font-semibold">
        DEMO 모드 — 합성 시세와 규칙 기반 가짜 AI로 만든 시연 화면입니다. 실제 시장 데이터·실제 AI 성과가 아닙니다.
      </p>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-panel lg:block">
      <div className="sticky top-0 flex h-dvh flex-col px-4 py-5">
        <div className="mb-7 px-2"><Logo /></div>
        <SideNav />
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-muted">교육·연구용 모의투자 실험입니다. 실제 주문·투자 권유 없음.</p>
      </div>
    </aside>
  );
}

export function TopBar({ asOf, symbols }: { asOf: string; symbols: { symbol: string; name: string }[] }) {
  return (
    <>
    <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 lg:h-16 lg:px-6">
        <div className="lg:hidden"><Logo /></div>
        <div className="hidden max-w-xl flex-1 lg:block"><StockSearch symbols={symbols} /></div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-md bg-panel-2 px-2.5 py-1.5 text-xs text-muted sm:inline">데이터 기준일 {asOf || "—"}</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
    <div className="border-b border-line bg-panel px-4 py-3 lg:hidden"><StockSearch symbols={symbols} /></div>
    </>
  );
}

export function Footer() {
  return (
    <footer className="px-4 pb-28 pt-8 text-xs leading-relaxed text-muted lg:px-6 lg:pb-8">
      <p className="max-w-4xl">
        AI Invest Lab은 교육·연구 목적의 <b>모의투자</b> 실험입니다. 실제 매매 주문을 내지 않으며, 특정 종목의 매수·매도를 권유하지 않습니다.
        표시된 수익률은 가상 체결 규칙(다음 정규장 시가, 슬리피지·수수료 가정)에 따른 결과이며 실제 투자 성과와 다를 수 있습니다.
        과거 성과는 미래 수익을 보장하지 않습니다. AI 판단 이유는 모델이 생성한 텍스트로, 사실 확인을 거치지 않았습니다.
      </p>
    </footer>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="경로" className="mb-3 flex items-center gap-1.5 text-sm text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>›</span>}
          {it.href ? <Link href={it.href} className="hover:text-fg">{it.label}</Link> : <span className="text-fg">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
