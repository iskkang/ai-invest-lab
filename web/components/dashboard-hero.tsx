import Link from "next/link";
import { ArrowRight, GitCompareArrows, Radar } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { localizedHref } from "@/lib/i18n";
import { sectionLabel } from "@/lib/section-labels";

const COPY={
  ko:{
    mobileIntro:"실제 과거 시장 연구는 지금 확인하고, AI 판단은 기록이 쌓이는 대로 비교하세요.",
    title1:"하나의 시장,",title2:"네 가지 AI의 시선.",
    intro:"누가 더 높은 수익률을 기록할까? 서로 다른 AI의 판단을 비교하고, 실제 모의투자 결과와 과거 시장 데이터로 검증합니다.",
    explore:"AI 판단 비교",historical:"과거 시장 연구",
    agents:"비교 대상 AI",start:"실험 시작일",
    scheduled:"첫 투자 실험 준비 중",tracking:"검증된 판단 기록 축적 중",
    note:"각 모델의 의견과 수익률은 실제 기록이 생긴 후 공개됩니다.",
    modelCaveat:"같은 데이터·가상 원금·매매 규칙으로 비교하지만, 모델의 규모와 가격대는 다릅니다. 회사 간 우열을 뜻하지 않습니다.",
  },
  en:{
    mobileIntro:"Explore historical research now. AI comparisons will follow verified decisions.",
    title1:"One market.",title2:"Four AI perspectives.",
    intro:"Which model performs better? Compare independent AI decisions and examine actual simulated results alongside verified historical market research.",
    explore:"Compare AI decisions",historical:"Explore historical research",
    agents:"Independent AI models",start:"Experiment starts",
    scheduled:"First research round scheduled",tracking:"Accumulating verified decisions",
    note:"Performance rankings appear only after real decision and valuation records exist.",
    modelCaveat:"Market data, virtual starting capital and trading rules are shared; model size and price tier differ. Results are not company rankings.",
  },
  zh:{
    mobileIntro:"现在可查看真实历史研究；AI 对比将在判断记录累积后开放。",
    title1:"同一个市场，",title2:"四种 AI 视角。",
    intro:"哪个 AI 的表现更好？比较独立 AI 的判断，并以真实记录的模拟投资结果和历史市场数据进行检验。",
    explore:"比较 AI 决策",historical:"查看历史市场研究",
    agents:"独立 AI 模型",start:"实验开始日",
    scheduled:"首轮实验准备中",tracking:"正在积累已核实的判断",
    note:"只有产生真实决策与账户估值记录后才公布收益率排名。",
    modelCaveat:"模型使用相同的数据、虚拟起始资金及交易规则，但规模与价格档次不同。结果不代表厂商优劣。",
  },
  ja:{
    mobileIntro:"過去の市場分析は今すぐ確認できます。AI比較は判断記録の蓄積後に公開します。",
    title1:"同じ市場、",title2:"4つのAIの視点。",
    intro:"どのAIが優れた成果を上げるのか。独立したAI判断と実際の模擬運用記録を比較し、過去の市場データでも検証します。",
    explore:"AI判断を比較",historical:"過去の市場研究",
    agents:"独立AIモデル",start:"実験開始日",
    scheduled:"初回の実験準備中",tracking:"検証済み判断を蓄積中",
    note:"実際の判断と評価が記録されてからランキングを表示します。",
    modelCaveat:"同じデータ・仮想初期資金・売買ルールで比較しますが、モデルの規模と価格帯は異なります。企業の優劣ではありません。",
  },
} as const;

export function DashboardHero({d}:{d:Dataset}){
  const c=COPY[d.locale];
  const eyebrow=sectionLabel(d.locale,"heroResearch");
  const models=d.accounts.filter(a=>a.kind==="ai");
  const scheduled=new Date().toISOString().slice(0,10)<d.experiment.startSession && d.rounds.length===0;
  const hasVerifiedDecision=d.decisions.some(dec=>dec.status==="valid");
  const primary=hasVerifiedDecision?"/consensus":"/historical";
  const secondary=hasVerifiedDecision?"/historical":"/consensus";
  return <section className="market-hero px-4 pb-3 pt-4 sm:px-8 sm:pb-7 sm:pt-8" aria-label={eyebrow}>
    <div className="relative grid items-center gap-4 md:min-h-[270px] md:gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="relative z-10">
        <p className="hero-eyebrow"><span className="hero-signal" aria-hidden/>{eyebrow}</p>
        <h1 className="hero-title mt-2 sm:mt-5">
          <span className="block">{c.title1}</span>{" "}
          <span className="hero-title-em block">{c.title2}</span>
        </h1>
        <p className="mt-2 text-[12px] leading-5 text-[#d4ddf0] sm:hidden">{c.mobileIntro}</p>
        <p className="mt-4 hidden max-w-xl text-[13px] leading-6 text-[#d4ddf0] sm:block sm:text-sm sm:leading-7">
          {c.intro}
        </p>
        <p className="mt-2 hidden max-w-xl text-xs leading-6 text-[#c7d7f0] sm:block">{c.modelCaveat}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-5 sm:gap-x-4">
          <Link href={localizedHref(d.locale,primary)} className="hero-action min-h-11">
            <GitCompareArrows size={16} aria-hidden/>
            {hasVerifiedDecision?c.explore:c.historical}<ArrowRight size={15} aria-hidden/>
          </Link>
          <Link href={localizedHref(d.locale,secondary)}
            className="inline-flex min-h-11 items-center gap-1.5 py-2 text-xs font-semibold text-[#e8eeff] underline decoration-[#95b8f0]/50 underline-offset-4 hover:text-[#c9f58a]">
            {hasVerifiedDecision?c.historical:c.explore}<ArrowRight size={14} aria-hidden/>
          </Link>
        </div>
      </div>
      <div className="pointer-events-none relative hidden md:block" aria-hidden="true">
        <div className="hero-orbit">
          <div className="hero-orbit-center">
            <Radar size={38} strokeWidth={1.25} className="text-[#cbfa81]"/>
            <span className="absolute bottom-5 text-[9px] font-black tracking-[.23em] text-[#dae5ff]">{sectionLabel(d.locale,"marketOrbit")}</span>
          </div>
          {models.slice(0,4).map((model,i)=><span key={model.id}
            className={"hero-orbit-label p"+(i+1)}>{model.name}</span>)}
        </div>
      </div>
    </div>
    <div className="hero-meta mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 text-[11px] sm:mt-5 sm:gap-3 sm:pt-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span><b className="mr-1.5 text-[#d2f69a]">{models.length.toString().padStart(2,"0")}</b>{c.agents}</span>
        <span><b className="mr-1.5 font-semibold text-white">{d.experiment.startSession}</b>{c.start}</span>
      </div>
      <span className="hidden items-center gap-2 text-[#c7d7f0] sm:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-[#c9f58a]" aria-hidden/>
        {scheduled?c.scheduled:c.tracking}
      </span>
    </div>
  </section>;
}
