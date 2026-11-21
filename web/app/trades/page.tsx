import Link from "next/link";
import { Section, TradeList } from "@/components/blocks";
import { PageTitle } from "@/components/shell";
import { getData } from "@/lib/data";
import { cn } from "@/lib/utils";
import { t,localizedHref } from "@/lib/i18n";

export const revalidate = 300;
export const metadata = { title: "Trade History" };

type SP = { ai?: string; symbol?: string; side?: string; from?: string; to?: string; page?: string };
const PAGE = 50;

export default async function TradesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const d = await getData();
  const ais = d.accounts.filter((a) => a.kind === "ai");
  const aiIds = new Set(ais.map((a) => a.id));
  let rows = d.trades.filter((t) => aiIds.has(t.accountId));
  if (sp.ai) rows = rows.filter((t) => d.accounts.find((a) => a.id === t.accountId)?.aiId === sp.ai);
  if (sp.symbol) { const sym = sp.symbol.toUpperCase(); rows = rows.filter((t) => t.symbol === sym); }
  if (sp.side === "BUY" || sp.side === "SELL") rows = rows.filter((t) => t.side === sp.side);
  if (sp.from) rows = rows.filter((t) => t.tradeDate >= sp.from!);
  if (sp.to) rows = rows.filter((t) => t.tradeDate <= sp.to!);
  rows.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id);
  const page = Math.max(1, Number(sp.page) || 1);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const q = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch, page: undefined, ...("page" in patch ? { page: patch.page } : {}) })
      .filter(([, v]) => v) as [string, string][]);
    return `${localizedHref(d.locale,"/trades")}${p.size ? `?${p}` : ""}`;
  };
  const symbols = Array.from(new Set(d.trades.map((t) => t.symbol))).sort();
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1.5 text-xs whitespace-nowrap",
    active ? "border-accent bg-accent/10 text-accent" : "border-line text-muted");

  return (
    <div className="space-y-4">
      <PageTitle title={t(d.locale,"거래 내역")} sub={t(d.locale,"모든 AI의 모의 체결 기록(최신순). 체결가는 다음 정규장 시가 + 슬리피지입니다.")} />
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Link href={q({ ai: undefined })} className={chip(!sp.ai)}>{t(d.locale,"전체 AI")}</Link>
          {ais.map((a) => <Link key={a.id} href={q({ ai: a.aiId! })} className={chip(sp.ai === a.aiId)}>{a.name}</Link>)}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Link href={q({ side: undefined })} className={chip(!sp.side)}>{t(d.locale,"매수·매도")}</Link>
          <Link href={q({ side: "BUY" })} className={chip(sp.side === "BUY")}>{t(d.locale,"매수")}</Link>
          <Link href={q({ side: "SELL" })} className={chip(sp.side === "SELL")}>{t(d.locale,"매도")}</Link>
        </div>
        <form className="flex flex-wrap items-center gap-2 text-xs" action={localizedHref(d.locale,"/trades")}>
          {sp.ai && <input type="hidden" name="ai" value={sp.ai} />}
          {sp.side && <input type="hidden" name="side" value={sp.side} />}
          <select name="symbol" defaultValue={sp.symbol ?? ""} className="h-9 rounded-md border border-line bg-panel px-2">
            <option value="">{t(d.locale,"전체 종목")}</option>
            {symbols.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input type="date" name="from" defaultValue={sp.from} className="h-9 rounded-md border border-line bg-panel px-2" aria-label={t(d.locale,"시작일")} />
          <input type="date" name="to" defaultValue={sp.to} className="h-9 rounded-md border border-line bg-panel px-2" aria-label={t(d.locale,"종료일")} />
          <button className="h-9 rounded-md bg-accent px-4 font-medium text-white">{t(d.locale,"적용")}</button>
          {(sp.symbol || sp.from || sp.to) && <Link href={q({ symbol: undefined, from: undefined, to: undefined })} className="text-muted underline">{t(d.locale,"초기화")}</Link>}
        </form>
      </div>
      <Section title={`${rows.length.toLocaleString()} ${t(d.locale,"건")}`}>
        <TradeList d={d} trades={shown} />
        <div className="mt-3 flex justify-between text-xs">
          {page > 1 ? <Link href={q({ page: String(page - 1) })} className="text-accent">← {t(d.locale,"이전")}</Link> : <span />}
          {page * PAGE < rows.length ? <Link href={q({ page: String(page + 1) })} className="text-accent">{t(d.locale,"다음")} →</Link> : <span />}
        </div>
      </Section>
    </div>
  );
}
