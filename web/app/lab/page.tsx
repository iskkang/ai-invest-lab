import Link from "next/link";
import { ReturnChart } from "@/components/charts";
import { AiCards, DecisionCard, Dot, Leaderboard, RoundBadge, Section, TradeList } from "@/components/blocks";
import { UniverseRail } from "@/components/universe-rail";
import { Badge } from "@/components/ui/badge";
import { aiAccounts, benchmarkAccounts, getData, lastSessionDate } from "@/lib/data";
import { returnLines } from "@/lib/series";
import { cn, fmtPct, toneClass } from "@/lib/utils";

export const revalidate = 300;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await searchParams;
  const sortKey = sort === "sharpe" ? "sharpe" : "cum_return";
  const d = await getData();
  // A newly initialized real-data experiment has no performance results.
  // Never fabricate rankings from accounts with zero valuation snapshots.
  if (d.mode === "live" && d.snapshots.length === 0) {
    const round = d.rounds[0];
    const roundDecisions = round ? d.decisions.filter((x) => x.roundId === round.id) : [];
    const loadedSymbols = Object.values(d.prices).filter((bars) => bars.length > 0).length;
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI 모의투자 실험 — LIVE</h1>
          <p className="mt-1 text-sm text-muted">
            실제 시장 데이터 기반 가상 투자 실험 · 시작 거래일 {d.experiment.startSession}
          </p>
        </div>
        <Section title={round ? "첫 투자 회차 진행 중" : "첫 투자 회차 대기"}>
          <div className="space-y-2 text-sm leading-6">
            <p className="font-medium">
              {round
                ? "AI의 첫 투자 회차가 기록됐습니다. 포트폴리오 평가는 정규장 종가 확정 후 생성됩니다."
                : "실험과 초기 가상 계좌가 준비됐습니다. 아직 투자 판단이나 체결 기록은 없습니다."}
            </p>
            <p className="text-muted">
              초기 원금 ${d.experiment.initialCash.toLocaleString("en-US")} ·
              투자 대상 {d.universe.filter((u) => u.role === "investable").length}종목 ·
              시작일 {d.experiment.startSession} (NYSE)
            </p>
            <p className="text-muted">실제 과거 주가 준비: {loadedSymbols} / {d.universe.length}종목 · 아직 첫 평가 전입니다.</p>
            <p className="text-muted">실제 돈의 주문은 실행하지 않습니다. 첫 평가 전에는 수익률과 순위를 표시하지 않습니다.</p>
            {round && <RoundBadge status={round.status} reason={round.abortReason} />}
          </div>
        </Section>
        <Section title="참가 AI 및 초기 가상 계좌">
          <div className="grid gap-3 md:grid-cols-2">
            {aiAccounts(d).map((a) => (
              <div key={a.id} className="rounded-lg border border-line p-4">
                <div className="flex items-center gap-2 font-semibold"><Dot color={a.color}/>{a.name}</div>
                <p className="mt-1 text-xs text-muted">{a.model}</p>
                <p className="mt-3 font-semibold tabular">${a.initialCash.toLocaleString("en-US")}</p>
                <p className="mt-1 text-xs text-muted">최초 자금 · 평가 및 순위 집계 전</p>
              </div>
            ))}
          </div>
        </Section>
        {roundDecisions.length > 0 && (
          <Section title="실제 AI 투자 판단">
            <div className="grid gap-3 md:grid-cols-2">
              {roundDecisions.map((dec) => <DecisionCard key={dec.id} d={d} dec={dec} />)}
            </div>
          </Section>
        )}
      </div>
    );
  }
  const last = lastSessionDate(d);
  const todays = d.trades.filter((t) => t.tradeDate === last && d.accounts.find((a) => a.id === t.accountId)?.kind === "ai");
  const lastRound = d.rounds[0];
  const latestDecisions = lastRound ? d.decisions.filter((x) => x.roundId === lastRound.id) : [];
  const buys = todays.filter((t) => t.side === "BUY").length;
  const sells = todays.length - buys;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI 투자 리더보드</h1>
          <p className="mt-1 text-sm text-muted">
            같은 시장 데이터, 같은 규칙, 각자 ${d.experiment.initialCash.toLocaleString()}로 시작 · 시작일 {d.experiment.startSession}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line p-0.5 text-xs" role="tablist" aria-label="정렬 기준">
          <Link href="/lab?sort=return" className={cn("rounded-md px-2.5 py-1.5", sortKey === "cum_return" ? "bg-panel-2 text-fg" : "text-muted")}>누적 수익률</Link>
          <Link href="/lab?sort=sharpe" className={cn("rounded-md px-2.5 py-1.5", sortKey === "sharpe" ? "bg-panel-2 text-fg" : "text-muted")}>위험조정(샤프)</Link>
        </div>
      </div>

      <AiCards d={d} sortKey={sortKey} />

      <Section title="순위 상세" className="hidden md:block">
        <Leaderboard d={d} sortKey={sortKey} />
      </Section>

      <Section title="누적 수익률 추이" action={<span className="text-[11px] text-muted">점선 = 벤치마크</span>}>
        <div><ReturnChart lines={returnLines(d, { benchmarks: true })} /></div>
        <Legend d={d} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`최근 거래일 매매 (${last})`} action={<span className="text-xs text-muted tabular"><span className="text-up">매수 {buys}</span> · <span className="text-down">매도 {sells}</span></span>}>
          <TradeList d={d} trades={todays.slice(0, 12)} compact />
          {todays.length > 12 && <Link href="/trades" className="mt-2 block text-center text-xs text-accent">전체 보기</Link>}
        </Section>
        <Section title="벤치마크 비교">
          <ul className="divide-y divide-line">
            {[...benchmarkAccounts(d), ...aiAccounts(d)].map((a) => {
              const s = d.stats[a.id];
              return (
                <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                  <Dot color={a.color} /><span className="flex-1">{a.name}</span>
                  {a.kind === "benchmark" && <Badge variant="outline">기준</Badge>}
                  <span className={cn("w-20 text-right font-semibold tabular", toneClass(s?.cum_return))}>{fmtPct(s?.cum_return)}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">최근 투자 판단과 이유</h2>
          {lastRound && <RoundBadge status={lastRound.status} reason={lastRound.abortReason} />}
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

function Legend({ d }: { d: Awaited<ReturnType<typeof getData>> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {d.accounts.map((a) => (
        <span key={a.id} className="flex items-center gap-1.5"><Dot color={a.color} />{a.name}</span>
      ))}
    </div>
  );
}
