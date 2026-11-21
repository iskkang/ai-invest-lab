import Link from "next/link";
import { notFound } from "next/navigation";
import { Dot, Section } from "@/components/blocks";
import { Badge } from "@/components/ui/badge";
import { getData } from "@/lib/data";
import { localizedHref,t } from "@/lib/i18n";
import { cn, fmtDateTimeNY, fmtNum, fmtUsd, sideLabel, toneClass } from "@/lib/utils";

export const revalidate=300;

export default async function TradeDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const d=await getData();
  const trade=d.trades.find(tr=>tr.id===Number(id));
  if(!trade)notFound();
  const a=d.accounts.find(x=>x.id===trade.accountId)!;
  const dec=trade.decisionId?d.decisions.find(x=>x.id===trade.decisionId):undefined;
  const action=dec?.actions.find(x=>x.symbol===trade.symbol&&x.action===trade.side);
  const round=dec?d.rounds.find(r=>r.id===dec.roundId):undefined;
  const lang=d.locale;
  const labels = {
    time:lang==="ko"?"모의 체결 시각":lang==="en"?"Simulated fill time":lang==="zh"?"模拟成交时间":"模擬約定時刻",
    decided:lang==="ko"?"판단 시각":lang==="en"?"Decision time":lang==="zh"?"决策时间":"判断時刻",
    session:lang==="ko"?"정규장 시가":lang==="en"?"Regular market open":lang==="zh"?"正常开盘":"通常取引の始値",
    asOf:lang==="ko"?"판단 데이터 기준일":lang==="en"?"Decision data as-of":lang==="zh"?"决策数据截至日期":"判断データ基準日",
    fill:lang==="ko"?"모의 체결가":lang==="en"?"Hypothetical fill price":lang==="zh"?"模拟成交价格":"模擬約定価格",
    open:lang==="ko"?"원본 시가":lang==="en"?"Original opening price":lang==="zh"?"原始开盘价":"元データの始値",
    gross:lang==="ko"?"체결금액":lang==="en"?"Notional":lang==="zh"?"成交金额":"約定金額",
    cost:lang==="ko"?"거래 비용":lang==="en"?"Assumed fees":lang==="zh"?"模拟费用":"仮定費用",
    cash:lang==="ko"?"현금 변동":lang==="en"?"Cash change":lang==="zh"?"现金变动":"現金変動",
    rationale:lang==="ko"?"투자 판단 근거 (AI 생성 텍스트)":lang==="en"?"AI-generated decision rationale":lang==="zh"?"AI 生成的决策理由":"AI生成の判断理由",
  };
  const rows:[string,React.ReactNode][]=[
    ["AI",<span key="ai" className="flex items-center gap-2"><Dot color={a.color}/>{a.name}</span>],
    [labels.decided,fmtDateTimeNY(trade.decisionAt)],
    [labels.time,fmtDateTimeNY(trade.executedAt)],
    [labels.asOf,trade.dataAsOf??"—"],
    [t(lang,"수량"),`${trade.quantity} ${t(lang,"주")}`],
    ...(d.publicQuotesRedacted?[]:[
      [labels.open,fmtNum(trade.refOpenPrice,4)],
      [labels.fill,fmtNum(trade.price,4)],
      [labels.gross,fmtUsd(trade.gross,2)],
      [labels.cost,fmtUsd(trade.fee,2)],
      [labels.cash,<span key="cash" className={toneClass(trade.netCash)}>{fmtUsd(trade.netCash,2)}</span>],
      [t(lang,"실현손익"),trade.realizedPnl===null?"—":fmtUsd(trade.realizedPnl,2)],
    ] as [string,React.ReactNode][]),
    [t(lang,"스냅샷 해시"),round?.snapshotHash?<code key="hash" className="break-all text-xs">{round.snapshotHash}</code>:"—"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={trade.side==="BUY"?"up":"down"} className="text-sm">{t(lang,sideLabel(trade.side))}</Badge>
        <h1 className="text-xl font-semibold"><Link href={localizedHref(lang,`/stocks/${trade.symbol}`)} className="hover:underline">{trade.symbol}</Link></h1>
        <span className="text-muted">{trade.tradeDate}</span>
      </div>
      <Section title={t(lang,"거래 이력")}>
        <dl className="divide-y divide-line text-sm">
          {rows.map(([k,v])=>(
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-muted">{k}</dt><dd className={cn("text-right tabular")}>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {d.publicQuotesRedacted&&(
        <p className="text-xs leading-6 text-muted">{t(lang,"주식별 시세·차트는 공급자의 재배포 허가가 확인될 때까지 제공되지 않습니다.")}</p>
      )}
      {action&&(
        <Section title={labels.rationale}>
          <p className="text-sm leading-7">{action.reason}</p>
          {action.risks.length>0&&<p className="mt-2 text-sm text-muted">{t(lang,"위험 요인:")} {action.risks.join(" · ")}</p>}
          {dec?.summary&&<p className="mt-3 border-t border-line pt-3 text-sm text-muted">{dec.summary}</p>}
        </Section>
      )}
    </div>
  );
}
