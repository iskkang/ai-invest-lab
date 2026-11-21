import Link from "next/link";
import { headers } from "next/headers";
import { isLocale, type Locale } from "@/lib/public-content";
import { ReturnChart } from "@/components/charts";
import { ChartLegend } from "@/components/chart-legend";
import { DashboardAdSlot } from "@/components/dashboard-ad-slot";
import { InsightTeasers } from "@/components/insight-panels";
import { DashboardHero } from "@/components/dashboard-hero";
import { DailyBriefing, TopConflicts, FollowupsPreview } from "@/components/retention-panels";
import { ReturnVisitPulse, DecisionRevisionPanel, PortfolioMovement, RoundJournalPanel } from "@/components/returning-panels";
import { verifiedDecisions } from "@/lib/insight-analytics";
import { MobileResearchShortcut } from "@/components/mobile-research-shortcut";
import { PatternLabTeaser } from "@/components/pattern-dashboard";
import { AiCards, DecisionCard, Dot, Leaderboard, RoundBadge, Section, TradeList } from "@/components/blocks";
import { UniverseRail } from "@/components/universe-rail";
import { Badge } from "@/components/ui/badge";
import { aiAccounts, benchmarkAccounts, getData, lastSessionDate } from "@/lib/data";
import { returnLines } from "@/lib/series";
import { cn, fmtPct, toneClass } from "@/lib/utils";
import { localizedHref, t } from "@/lib/i18n";
import { sectionLabel } from "@/lib/section-labels";

