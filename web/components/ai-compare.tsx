import { CircleCheck, Info, Scale, Sparkles } from "lucide-react";
import type { AiView } from "@/lib/stock";
import { STANCE_LABEL, STANCE_TONE, compareSummary } from "@/lib/stock";
import { cn, fmtNum, fmtUsd, toneClass } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { t, localizedDecisionText } from "@/lib/i18n";
import type { Locale } from "@/lib/public-content";

const CONF: Record<string, [number, string]> = { low: [1, "낮음"], medium: [2, "보통"], high: [3, "높음"] };

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-bold text-white"
          style={{ background: color, width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

function StanceBadge({ v, locale }: { v: AiView; locale: Locale }) {
  const tone = STANCE_TONE[v.stance];
  return <Badge variant={tone === "default" ? "default" : tone} className="px-2.5 py-1 text-xs">{t(locale,STANCE_LABEL[v.stance])}</Badge>;
}

function Confidence({ level, locale }: { level: string | null | undefined;locale:Locale }) {
  const [n, label] = level ? CONF[level] ?? [0, "미제공"] : [0, "미제공"];
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-[13px] text-muted">{t(locale,"자기평가")}</span>
      <div className="flex flex-1 gap-1" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={n} aria-label={`AI ${t(locale,"자기평가")} ${t(locale,label)}`}>
        {[1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= n ? "bg-accent" : "bg-panel-2")} />)}
      </div>
      <span className="w-10 text-right text-[13px] font-semibold">{t(locale,label)}</span>
    </div>
  );
}

function Reason({v,locale}:{v:AiView;locale:Locale}) {
  if(v.action) return <p className="text-[13px] leading-relaxed text-fg/85">{localizedDecisionText(locale,v.action.reason)}</p>;
  const source:Record<string,Record<Locale,string>>={
    KEEP:{ko:"보유를 유지했고 최근 판단에서 이 종목을 언급하지 않았습니다.",en:"Position held; the latest decision did not mention this ticker.",zh:"继续持有，最近的决策中未提及该股票。",ja:"保有を継続し、最近の判断では当該銘柄に言及していません。"},
    NONE:{ko:"아직 이 종목에 대한 매매 판단이 없습니다.",en:"No trading decision for this ticker yet.",zh:"尚无该股票的交易决策。",ja:"この銘柄の取引判断はまだありません。"},
    FAILED:{ko:"AI 응답이 형식 검증을 통과하지 못했습니다.",en:"The AI response failed structured-output validation.",zh:"AI 响应未通过结构化格式验证。",ja:"AIの応答は出力形式の検証に失敗しました。"},
  };
  return <p className="text-[13px] leading-relaxed text-muted">{source[v.stance]?.[locale] ?? ""}</p>;
}

function Body({ v, locale, redacted=false }: { v: AiView;locale:Locale;redacted?:boolean }) {
  return (
    <div className="space-y-3">
      <Confidence level={v.action?.confidence} locale={locale} />
      <div>
        <p className="mb-1 text-[13px] font-semibold">{t(locale,"판단 이유")}</p>
        <Reason v={v} locale={locale} />
      </div>
      {v.action?.risks?.length ? <p className="text-[12px] text-muted">{t(locale,"위험 요인:")} {v.action.risks.map(text=>localizedDecisionText(locale,text)).join(" · ")}</p> : null}
      {v.action?.indicators_used?.length ? (
        <div className="flex flex-wrap gap-1">{v.action.indicators_used.map((i) => <Badge key={i} variant="outline">{i}</Badge>)}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[12px] text-muted tabular">
        <span>{v.quantityHeld ? `${v.quantityHeld} ${t(locale,"주")} ${t(locale,"보유")}${redacted?"":` · ${t(locale,"평단")} ${fmtNum(v.avgCost)}`}` : t(locale,"미보유")}</span>
        {!redacted && <span>{t(locale,"이 종목 손익")} <b className={toneClass(v.pnl)}>{fmtUsd(v.pnl, 2)}</b></span>}
        {v.action && v.action.action !== "HOLD" && <span>{t(locale,"주문")} {v.action.quantity} {t(locale,"주")}</span>}
      </div>
    </div>
  );
}

export function AiCompare({ views, symbol, locale="ko",redacted=false }: { views: AiView[]; symbol: string;locale?:Locale;redacted?:boolean }) {
  const s = compareSummary(views);
  const asOf = views.find((v) => v.dataAsOf)?.dataAsOf;
  const stanceGroups = views.map(v=>`${v.account.name}: ${t(locale,STANCE_LABEL[v.stance])}`).join(" · ");
  return (
    <section aria-labelledby="ai-compare">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="ai-compare" className="flex items-center gap-2 text-lg font-bold"><Sparkles size={19} className="text-accent" aria-hidden />{t(locale,"AI 판단 비교")}</h2>
        <span className="text-xs text-muted">{t(locale,"각 AI의 최근 회차 판단 중")} {symbol} {t(locale,"관련 내용")}{asOf ? ` · ${t(locale,"데이터 기준일")} ${asOf}` : ""}</span>
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
              <StanceBadge v={v} locale={locale} />
            </div>
            <Body v={v} locale={locale} redacted={redacted} />
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
                <div className="flex items-center gap-2"><span className="font-bold">{v.account.name}</span><StanceBadge v={v} locale={locale} /></div>
                <div className="mt-1.5 flex gap-1">
                  {[1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 w-10 rounded-full", i <= (v.action?.confidence ? CONF[v.action.confidence]?.[0] ?? 0 : 0) ? "bg-accent" : "bg-panel-2")} />)}
                </div>
              </div>
              <span className="text-xl text-muted transition-transform group-open:rotate-180" aria-hidden>⌄</span>
            </summary>
            <div className="px-4 pb-4"><Body v={v} locale={locale} redacted={redacted} /></div>
          </details>
        ))}
      </div>

      <Card className="mt-3 border-accent/25 bg-accent/[0.04] p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><Scale size={18} className="text-accent" aria-hidden />{t(locale,"비교 요약")}</h3>
        <div className="grid gap-4 md:grid-cols-2 md:divide-x md:divide-line">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><CircleCheck size={16} aria-hidden />{t(locale,"일치하는 점")}</p>
            <p className="mt-1 text-[13px] leading-relaxed">{locale==="ko"?s.agreement:stanceGroups}</p>
            {s.common.length > 0 && <p className="mt-1 text-[12px] text-muted">{t(locale,"공통으로 참고한 지표:")} {s.common.join(", ")}</p>}
          </div>
          <div className="md:pl-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Info size={16} className="text-accent" aria-hidden />{t(locale,"다른 점")}</p>
            {s.differences.length ? (
              <ul className="mt-1 space-y-0.5 text-[13px]">{(locale==="ko"?s.differences:[]).map(x=><li key={x}>{x}</li>)}{locale!=="ko"&&<li>{stanceGroups}</li>}</ul>
            ) : <p className="mt-1 text-[13px] text-muted">{t(locale,"의견 차이 없음")}</p>}
            {s.allUsed.length > 0 && <p className="mt-1 text-[12px] text-muted">{t(locale,"언급된 지표 전체:")} {s.allUsed.join(", ")}</p>}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">{t(locale,"이 요약은 저장된 판단을 규칙으로 집계한 것이며, 화면을 열 때 AI를 새로 호출하지 않습니다. 매매 권유가 아닙니다.")}</p>
      </Card>
    </section>
  );
}
