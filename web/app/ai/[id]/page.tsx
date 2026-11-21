import { notFound } from "next/navigation";
import { ReturnChart } from "@/components/charts";
import { AllocationBar, DecisionCard, Dot, HoldingsTable, Section, StatGrid, TradeList } from "@/components/blocks";
import { Badge } from "@/components/ui/badge";
import { accountByAi, getData } from "@/lib/data";
import { returnLines } from "@/lib/series";
import { cn, fmtPct, toneClass } from "@/lib/utils";
import { localizedHref,t,localizedDecisionText } from "@/lib/i18n";

export const revalidate = 300;

export function generateStaticParams() {
  return ["gpt","claude","gemini","deepseek"].map(id=>({id}));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getData();
  return { title: accountByAi(d, id)?.name ?? id };
}

export default async function AiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getData();
  const a = accountByAi(d, id);
  if (!a) notFound();
  const s = d.stats[a.id];
  const spy = d.accounts.find((x) => x.benchmarkCode === "SPY_BUY_HOLD");
  const spyRet = spy ? d.stats[spy.id]?.cum_return ?? null : null;
  const trades = d.trades.filter((t) => t.accountId === a.id);
  const rejected = d.rejected.filter((o) => o.accountId === a.id).slice(0, 10);
  const decisions = d.decisions.filter((x) => x.aiId === id).slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Dot color={a.color} />
        <h1 className="text-xl font-semibold">{a.name}</h1>
        <Badge variant="outline">{a.model}</Badge>
        <span className={cn("ml-auto text-2xl font-semibold tabular", toneClass(s?.cum_return))}>{fmtPct(s?.cum_return)}</span>
      </div>
      {spyRet !== null && s && (
        <p className="text-sm text-muted">{t(d.locale,"SPY 단순 보유 대비")} <b className={toneClass(s.cum_return - spyRet)}>{fmtPct(s.cum_return - spyRet)}</b></p>
      )}

      <StatGrid s={s} initial={a.initialCash} locale={d.locale} />

      <Section title={t(d.locale,"수익률: 벤치마크 대비")}>
        <ReturnChart height={260} lines={returnLines(d, { only: [a.id, ...(spy ? [spy.id] : [])] })} locale={d.locale} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t(d.locale,"보유 종목")}>
          <AllocationBar d={d} account={a} />
          <div className="mt-3"><HoldingsTable d={d} account={a} /></div>
        </Section>
        <Section title={t(d.locale,"거래 이력")}>
          <TradeList d={d} trades={trades.slice(0, 15)} />
        </Section>
      </div>

      {rejected.length > 0 && (
        <Section title={t(d.locale,"체결되지 않은 주문(사유 포함)")}>
          <ul className="divide-y divide-line text-sm">
            {rejected.map((o) => (
              <li key={o.id} className="flex flex-wrap gap-x-3 py-2">
                <span className="tabular text-muted">{o.sessionDate}</span>
                <span className="font-medium">{t(d.locale,o.side==="BUY"?"매수":"매도")} {o.symbol} {o.quantity} {t(d.locale,"주")}</span>
                <Badge variant="warn">{o.status}</Badge>
                <span className="text-muted">{localizedDecisionText(d.locale,o.reason)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">{t(d.locale,"최근 투자 판단")}</h2>
        <div className="grid gap-3 md:grid-cols-2">{decisions.map((x) => <DecisionCard key={x.id} d={d} dec={x} />)}</div>
      </div>
    </div>
  );
}
