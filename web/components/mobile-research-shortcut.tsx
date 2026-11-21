import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import { localizedHref } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

/** Meaningful mobile next action while official AI runs have no observations.
 * Never fabricates metrics or historical AI decisions. */
const COPY={
  ko:{eyebrow:"지금 볼 수 있는 분석",title:"과거 시장 전략 비교",
    detail:"실제 주가를 바탕으로 3개 고정 가중치 전략과 SPY를 비교합니다.",action:"분석 열기"},
  en:{eyebrow:"Explore now",title:"Historical strategy comparison",
    detail:"Compare three fixed-rule studies with SPY using verified historical data.",action:"View study"},
  zh:{eyebrow:"现在可查看",title:"历史策略对比",
    detail:"使用真实历史价格对比三种固定规则与 SPY。",action:"打开研究"},
  ja:{eyebrow:"今すぐ確認",title:"過去の戦略比較",
    detail:"実際の過去価格で3つの固定ルールとSPYを比較します。",action:"研究を見る"},
} as const;

export function MobileResearchShortcut({locale}:{locale:Locale}){
  const c=COPY[locale];
  return <Link href={localizedHref(locale,"/historical")}
    className="flex min-h-[104px] items-center gap-3 rounded-2xl border border-accent/25 bg-accent/[.055] px-4 py-3.5 transition active:bg-accent/10 sm:hidden">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white">
      <ChartNoAxesCombined size={21} strokeWidth={1.9} aria-hidden/>
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] font-bold tracking-[.12em] text-accent">{c.eyebrow}</span>
      <span className="mt-1 block text-[14px] font-bold">{c.title}</span>
      <span className="mt-1 block text-[11px] leading-4 text-muted">{c.detail}</span>
    </span>
    <span className="grid h-11 w-7 shrink-0 place-items-center text-accent" aria-label={c.action}>
      <ArrowUpRight size={19} aria-hidden/>
    </span>
  </Link>;
}
