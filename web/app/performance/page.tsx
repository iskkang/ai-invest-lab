import { ReturnChart } from "@/components/charts";
import { Dot, Section, RoundBadge } from "@/components/blocks";
import { PageTitle } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { getData } from "@/lib/data";
import { returnLines } from "@/lib/series";
import { cn, fmtNum, fmtPct, fmtUsd, toneClass } from "@/lib/utils";
import { t,localizedDecisionText } from "@/lib/i18n";

export const revalidate = 300;
export const metadata = { title: "Performance" };

export default async function PerformancePage() {
  const d = await getData();
  const rows = [...d.accounts].sort((a, b) => (d.stats[b.id]?.cum_return ?? -9) - (d.stats[a.id]?.cum_return ?? -9));
  const notes = Array.from(new Set(Object.values(d.stats).flatMap((s) => s.notes ?? [])));
  return (
    <div className="space-y-4">
      <PageTitle title={t(d.locale,"성과 비교")} sub={t(d.locale,"AI 4개와 벤치마크 3개를 같은 시작일·같은 평가 규칙으로 비교합니다. 모두 실험 시작 이후 누적된 모의투자 결과입니다(과거 데이터 백테스트 아님).")} />
      <Section title={t(d.locale,"누적 수익률")}>
        <div><ReturnChart lines={returnLines(d, { benchmarks: true })} locale={d.locale} /></div>
      </Section>
      <Section title={t(d.locale,"위험·성과 지표")}>
        <Table>
          <thead><tr>
            <Th>{t(d.locale,"참가자")}</Th><Th className="text-right">{t(d.locale,"평가자산")}</Th><Th className="text-right">{t(d.locale,"누적")}</Th><Th className="text-right">{t(d.locale,"일간")}</Th>
            <Th className="text-right">{t(d.locale,"주간")}</Th><Th className="text-right">{t(d.locale,"월간")}</Th><Th className="text-right">{t(d.locale,"MDD")}</Th><Th className="text-right">{t(d.locale,"변동성")}</Th>
            <Th className="text-right">{t(d.locale,"샤프")}</Th><Th className="text-right">{t(d.locale,"실현손익")}</Th><Th className="text-right">{t(d.locale,"미실현")}</Th>
            <Th className="text-right">{t(d.locale,"승률")}</Th><Th className="text-right">{t(d.locale,"거래")}</Th><Th className="text-right">{t(d.locale,"최대비중")}</Th><Th className="text-right">HHI</Th>
          </tr></thead>
          <tbody>
            {rows.map((a) => {
              const s = d.stats[a.id];
              return (
                <tr key={a.id}>
                  <Td><span className="flex items-center gap-2"><Dot color={a.color} />{a.name}{a.kind === "benchmark" && <Badge variant="outline">{t(d.locale,"기준")}</Badge>}</span></Td>
                  <Td className="text-right">{s ? fmtUsd(s.equity) : "—"}</Td>
                  <Td className={cn("text-right font-semibold", toneClass(s?.cum_return))}>{fmtPct(s?.cum_return)}</Td>
                  <Td className={cn("text-right", toneClass(s?.daily_return))}>{fmtPct(s?.daily_return)}</Td>
                  <Td className={cn("text-right", toneClass(s?.weekly_return))}>{fmtPct(s?.weekly_return)}</Td>
                  <Td className={cn("text-right", toneClass(s?.monthly_return))}>{fmtPct(s?.monthly_return)}</Td>
                  <Td className="text-right">{fmtPct(s?.max_drawdown, 2, false)}</Td>
                  <Td className="text-right">{s?.volatility_ann == null ? t(d.locale,"표본부족") : fmtPct(s.volatility_ann, 1, false)}</Td>
                  <Td className="text-right">{s?.sharpe == null ? "—" : fmtNum(s.sharpe)}</Td>
                  <Td className={cn("text-right", toneClass(s?.realized_pnl))}>{s ? fmtUsd(s.realized_pnl) : "—"}</Td>
                  <Td className={cn("text-right", toneClass(s?.unrealized_pnl))}>{s ? fmtUsd(s.unrealized_pnl) : "—"}</Td>
                  <Td className="text-right">{s?.win_rate == null ? "—" : fmtPct(s.win_rate, 0, false)}</Td>
                  <Td className="text-right">{s?.trade_count ?? 0}</Td>
                  <Td className="text-right">{fmtPct(s?.max_position_weight, 1, false)}</Td>
                  <Td className="text-right">{s ? fmtNum(s.hhi, 3) : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <ul className="mt-3 space-y-0.5 text-[11px] text-muted">
          <li>{({ko:"샤프 비율: 일간 수익률 60개 이상일 때만 계산(무위험수익률 0 가정, 연환산). 변동성: 20개 이상.",en:"Sharpe ratio requires 60 daily observations (zero risk-free rate, annualized); volatility requires 20.",zh:"夏普比率至少需要60个日收益样本（无风险利率按0计算、年化）；波动率至少需要20个。",ja:"シャープレシオは日次60観測以上（無リスク金利0、年率換算）、変動率は20以上が必要です。"} as const)[d.locale]}</li>
          <li>{({ko:"승률: 매도 체결 5건 이상일 때만 계산. 최대비중은 가격 변동으로 20%를 넘을 수 있습니다(신규 매수 시에만 20% 제한).",en:"Win rate requires at least 5 simulated sells. Position weights may exceed 20% after price moves (limit applies to new buys).",zh:"胜率至少需要5笔模拟卖出。因市场变化持仓可能超过20%（限制仅针对新买入）。",ja:"勝率は模擬売却5件以上で算出。価格変動により保有比率が20%を超える場合があります（新規買付時に制限）。"} as const)[d.locale]}</li>
          {notes.slice(0, 4).map((n) => <li key={n}>{localizedDecisionText(d.locale,n)}</li>)}
        </ul>
      </Section>
      <Section title={t(d.locale,"회차 기록")}>
        <Table>
          <thead><tr><Th>{t(d.locale,"체결 세션")}</Th><Th>{t(d.locale,"데이터 기준일")}</Th><Th>{t(d.locale,"상태")}</Th><Th>{t(d.locale,"스냅샷 해시")}</Th></tr></thead>
          <tbody>
            {d.rounds.slice(0, 20).map((r) => (
              <tr key={r.id}>
                <Td>{r.sessionDate}</Td><Td>{r.dataAsOf}</Td>
                <Td><RoundBadge status={r.status} reason={r.abortReason} locale={d.locale}/></Td>
                <Td><code className="text-[11px] text-muted">{r.snapshotHash?.slice(0, 16) ?? "—"}…</code></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  );
}