export const revalidate = 300;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await searchParams;
  const sortKey = sort === "sharpe" ? "sharpe" : "cum_return";
  let d: Awaited<ReturnType<typeof getData>>;
  try {
    d = await getData();
  } catch {
    // Locale is from trusted proxy path header even when Supabase is unavailable.
    const requested = (await headers()).get("x-ail-locale") ?? "ko";
    const locale: Locale = isLocale(requested) ? requested : "ko";
    // Never replace an unavailable live dataset with simulated demo performance.
    return (
      <section role="status" className="mx-auto my-12 max-w-2xl rounded-2xl border border-line bg-panel px-6 py-10 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t(locale,"데이터 연결 오류")}</p>
        <h1 className="text-xl font-bold">{t(locale,"투자 데이터 화면을 불러오지 못했습니다.")}</h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          {t(locale,"실제 실험 데이터가 연결되지 않았습니다. 확인되지 않은 투자 판단이나 임의의 수익률을 표시하지 않습니다.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={localizedHref(locale,"/historical")} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
            {({ko:"과거 시장 연구 보기",en:"Explore historical research",zh:"查看历史市场研究",ja:"過去の市場研究を見る"} as Record<Locale,string>)[locale]}
          </Link>
          <Link href={localizedHref(locale,"/methodology")} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold">
            {t(locale,"실험 방식")}
          </Link>
        </div>
      </section>
    );
  }
  const pending = d.mode === "live" && d.snapshots.length === 0;
  const last = lastSessionDate(d);
  const todays = d.trades.filter((t) => t.tradeDate === last && d.accounts.find((a) => a.id === t.accountId)?.kind === "ai");
  const lastRound = d.rounds.find(r => r.status === "decided" || r.status === "settled") ?? d.rounds[0];
  const latestDecisions = lastRound ? verifiedDecisions(d).filter(x => x.roundId === lastRound.id) : [];
  const buys = todays.filter((t) => t.side === "BUY").length;
  const sells = todays.length - buys;
  const initialCash = "$" + d.experiment.initialCash.toLocaleString("en-US");
  const startDate = d.experiment.startSession;
  const experimentIntro = ({
    ko: `AI 4개 모두 같은 시장 데이터와 투자 규칙을 사용하며, 각각 ${initialCash}로 시작합니다. 첫 거래일은 ${startDate}입니다.`,
    en: `All four AIs use the same market data and rules, each starting with ${initialCash}. First session: ${startDate}.`,
    zh: `四个 AI 使用相同的市场数据与规则，每个初始资金为 ${initialCash}。首个交易日：${startDate}。`,
    ja: `4つのAIが同じ市場情報とルールを使い、それぞれ ${initialCash} から開始します。初回取引日：${startDate}。`,
  } as const)[d.locale];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-5">
      <ReturnVisitPulse d={d} />
      <DailyBriefing d={d} compact />
      <PatternLabTeaser locale={d.locale}/>
      <DashboardHero d={d} />
      {pending && <MobileResearchShortcut locale={d.locale} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ms-kicker mb-2">{sectionLabel(d.locale,"performanceSeason")}</p>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{t(d.locale, "AI 투자 리더보드")}</h2>
          <p className="mt-1 text-sm text-muted">
            {experimentIntro}
          </p>
        </div>
        <div className="flex min-h-11 gap-1 rounded-lg border border-line p-1 text-xs" aria-label="Sort by performance">
          <Link href={`${localizedHref(d.locale, "/")}?sort=return`} className={cn("inline-flex min-h-10 items-center rounded-md px-2.5 py-1.5", sortKey === "cum_return" ? "bg-panel-2 text-fg" : "text-muted")}>{t(d.locale, "누적 수익률")}</Link>
          <Link href={`${localizedHref(d.locale, "/")}?sort=sharpe`} className={cn("inline-flex min-h-10 items-center rounded-md px-2.5 py-1.5", sortKey === "sharpe" ? "bg-panel-2 text-fg" : "text-muted")}>{t(d.locale, "위험 조정(샤프 지수)")}</Link>
        </div>
      </div>

      {pending && (
        <Section className="hidden sm:block" title={t(d.locale, "첫 투자 회차 대기")}>
          <p className="text-sm leading-7 text-muted">
            {t(d.locale, "실험과 초기 가상 계좌가 준비됐습니다. 아직 투자 판단이나 체결 기록은 없습니다.")}
            {" "}{t(d.locale, "실제 돈의 주문은 실행하지 않습니다. 첫 평가 전에는 수익률과 순위를 표시하지 않습니다.")}
          </p>
        </Section>
      )}
      <AiCards d={d} sortKey={sortKey} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PortfolioMovement d={d} compact />
        <DecisionRevisionPanel d={d} compact />
      </div>
      <TopConflicts d={d} compact />
      <FollowupsPreview d={d} />
      <RoundJournalPanel d={d} compact />

      <InsightTeasers d={d} />

      <Section title={t(d.locale,"순위 상세")} className="hidden md:block">
        <Leaderboard d={d} sortKey={sortKey} />
      </Section>

      <Section title={t(d.locale,"누적 수익률 추이")} action={<span className="text-[11px] text-muted">{t(d.locale, "점선 = 벤치마크")}</span>}>
        <div><ReturnChart lines={returnLines(d, { benchmarks: true })} locale={d.locale} /></div>
        <ChartLegend lines={returnLines(d, {benchmarks:true})} locale={d.locale}/>
      </Section>

      <DashboardAdSlot locale={d.locale} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`${t(d.locale, "최근 거래일 매매")} (${last || "—"})`} action={<span className="text-xs text-muted tabular"><span className="text-up">{t(d.locale, "매수")} {buys}</span> · <span className="text-down">{t(d.locale, "매도")} {sells}</span></span>}>
          <TradeList d={d} trades={todays.slice(0, 12)} compact />
          {todays.length > 12 && <Link href={localizedHref(d.locale, "/trades")} className="mt-2 block text-center text-xs text-accent">{t(d.locale, "전체 보기")}</Link>}
        </Section>
        <Section title={t(d.locale,"벤치마크 비교")}>
          <ul className="divide-y divide-line">
            {[...benchmarkAccounts(d), ...aiAccounts(d)].map((a) => {
              const s = d.stats[a.id];
              return (
                <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                  <Dot color={a.color} /><span className="flex-1">{a.name}</span>
                  {a.kind === "benchmark" && <Badge variant="outline">{t(d.locale, "기준")}</Badge>}
                  <span className={cn("w-20 text-right font-semibold tabular", toneClass(s?.cum_return))}>{fmtPct(s?.cum_return)}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t(d.locale, "최근 투자 판단과 이유")}</h2>
          {lastRound && <RoundBadge status={lastRound.status} reason={lastRound.abortReason} locale={d.locale} />}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {latestDecisions.map((dec) => <DecisionCard key={dec.id} d={d} dec={dec} />)}
        </div>
      </div>
    </div>
    <div className="hidden xl:block"><div className="sticky top-20"><UniverseRail d={d} /></div></div>
    </div>
  );
}

