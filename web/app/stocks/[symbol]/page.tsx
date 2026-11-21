import { notFound } from "next/navigation";
import { Activity, ArrowDownRight, ArrowUpDown, BarChart2, CalendarArrowUp, CalendarArrowDown, LineChart, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { AiCompare } from "@/components/ai-compare";
import { Section, TradeList } from "@/components/blocks";
import { Breadcrumb } from "@/components/shell";
import { StockChart } from "@/components/stock-chart";
import { UniverseRail } from "@/components/universe-rail";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getData } from "@/lib/data";
import { aiViews, indicatorStates, stockSummary, type Tone } from "@/lib/stock";
import { cn, fmtNum, fmtPct, toneClass } from "@/lib/utils";

export const revalidate = 300;

export async function generateStaticParams() {
  const d = await getData();
  return d.universe.map((u) => ({ symbol: u.symbol }));
}

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  return { title: (await params).symbol.toUpperCase() };
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <Badge variant={tone === "default" ? "default" : tone} className="px-2 py-1">{children}</Badge>;
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol.toUpperCase();
  const d = await getData();
  const info = d.universe.find((u) => u.symbol === symbol);
  const s = stockSummary(d, symbol);
  if (!info || !s) notFound();
  const st = indicatorStates(s);
  const views = aiViews(d, symbol);
  const bars = (d.prices[symbol] ?? []).map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
  const accounts = new Map(d.accounts.map((a) => [a.id, a]));
  const trades = d.trades.filter((t) => t.symbol === symbol && accounts.get(t.accountId)?.kind === "ai");
  const markers = trades.map((t) => { const a = accounts.get(t.accountId)!; return { time: t.tradeDate, side: t.side, color: a.color, ai: a.name }; });
  const up = s.change >= 0;

  const stats: { icon: React.ElementType; label: string; value: string }[] = [
    { icon: TrendingUp, label: "전일 종가", value: fmtNum(s.prevClose) },
    { icon: BarChart2, label: "시가", value: fmtNum(s.open) },
    { icon: ArrowUpDown, label: "일중 범위", value: `${fmtNum(s.low)} – ${fmtNum(s.high)}` },
    { icon: CalendarArrowUp, label: "52주 최고", value: fmtNum(s.hi52) },
    { icon: CalendarArrowDown, label: "52주 최저", value: fmtNum(s.lo52) },
    { icon: Activity, label: "거래량 (20일 평균 대비)", value: `${(s.volume / 1e6).toFixed(1)}M · ${fmtPct(s.volumeVsAvg, 0)}` },
  ];
  const indicators: { icon: React.ElementType; label: string; value: string; sub?: string; state: [string, Tone] }[] = [
    { icon: Waves, label: "RSI (14)", value: s.rsi === null ? "—" : s.rsi.toFixed(1), state: st.rsi },
    { icon: LineChart, label: "이동평균", value: s.ma20 === null ? "—" : fmtNum(s.ma20), sub: `MA20 · MA50 ${fmtNum(s.ma50)}`, state: st.ma },
    { icon: BarChart2, label: "변동성 (30일, 연환산)", value: fmtPct(s.vol30, 1, false), state: st.vol },
    { icon: ArrowDownRight, label: "최대 낙폭 (1년)", value: fmtPct(s.mdd, 1, false), state: st.mdd },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Breadcrumb items={[{ href: "/lab", label: "Dashboard" }, { label: symbol }]} />

        {/* 종목 헤더 */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-panel-2 text-sm font-bold" aria-hidden>{symbol.slice(0, 4)}</span>
            <div>
              <h1 className="text-2xl font-bold leading-tight">{symbol}</h1>
              <p className="text-muted">{info.name}</p>
              {info.sector && <Badge variant="muted" className="mt-1">{info.sector}</Badge>}
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-4xl font-bold tracking-tight tabular">${fmtNum(s.close)}</span>
              <span className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold tabular", up ? "bg-up/10 text-up" : "bg-down/10 text-down")}>
                {up ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{up ? "+" : ""}{fmtNum(s.change)} ({fmtPct(s.changePct)})
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">{s.date} 정규장 종가 기준 (뉴욕 16:00) · 출처 {d.mode === "demo" ? "DEMO 합성 데이터" : "NH투자증권 PLUG"}</p>
          </div>
          <dl className="flex gap-6 text-sm lg:ml-auto lg:border-l lg:border-line lg:pl-6">
            <div><dt className="text-xs text-muted">52주 범위</dt><dd className="font-semibold tabular">{fmtNum(s.lo52)} – {fmtNum(s.hi52)}</dd></div>
            <div className="border-l border-line pl-6"><dt className="text-xs text-muted">보유 AI</dt><dd className="font-semibold">{views.filter((v) => v.quantityHeld).length} / 4</dd></div>
          </dl>
        </div>

        {/* 주요 수치 카드 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
          {stats.map((x) => (
            <Card key={x.label} className="flex items-center gap-3 rounded-xl px-3 py-3">
              <x.icon size={20} className="shrink-0 text-accent" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-[11px] text-muted">{x.label}</p>
                <p className="truncate text-sm font-semibold tabular">{x.value}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* 차트 */}
        <Card className="p-4">
          <StockChart bars={bars} markers={markers} />
          <p className="mt-2 text-[11px] text-muted">
            가격은 기록된 분할을 반영한 조정 시계열입니다. ▲매수 ▼매도 · 색상 =
            {d.accounts.filter((a) => a.kind === "ai").map((a) => <span key={a.id} style={{ color: a.color }}> {a.name}</span>)}
          </p>
        </Card>

        {/* 지표 상태 카드 */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {indicators.map((x) => (
            <Card key={x.label} className="rounded-xl p-3">
              <div className="flex items-start gap-2">
                <x.icon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-muted">{x.label}</p>
                  <p className="text-xl font-bold tabular">{x.value}</p>
                  {x.sub && <p className="text-[11px] text-muted tabular">{x.sub}</p>}
                </div>
              </div>
              <div className="mt-1.5"><Pill tone={x.state[1]}>{x.state[0]}</Pill></div>
            </Card>
          ))}
        </div>
        <p className="-mt-2 text-[11px] text-muted">지표 상태는 기술적 상태를 설명하는 라벨이며 매수·매도 신호가 아닙니다.</p>

        <AiCompare views={views} symbol={symbol} />

        <Section title={`${symbol} AI 매매 기록`}>
          <TradeList d={d} trades={trades.slice(0, 20)} />
        </Section>
      </div>

      <div className="hidden xl:block">
        <div className="sticky top-20"><UniverseRail d={d} current={symbol} /></div>
      </div>
    </div>
  );
}
