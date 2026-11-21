import Link from "next/link";
import { AllocationBar, Dot, HoldingsTable, Section } from "@/components/blocks";
import { aiAccounts, getData } from "@/lib/data";
import { PageTitle } from "@/components/shell";
import { cn, fmtPct, fmtUsd, toneClass } from "@/lib/utils";
import { localizedHref, t } from "@/lib/i18n";

export const revalidate = 300;
export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const d = await getData();
  return (
    <div className="space-y-4">
      <PageTitle title={t(d.locale,"포트폴리오")} sub={t(d.locale,"각 AI의 현재 보유 종목과 현금 (최근 거래일 종가 기준)")} />
      <div className="grid gap-4 lg:grid-cols-2">
        {aiAccounts(d).map((a) => {
          const s = d.stats[a.id];
          return (
            <Section key={a.id} title={a.name}
              action={<Link href={localizedHref(d.locale, `/ai/${a.aiId}`)} className="flex items-center gap-2 text-xs text-muted hover:text-fg">
                <Dot color={a.color} /><span className="tabular">{s ? fmtUsd(s.equity) : "—"}</span>
                <span className={cn("tabular font-semibold", toneClass(s?.cum_return))}>{fmtPct(s?.cum_return)}</span></Link>}>
              <AllocationBar d={d} account={a} />
              <div className="mt-3"><HoldingsTable d={d} account={a} /></div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
