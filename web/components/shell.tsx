import Link from "next/link";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { BottomNav, SideNav, StockSearch } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { localizedHref, t } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

export { BottomNav };

export function Logo({locale="ko"}:{locale?:Locale}) {
  return (
    <Link href={localizedHref(locale,"/")} className="flex items-center gap-2.5" aria-label="AI Invest Lab home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">
        <ChartNoAxesColumnIncreasing size={18} strokeWidth={2.4} aria-hidden />
      </span>
      <span className="text-[17px] font-bold tracking-tight">AI Invest Lab</span>
    </Link>
  );
}

export function Sidebar({locale}:{locale:Locale}) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-panel lg:block">
      <div className="sticky top-0 flex h-dvh flex-col px-4 py-5">
        <div className="mb-7 px-2"><Logo locale={locale}/></div>
        <SideNav locale={locale}/>
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-muted">
          {({ko:"교육·연구용 모의투자 실험입니다. 실제 주문·투자 권유 없음.",
          en:"Educational paper trading only. No real orders or investment advice.",
          zh:"仅供教育研究的模拟投资，无真实订单或投资建议。",
          ja:"教育・研究用の模擬投資であり、実際の注文・投資助言ではありません。" } as Record<Locale,string>)[locale]}
        </p>
      </div>
    </aside>
  );
}

export function TopBar({asOf,symbols,locale}:{
  asOf:string;symbols:{symbol:string;name:string}[];locale:Locale
}) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4 lg:h-16 lg:px-6">
          <div className="lg:hidden"><Logo locale={locale}/></div>
          <div className="hidden max-w-xl flex-1 lg:block"><StockSearch symbols={symbols} locale={locale}/></div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden rounded-md bg-panel-2 px-2.5 py-1.5 text-xs text-muted sm:inline">
              {t(locale,"데이터 기준일")} {asOf || "—"}
            </span>
            <LanguageSwitcher locale={locale}/>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="border-b border-line bg-panel px-4 py-3 lg:hidden">
        <StockSearch symbols={symbols} locale={locale}/>
      </div>
    </>
  );
}

export function Footer({locale}:{locale:Locale}) {
  const disclaimers:Record<Locale,string>={
    ko:"AI Invest Lab은 교육·연구 목적의 모의투자 실험입니다. 실제 주식 주문을 실행하지 않으며 개인별 투자 권유가 아닙니다. 표시된 가상 체결 수익은 실제 투자 성과와 다를 수 있고 과거 성과는 미래 결과를 보장하지 않습니다.",
    en:"AI Invest Lab is an educational paper-trading experiment. It never places real stock orders or provides personalized investment advice. Simulated fills and returns may differ from actual trading results. Past outcomes do not predict future performance.",
    zh:"AI Invest Lab 是教育研究性质的模拟投资实验，不会下达真实证券订单，也不提供个性化投资建议。模拟成交与收益可能不同于实际交易结果，历史表现不代表未来收益。",
    ja:"AI Invest Labは教育・研究目的の模擬投資実験です。実際の発注や個別の投資助言は行いません。仮想約定とリターンは実際の運用成績とは異なり、過去の結果は将来を保証しません。",
  };
  return (
    <footer className="px-4 pb-28 pt-8 text-xs leading-relaxed text-muted lg:px-6 lg:pb-8">
      <p className="max-w-4xl">{disclaimers[locale]}</p>
      <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Research information">
        <Link href={localizedHref(locale,"/methodology")} className="hover:text-accent">{t(locale,"실험 방식")}</Link>
        <Link href={localizedHref(locale,"/faq")} className="hover:text-accent">FAQ</Link>
        <Link href={localizedHref(locale,"/privacy")} className="hover:text-accent">{locale==="ko"?"개인정보":locale==="en"?"Privacy":locale==="zh"?"隐私":"プライバシー"}</Link>
      </nav>
    </footer>
  );
}

export function PageTitle({title,sub}:{title:string;sub?:string}) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Breadcrumb({items}:{items:{href?:string;label:string}[]}) {
  return (
    <nav className="mb-3 flex items-center gap-1.5 text-sm text-muted">
      {items.map((it,i)=>(
        <span key={i} className="flex items-center gap-1.5">
          {i>0&&<span aria-hidden>›</span>}
          {it.href?<Link href={it.href} className="hover:text-accent">{it.label}</Link>:<span className="text-fg">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
