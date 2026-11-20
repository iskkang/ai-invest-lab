import { CircleCheck, Info, Scale, Sparkles } from "lucide-react";
import type { AiView } from "@/lib/stock";
import { STANCE_LABEL, STANCE_TONE, compareSummary } from "@/lib/stock";
import { cn, fmtNum, fmtUsd, toneClass } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

const CONF: Record<string, [number, string]> = { low: [1, "낮음"], medium: [2, "보통"], high: [3, "높음"] };

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-bold text-white"
          style={{ background: color, width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

function StanceBadge({ v }: { v: AiView }) {
  const tone = STANCE_TONE[v.stance];
  return <Badge variant={tone === "default" ? "default" : tone} className="px-2.5 py-1 text-xs">{STANCE_LABEL[v.stance]}</Badge>;
}

function Confidence({ level }: { level: string | null | undefined }) {
  const [n, label] = level ? CONF[level] ?? [0, "미제공"] : [0, "미제공"];
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-[13px] text-muted">자기평가</span>
      <div className="flex flex-1 gap-1" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={n} aria-label={`AI 자기평가 신뢰도 ${label}`}>
        {[1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= n ? "bg-accent" : "bg-panel-2")} />)}
      </div>
      <span className="w-10 text-right text-[13px] font-semibold">{label}</span>
    </div>
  );
}

function Reason({ v }: { v: AiView }) {
  if (v.action) return <p className="text-[13px] leading-relaxed text-fg/85">{v.action.reason}</p>;
  const msg: Record<string, string> = {
    KEEP: `${v.sessionDate} 회차에서 이 종목을 따로 언급하지 않고 보유를 유지했습니다.`,
    NONE: v.sessionDate ? `${v.sessionDate} 회차에서 이 종목을 거래 대상으로 고르지 않았습니다.` : "아직 판단 기록이 없습니다.",
    FAILED: "최근 회차 응답이 형식 검증을 통과하지 못해 판단이 기록되지 않았습니다.",
  };
  return <p className="text-[13px] leading-relaxed text-muted">{msg[v.stance] ?? ""}</p>;
}

function Body({ v }: { v: AiView }) {
  return (
    <div className="space-y-3">
      <Confidence level={v.action?.confidence} />
      <div>
        <p className="mb-1 text-[13px] font-semibold">판단 이유</p>
        <Reason v={v} />
      </div>
      {v.action?.risks?.length ? <p className="text-[12px] text-muted">위험 요인: {v.action.risks.join(" · ")}</p> : null}
      {v.action?.indicators_used?.length ? (
        <div className="flex flex-wrap gap-1">{v.action.indicators_used.map((i) => <Badge key={i} variant="outline">{i}</Badge>)}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[12px] text-muted tabular">
        <span>{v.quantityHeld ? `${v.quantityHeld}주 보유 · 평단 ${fmtNum(v.avgCost)}` : "미보유"}</span>
        <span>이 종목 손익 <b className={toneClass(v.pnl)}>{fmtUsd(v.pnl, 2)}</b></span>
        {v.action && v.action.action !== "HOLD" && <span>주문 {v.action.quantity}주</span>}
      </div>
    </div>
  );
}

export function AiCompare({ views, symbol }: { views: AiView[]; symbol: string }) {
  const s = compareSummary(views);
  const asOf = views.find((v) => v.dataAsOf)?.dataAsOf;
  return (
    <section aria-labelledby="ai-compare">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="ai-compare" className="flex items-center gap-2 text-lg font-bold"><Sparkles size={19} className="text-accent" aria-hidden />AI 판단 비교</h2>
        <span className="text-xs text-muted">각 AI의 최근 회차 판단 중 {symbol} 관련 내용{asOf ? ` · 데이터 기준일 ${asOf}` : ""}</span>
      </div>

      {/* 데스크톱: 카드 그리드 */}
      <div className="hidden gap-3 md:grid md:grid-cols-2 2xl:grid-cols-4">
        {views.map((v) => (
          <Card key={v.account.id} className="p-4">
            <div className="mb-3 flex items-center gap-3">
              <Avatar name={v.account.name} color={v.account.color} />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold leading-tight">{v.account.name}</p>
                <p className="truncate text-[11px] text-muted">{v.account.model}</p>
              </div>
              <StanceBadge v={v} />
            </div>
            <Body v={v} />
          </Card>
        ))}
      </div>

      {/* 모바일: 아코디언 */}
      <div className="space-y-2 md:hidden">
        {views.map((v) => (
          <details key={v.account.id} className="card-shadow group rounded-2xl border border-line bg-panel">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <Avatar name={v.account.name} color={v.account.color} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-bold">{v.account.name}</span><StanceBadge v={v} /></div>
                <div className="mt-1.5 flex gap-1">
                  {[1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 w-10 rounded-full", i <= (v.action?.confidence ? CONF[v.action.confidence]?.[0] ?? 0 : 0) ? "bg-accent" : "bg-panel-2")} />)}
                </div>
              </div>
              <span className="text-xl text-muted transition-transform group-open:rotate-180" aria-hidden>⌄</span>
            </summary>
            <div className="px-4 pb-4"><Body v={v} /></div>
          </details>
        ))}
      </div>

      <Card className="mt-3 border-accent/25 bg-accent/[0.04] p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><Scale size={18} className="text-accent" aria-hidden />비교 요약</h3>
        <div className="grid gap-4 md:grid-cols-2 md:divide-x md:divide-line">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><CircleCheck size={16} aria-hidden />일치하는 점</p>
            <p className="mt-1 text-[13px] leading-relaxed">{s.agreement}</p>
            {s.common.length > 0 && <p className="mt-1 text-[12px] text-muted">공통으로 참고한 지표: {s.common.join(", ")}</p>}
          </div>
          <div className="md:pl-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Info size={16} className="text-accent" aria-hidden />다른 점</p>
            {s.differences.length ? (
              <ul className="mt-1 space-y-0.5 text-[13px]">{s.differences.map((x) => <li key={x}>{x}</li>)}</ul>
            ) : <p className="mt-1 text-[13px] text-muted">의견 차이 없음</p>}
            {s.allUsed.length > 0 && <p className="mt-1 text-[12px] text-muted">언급된 지표 전체: {s.allUsed.join(", ")}</p>}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">이 요약은 저장된 판단을 규칙으로 집계한 것이며, 화면을 열 때 AI를 새로 호출하지 않습니다. 매매 권유가 아닙니다.</p>
      </Card>
    </section>
  );
}
