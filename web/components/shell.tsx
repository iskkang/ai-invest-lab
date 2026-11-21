import Link from "next/link";
import { HeaderNav, MobileMenu, StockSearch, MobileSearch } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { localizedHref, t } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";
import { sectionLabel } from "@/lib/section-labels";
import { dataAsOfLabel } from "@/lib/home-display";

export function Logo({locale="ko"}:{locale?:Locale}) {
  return (
    <Link href={localizedHref(locale,"/")}
      className="group inline-flex items-center gap-2.5" aria-label="MarketSights home">
      <svg width="35" height="35" viewBox="0 0 35 35" fill="none" aria-hidden="true"
        className="shrink-0 drop-shadow-sm">
        <rect width="35" height="35" rx="11" fill="#333B91"/>
        <circle cx="17.5" cy="17.5" r="10.25" stroke="#B8C8FF" strokeOpacity=".6" strokeWidth="1.2"/>
        <circle cx="17.5" cy="17.5" r="5.75" stroke="#D2FB91" strokeWidth="1.6"/>
        <path d="M5.7 23.8l8.4-7.4 5.1 3.6 9.8-11" stroke="#D2FB91" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="28.9" cy="9.2" r="2.35" fill="#D2FB91"/>
      </svg>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] font-extrabold leading-[1.1] tracking-[-.045em] sm:text-[17px]">
          Market<span className="text-accent group-hover:opacity-75">Sights</span>
        </span>
        <span className="hidden whitespace-nowrap text-[8px] font-extrabold tracking-[.17em] text-muted sm:block">{" · "}{sectionLabel(locale,"brandTagline")}</span>
      </span>
    </Link>
  );
}

function DataAsOfStatus({ asOf, locale }: { asOf: string; locale: Locale }) {
  const status = dataAsOfLabel(asOf, locale);
  return (
    <span data-home-data-status="true"
      className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-lg bg-panel-2 px-2.5 py-1.5 text-xs text-muted">
      <span>{t(locale, "데이터 기준일")}</span>
      <strong className="font-semibold text-fg tabular">{status}</strong>
    </span>
  );
}

export function TopBar({asOf,symbols,locale}:{
  asOf:string;symbols:{symbol:string;name:string}[];locale:Locale
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[56px] max-w-[1640px] items-center gap-2 px-3 sm:min-h-[62px] sm:gap-4 sm:px-4 lg:min-h-[70px] lg:px-8">
        <div className="min-w-0 shrink-0"><Logo locale={locale}/></div>
        <div className="hidden w-full max-w-md min-w-0 flex-1 lg:block"><StockSearch symbols={symbols} locale={locale}/></div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="lg:hidden"><MobileSearch symbols={symbols} locale={locale}/></div>
          <div className="hidden items-center gap-3 sm:mr-2 sm:flex">
            <DataAsOfStatus asOf={asOf} locale={locale}/>
          </div>
          <LanguageSwitcher locale={locale}/>
          <span className="hidden lg:inline-flex"><ThemeToggle locale={locale}/></span>
          <div className="lg:hidden"><MobileMenu locale={locale}/></div>
        </div>
      </div>
      <div className="hidden border-t border-line/70 lg:block"><HeaderNav locale={locale}/></div>
      <div className="border-t border-line/70 px-3 py-1.5 sm:hidden" data-mobile-data-status="true">
        <DataAsOfStatus asOf={asOf} locale={locale}/>
      </div>
    </header>
  );
}

export function Footer({locale}:{locale:Locale}) {
  const disclaimers:Record<Locale,string>={
    ko:"MarketSights는 교육·연구 목적의 모의투자 실험입니다. 실제 주식 주문을 실행하지 않으며 개인별 투자 권유가 아닙니다. 표시된 가상 체결 수익은 실제 투자 성과와 다를 수 있고 과거 성과는 미래 결과를 보장하지 않습니다.",
    en:"MarketSights is an educational paper-trading experiment. It never places real stock orders or provides personalized investment advice. Simulated fills and returns may differ from actual trading results. Past outcomes do not predict future performance.",
    zh:"MarketSights 是教育研究性质的模拟投资实验，不会下达真实证券订单，也不提供个性化投资建议。模拟成交与收益可能不同于实际交易结果，历史表现不代表未来收益。",
    ja:"MarketSightsは教育・研究目的の模擬投資実験です。実際の発注や個別の投資助言は行いません。仮想約定とリターンは実際の運用成績とは異なり、過去の結果は将来を保証しません。",
  };
  return (
    <footer className="mx-auto mt-8 max-w-[1580px] px-4 pb-10 pt-9 text-xs leading-relaxed text-muted lg:px-8">
      <div className="ms-divider mb-5"/>
      <p className="mb-2 text-[11px] font-extrabold tracking-[.17em] text-fg">MARKETSIGHTS <span className="text-accent">/</span> {sectionLabel(locale,"researchTerminal")}</p>
      <p className="max-w-4xl">{disclaimers[locale]}</p>
      <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Research information">
        <Link href={localizedHref(locale,"/methodology")} className="hover:text-accent">{t(locale,"실험 방법")}</Link>
        <Link href={localizedHref(locale,"/weekly")} className="hover:text-accent">{t(locale,"주간 리포트")}</Link>
        <Link href={localizedHref(locale,"/accuracy")} className="hover:text-accent">{t(locale,"판단 검증")}</Link>
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
