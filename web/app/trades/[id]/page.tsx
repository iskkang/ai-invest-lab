import Link from "next/link";
import { notFound } from "next/navigation";
import { Dot, Section } from "@/components/blocks";
import { Badge } from "@/components/ui/badge";
import { getData } from "@/lib/data";
import { cn, fmtDateTimeNY, fmtNum, fmtUsd, sideLabel, toneClass } from "@/lib/utils";

export const revalidate = 300;

export default async function TradeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getData();
  const t = d.trades.find((x) => x.id === Number(id));
  if (!t) notFound();
  const a = d.accounts.find((x) => x.id === t.accountId)!;
  const dec = t.decisionId ? d.decisions.find((x) => x.id === t.decisionId) : undefined;
  const act = dec?.actions.find((x) => x.symbol === t.symbol && x.action === t.side);
  const round = dec ? d.rounds.find((r) => r.id === dec.roundId) : undefined;
  const rows: [string, React.ReactNode][] = [
    ["AI", <span key="a" className="flex items-center gap-2"><Dot color={a.color} />{a.name}</span>],
    ["판단 시각", fmtDateTimeNY(t.decisionAt)],
    ["모의 체결 시각", `${fmtDateTimeNY(t.executedAt)} (정규장 시가)`],
    ["판단에 사용한 데이터 기준일", t.dataAsOf ?? "— (벤치마크 규칙 매매)"],
    ["세션 시가(원자료)", fmtNum(t.refOpenPrice, 4)],
    ["체결가(슬리피지 반영)", fmtNum(t.price, 4)],
    ["수량", `${t.quantity}주`],
    ["체결금액", fmtUsd(t.gross, 2)],
    ["거래 비용(수수료)", fmtUsd(t.fee, 2)],
    ["현금 변동", <span key="c" className={toneClass(t.netCash)}>{fmtUsd(t.netCash, 2)}</span>],
    ["실현손익", t.realizedPnl === null ? "—" : <span key="r" className={toneClass(t.realizedPnl)}>{fmtUsd(t.realizedPnl, 2)}</span>],
    ["스냅샷 해시", round?.snapshotHash ? <code key="h" className="break-all text-[11px]">{round.snapshotHash}</code> : "—"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={t.side === "BUY" ? "up" : "down"} className="text-sm">{sideLabel(t.side)}</Badge>
        <h1 className="text-xl font-semibold"><Link href={`/stocks/${t.symbol}`} className="hover:underline">{t.symbol}</Link></h1>
        <span className="text-muted">{t.tradeDate}</span>
      </div>
      <Section title="체결 정보">
        <dl className="divide-y divide-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-muted">{k}</dt><dd className={cn("text-right tabular")}>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {act && (
        <Section title="투자 판단 근거 (AI 생성 텍스트)">
          <p className="text-sm leading-relaxed">{act.reason}</p>
          {act.risks.length > 0 && <p className="mt-2 text-sm text-muted">주요 위험: {act.risks.join(" · ")}</p>}
          {act.indicators_used.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{act.indicators_used.map((i) => <Badge key={i} variant="outline">{i}</Badge>)}</div>
          )}
          {dec?.summary && <p className="mt-3 border-t border-line pt-3 text-sm text-muted">회차 요약: {dec.summary}</p>}
        </Section>
      )}
    </div>
  );
}
