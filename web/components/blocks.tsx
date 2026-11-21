import Link from "next/link";
import type { CSSProperties } from "react";
import type { Account, Dataset, Decision, Stats, Trade } from "@/lib/types";
import { cn, fmtNum, fmtPct, fmtUsd, sideClass, sideLabel, toneClass } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, Td, Th } from "./ui/table";
import { Avatar } from "./ai-compare";
import { localizedHref, t as translate, localizedDecisionText } from "@/lib/i18n";

export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

export function rankAccounts(d: Dataset, key: "cum_return" | "sharpe" = "cum_return") {
  return d.accounts
    .filter((a) => a.kind === "ai")
    .map((a) => ({ a, s: d.stats[a.id] }))
    .sort((x, y) => (y.s?.[key] ?? -Infinity) - (x.s?.[key] ?? -Infinity));
}

/** 리더보드: 모바일은 카드, 데스크톱은 표 */
export function Leaderboard({ d, sortKey }: { d: Dataset; sortKey: "cum_return" | "sharpe" }) {
  const rows = rankAccounts(d, sortKey);
  const spy = d.accounts.find((a) => a.benchmarkCode === "SPY_BUY_HOLD");
  const spyRet = spy ? d.stats[spy.id]?.cum_return ?? null : null;
  return (
    <>
      <ol className="hidden">
        {rows.map(({ a, s }, i) => (
          <li key={a.id}>
            <Link href={localizedHref(d.locale, `/ai/${a.aiId}`)} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 active:bg-panel-2">
              <span className="w-5 text-center text-sm font-semibold text-muted">{i + 1}</span>
              <Dot color={a.color} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{a.name}</div>
                <div className="truncate text-[11px] text-muted">{a.model}</div>
              </div>
              <div className="text-right tabular">
                <div className={cn("text-base font-semibold", toneClass(s?.cum_return))}>{fmtPct(s?.cum_return)}</div>
                <div className="text-[11px] text-muted">{s ? fmtUsd(s.equity) : "—"}</div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <div>
        <Table>
          <thead>
            <tr>
              <Th>#</Th><Th>AI</Th><Th className="text-right">{translate(d.locale,"평가자산")}</Th><Th className="text-right">{translate(d.locale,"누적")}</Th>
              <Th className="text-right">{translate(d.locale,"SPY 대비")}</Th><Th className="text-right">{translate(d.locale,"일간")}</Th><Th className="text-right">{translate(d.locale,"MDD")}</Th>
              <Th className="text-right">{translate(d.locale,"샤프")}</Th><Th className="text-right">{translate(d.locale,"현금비중")}</Th><Th className="text-right">{translate(d.locale,"거래")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, s }, i) => (
              <tr key={a.id} className="hover:bg-panel-2/60">
                <Td className="text-muted">{i + 1}</Td>
                <Td>
                  <Link href={localizedHref(d.locale, `/ai/${a.aiId}`)} className="flex items-center gap-2 font-medium hover:underline">
                    <Dot color={a.color} />{a.name}<span className="text-xs font-normal text-muted">{a.model}</span>
                  </Link>
                </Td>
                <Td className="text-right">{s ? fmtUsd(s.equity) : "—"}</Td>
                <Td className={cn("text-right font-semibold", toneClass(s?.cum_return))}>{fmtPct(s?.cum_return)}</Td>
                <Td className={cn("text-right", toneClass(s && spyRet !== null ? s.cum_return - spyRet : null))}>
                  {s && spyRet !== null ? fmtPct(s.cum_return - spyRet) : "—"}
                </Td>
                <Td className={cn("text-right", toneClass(s?.daily_return))}>{fmtPct(s?.daily_return)}</Td>
                <Td className="text-right text-down">{fmtPct(s?.max_drawdown, 2, false)}</Td>
                <Td className="text-right" title={s?.notes?.join(", ")}>{s?.sharpe === null || s?.sharpe === undefined ? translate(d.locale,"표본부족") : fmtNum(s.sharpe)}</Td>
                <Td className="text-right">{fmtPct(s?.cash_weight, 1, false)}</Td>
                <Td className="text-right">{s?.trade_count ?? 0}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

export function StatGrid({ s, initial, locale = "ko" }: { s: Stats | undefined; initial: number; locale?: Dataset["locale"] }) {
  if (!s) return <p className="text-sm text-muted">{translate(locale,"아직 평가 기록이 없습니다.")}</p>;
  const items: [string, string, number | null | undefined][] = [
    [translate(locale,"최초 투자금"), fmtUsd(initial), null],
    [translate(locale,"현재 평가자산"), fmtUsd(s.equity), null],
    [translate(locale,"누적 수익률"), fmtPct(s.cum_return), s.cum_return],
    [translate(locale,"주간 / 월간"), `${fmtPct(s.weekly_return)} / ${fmtPct(s.monthly_return)}`, s.weekly_return],
    [translate(locale,"현금 비중"), fmtPct(s.cash_weight, 1, false), null],
    [translate(locale,"최대 낙폭(MDD)"), fmtPct(s.max_drawdown, 2, false), -1],
    [translate(locale,"변동성(연환산)"), s.volatility_ann === null ? translate(locale,"표본 부족") : fmtPct(s.volatility_ann, 1, false), null],
    [translate(locale,"샤프 비율"), s.sharpe === null ? translate(locale,"표본 부족") : fmtNum(s.sharpe), null],
    [translate(locale,"실현손익"), fmtUsd(s.realized_pnl, 2), s.realized_pnl],
    [translate(locale,"미실현손익"), fmtUsd(s.unrealized_pnl, 2), s.unrealized_pnl],
    [translate(locale,"거래 승률"), s.win_rate === null ? translate(locale,"표본 부족") : fmtPct(s.win_rate, 1, false), null],
    [translate(locale,"거래 횟수 / 보유 종목"), `${s.trade_count} / ${s.positions}`, null],
    [translate(locale,"최대 종목 비중"), fmtPct(s.max_position_weight, 1, false), null],
    [translate(locale,"집중도(HHI)"), fmtNum(s.hhi, 3), null],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-4">
      {items.map(([k, v, tone]) => (
        <div key={k} className="bg-panel p-3">
          <dt className="text-[11px] text-muted">{k}</dt>
          <dd className={cn("mt-0.5 text-sm font-semibold tabular", tone !== null && toneClass(tone))}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HoldingsTable({ d, account }: { d: Dataset; account: Account }) {
  const snap = d.snapshots.filter((s) => s.accountId === account.id).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!snap) return <p className="text-sm text-muted">{translate(d.locale,"보유 종목 없음")}</p>;
  const rows = snap.holdings.slice().sort((a, b) => b.marketValue - a.marketValue);
  return (
    <>
      {/* Phones need account positions without scrolling past seven narrow columns. */}
      <ul className="divide-y divide-line sm:hidden">
        {rows.map(h=><li key={h.symbol} className="py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link className="inline-flex min-h-11 items-center text-[15px] font-bold text-accent" href={localizedHref(d.locale,`/stocks/${h.symbol}`)}>{h.symbol}</Link>
              <p className="text-xs text-muted">{h.quantity} {translate(d.locale,"주")} · {translate(d.locale,"비중")} {fmtPct(h.marketValue / snap.equity,1,false)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[15px] font-bold tabular">{fmtUsd(h.marketValue)}</p>
              {!d.publicQuotesRedacted&&<p className={cn("mt-1 text-xs tabular",toneClass(h.unrealizedPnl))}>{fmtUsd(h.unrealizedPnl,2)}</p>}
            </div>
          </div>
        </li>)}
        <li className="flex min-h-14 items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-semibold">{translate(d.locale,"현금")}</p>
            <p className="text-xs text-muted">{translate(d.locale,"비중")} {fmtPct(snap.cash / snap.equity,1,false)}</p>
          </div>
          <p className="text-sm font-bold tabular">{fmtUsd(snap.cash)}</p>
        </li>
      </ul>
      <div className="hidden sm:block">
        <Table>
          <thead><tr><Th>{translate(d.locale,"종목")}</Th><Th className="text-right">{translate(d.locale,"수량")}</Th><Th className="text-right">{translate(d.locale,"평단")}</Th><Th className="text-right">{translate(d.locale,"종가")}</Th>
            <Th className="text-right">{translate(d.locale,"평가액")}</Th><Th className="text-right">{translate(d.locale,"비중")}</Th><Th className="text-right">{translate(d.locale,"미실현")}</Th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.symbol}>
                <Td><Link className="font-medium hover:underline" href={localizedHref(d.locale,`/stocks/${h.symbol}`)}>{h.symbol}</Link></Td>
                <Td className="text-right">{h.quantity}</Td>
                <Td className="text-right">{d.publicQuotesRedacted?"—":fmtNum(h.avgCost)}</Td>
                <Td className="text-right">{d.publicQuotesRedacted?"—":fmtNum(h.close)}</Td>
                <Td className="text-right">{fmtUsd(h.marketValue)}</Td>
                <Td className="text-right">{fmtPct(h.marketValue / snap.equity, 1, false)}</Td>
                <Td className={cn("text-right", toneClass(h.unrealizedPnl))}>{d.publicQuotesRedacted?"—":fmtUsd(h.unrealizedPnl, 2)}</Td>
              </tr>
            ))}
            <tr>
              <Td className="text-muted">{translate(d.locale,"현금")}</Td><Td /><Td /><Td />
              <Td className="text-right">{fmtUsd(snap.cash)}</Td>
              <Td className="text-right">{fmtPct(snap.cash / snap.equity, 1, false)}</Td><Td />
            </tr>
          </tbody>
        </Table>
      </div>
    </>
  );
}

/** 포트폴리오 구성 막대(비중) — 차트 라이브러리 없이 가볍게 */
export function AllocationBar({ d, account }: { d: Dataset; account: Account }) {
  const snap = d.snapshots.filter((s) => s.accountId === account.id).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!snap || snap.equity <= 0) return null;
  const parts = snap.holdings.slice().sort((a, b) => b.marketValue - a.marketValue)
    .map((h, i) => ({ k: h.symbol, w: h.marketValue / snap.equity, o: 1 - i * 0.07 }));
  parts.push({ k: "현금", w: snap.cash / snap.equity, o: 0 });
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-panel-2" role="img" aria-label={translate(d.locale,"포트폴리오 구성")}>
        {parts.map((p) => (
          <div key={p.k} style={{ width: `${p.w * 100}%`, background: p.k === "현금" ? "var(--line)" : account.color, opacity: p.k === "현금" ? 1 : Math.max(0.25, p.o) }} title={`${p.k} ${fmtPct(p.w, 1, false)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {parts.map((p) => <span key={p.k} className="tabular">{p.k==="현금"?translate(d.locale,"현금"):p.k} {fmtPct(p.w, 1, false)}</span>)}
      </div>
    </div>
  );
}

export function TradeList({ d, trades, compact = false }: { d: Dataset; trades: Trade[]; compact?: boolean }) {
  const tFn = (side: "BUY"|"SELL") => translate(d.locale, sideLabel(side));
  const acc = new Map(d.accounts.map((a) => [a.id, a]));
  if (!trades.length) return <p className="py-4 text-sm text-muted">{translate(d.locale,"거래 없음")}</p>;
  return (
    <ul className="divide-y divide-line">
      {trades.map((t) => {
        const a = acc.get(t.accountId)!;
        return (
          <li key={t.id}>
            <Link href={localizedHref(d.locale, `/trades/${t.id}`)} className="flex items-center gap-3 py-2.5 active:bg-panel-2">
              <Badge variant={t.side === "BUY" ? "up" : "down"} className="w-9 justify-center">{tFn(t.side)}</Badge>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{t.symbol}</span>
                  <span className="text-muted tabular">{t.quantity} {tFn("BUY")==="Buy"?"shares":translate(d.locale,"주")}{!d.publicQuotesRedacted&&<> @ {fmtNum(t.price)}</>}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted"><Dot color={a.color} />{a.name}{!compact && <> · {t.tradeDate}</>}</div>
              </div>
              <div className="text-right text-sm tabular">
                <div className={sideClass(t.side)}>{d.publicQuotesRedacted?"—":fmtUsd(Math.abs(t.netCash))}</div>
                {!d.publicQuotesRedacted && t.realizedPnl !== null && <div className={cn("text-[11px]", toneClass(t.realizedPnl))}>{fmtUsd(t.realizedPnl, 2)}</div>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DecisionCard({ d, dec }: { d: Dataset; dec: Decision }) {
  const a = d.accounts.find((x) => x.aiId === dec.aiId);
  const trades = dec.actions.filter((x) => x.action !== "HOLD");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Avatar name={a?.name ?? "?"} color={a?.color ?? "#888"} size={26} />{a?.name}<span className="text-xs font-normal text-muted">{dec.sessionDate} {translate(d.locale,"체결분")}</span></CardTitle>
        <Badge variant={dec.status === "valid" ? "muted" : "warn"}>{dec.status === "valid" ? `${translate(d.locale,"데이터")} ${dec.dataAsOf}` : translate(d.locale,"무효 응답")}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {dec.status !== "valid" ? <p className="text-warn">{dec.error}</p> : <p className="leading-relaxed">{localizedDecisionText(d.locale,dec.summary)}</p>}
        {trades.length > 0 && (
          <ul className="space-y-2">
            {trades.slice(0, 6).map((x) => (
              <li key={x.symbol} className="rounded-lg bg-panel-2 p-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant={x.action === "BUY" ? "up" : "down"}>{translate(d.locale,sideLabel(x.action))}</Badge>
                  <Link href={localizedHref(d.locale, `/stocks/${x.symbol}`)} className="font-semibold hover:underline">{x.symbol}</Link>
                  <span className="text-muted tabular">{x.quantity} {translate(d.locale,"주")}</span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-fg/90">{localizedDecisionText(d.locale,x.reason)}</p>
                {x.risks?.length > 0 && <p className="mt-1 text-[12px] text-muted">{translate(d.locale,"위험:")} {x.risks.map(text=>localizedDecisionText(d.locale,text)).join(" · ")}</p>}
              </li>
            ))}
            {trades.length > 6 && <li className="text-xs text-muted">{translate(d.locale,"외")} {trades.length - 6} {translate(d.locale,"건")}</li>}
          </ul>
        )}
        {trades.length === 0 && dec.status === "valid" && <p className="text-muted">{translate(d.locale,"이번 회차 매매 없음(보유 유지)")}</p>}
      </CardContent>
    </Card>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader><CardTitle>{title}</CardTitle>{action}</CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function RoundBadge({ status, reason, locale = "ko" }: { status: string; reason: string | null; locale?: Dataset["locale"] }) {
  const map: Record<string, [string, "muted" | "warn" | "up"]> = {
    settled: ["체결 완료", "muted"], decided: ["체결 대기", "up"], aborted: ["회차 보류", "warn"], skipped: ["건너뜀", "muted"],
  };
  const [label, v] = map[status] ?? [status, "muted"];
  return <Badge variant={v} title={reason ?? undefined}>{translate(locale,label)}{reason ? ` · ${reason.split(":")[0]}` : ""}</Badge>;
}


/** 참고 화면 스타일의 AI 성과 카드 (순위·수익률·핵심 위험지표) */
export function AiCards({ d, sortKey }: { d: Dataset; sortKey: "cum_return" | "sharpe" }) {
  const rows = rankAccounts(d, sortKey);
  const spy = d.accounts.find(a => a.benchmarkCode === "SPY_BUY_HOLD");
  const spyRet = spy ? d.stats[spy.id]?.cum_return ?? null : null;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"
    aria-label={translate(d.locale,"AI 투자 리더보드")}>
    {rows.map(({a,s},i)=><Link key={a.id}
      href={localizedHref(d.locale, "/ai/"+a.aiId)}
      className="ms-card ms-card-hover ms-rank-card block min-w-0 p-3.5 sm:p-4"
      style={{"--agent-color":a.color} as CSSProperties}>
      <div className="relative z-10 flex items-center gap-3">
        <Avatar name={a.name} color={a.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-extrabold tracking-tight">{a.name}</p>
          <p className="truncate text-[11px] text-muted">{a.model}</p>
        </div>
        <span className="grid h-8 min-w-8 place-items-center rounded-lg border border-line bg-panel-2 px-2 text-xs font-extrabold text-muted tabular"
          aria-label={s?(i+1)+" "+translate(d.locale,"위"):translate(d.locale,"표본부족")}>
          {s?String(i+1).padStart(2,"0"):"—"}
        </span>
      </div>
      <div className="relative z-10 mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mt-5">
        <div>
          <p className="text-[10px] font-bold tracking-[.12em] text-muted uppercase">{translate(d.locale,"평가자산")}</p>
          <p className="mt-1 text-[23px] font-extrabold leading-none tracking-tight tabular">{s?fmtUsd(s.equity):"—"}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold tracking-[.08em] text-muted">{translate(d.locale,"누적 수익률")}</p>
          <p className={cn("mt-1 text-xl font-extrabold leading-none tabular",toneClass(s?.cum_return))}>
            {fmtPct(s?.cum_return)}
          </p>
        </div>
      </div>
      <dl className="relative z-10 mt-3 grid grid-cols-4 gap-2 border-t border-line pt-3 sm:mt-5 sm:pt-4">
        <div><dt className="text-[10px] text-muted">{translate(d.locale,"SPY 대비")}</dt>
          <dd className={cn("mt-1 text-xs font-bold tabular",toneClass(s&&spyRet!==null?s.cum_return-spyRet:null))}>
            {s&&spyRet!==null?fmtPct(s.cum_return-spyRet,1):"—"}</dd></div>
        <div><dt className="text-[10px] text-muted">{translate(d.locale,"MDD")}</dt>
          <dd className="mt-1 text-xs font-bold tabular">{fmtPct(s?.max_drawdown,1,false)}</dd></div>
        <div><dt className="text-[10px] text-muted">{translate(d.locale,"샤프")}</dt>
          <dd className="mt-1 text-xs font-bold tabular">{s?.sharpe==null?translate(d.locale,"표본부족"):fmtNum(s.sharpe)}</dd></div>
        <div><dt className="text-[10px] text-muted">{translate(d.locale,"현금")}</dt>
          <dd className="mt-1 text-xs font-bold tabular">{fmtPct(s?.cash_weight,0,false)}</dd></div>
      </dl>
    </Link>)}
  </div>;
}
