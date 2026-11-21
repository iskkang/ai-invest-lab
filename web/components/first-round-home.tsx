import Link from "next/link";
import { ArrowUpRight, BookOpenText, ChartNoAxesCombined, CalendarDays } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { localizedHref } from "@/lib/i18n";
import { ModelDisclosure } from "@/components/model-disclosure";

const COPY = {
  ko: {
    eyebrow:"AI 모의투자 · 첫 공식 회차 전",
    title:"첫 AI 투자 판단이 기록되면 비교를 시작합니다.",
    status:"아직 공개된 공식 판단 회차가 없습니다.",
    date:"설정된 실험 시작일",
    method:"어떻게 비교하나요?",
    detail:(models:number,stocks:number,cash:string)=>
      `${models}개 AI가 같은 미국 주식 ${stocks}종목의 시장 데이터·가상 원금(${cash})·매매 규칙으로 판단합니다. 각자의 계좌 기록은 다르며 서로의 판단은 공유하지 않습니다.`,
    noRecords:"실제로 기록된 판단과 계좌 평가가 생기기 전에는 순위·수익률·매매 내역을 표시하지 않습니다.",
    methodology:"실험 방법",historical:"과거 전략 연구",patterns:"패턴 검증 보기",
  },
  en: {
    eyebrow:"AI PAPER TRADING · PRE-LAUNCH",
    title:"Comparisons begin after the first official AI decision.",
    status:"No official decision round has been published yet.",
    date:"Configured experiment start date",
    method:"How does the comparison work?",
    detail:(models:number,stocks:number,cash:string)=>
      `${models} AI models use the same dated market data for ${stocks} US stocks, ${cash} each in virtual starting cash, and the same trading rules. They do not see each other's decisions.`,
    noRecords:"Rankings, return charts and trades appear only after real decisions and account valuations have been recorded.",
    methodology:"Research methodology",historical:"Historical research",patterns:"Pattern research",
  },
  zh: {
    eyebrow:"AI 模拟投资 · 首轮正式决策前",
    title:"首轮正式 AI 决策公布后开始比较。",
    status:"目前还没有已公布的正式决策轮次。",
    date:"实验设定的开始日期",
    method:"如何进行比较？",
    detail:(models:number,stocks:number,cash:string)=>
      `${models} 个 AI 使用 ${stocks} 只美股的相同市场数据、每个 ${cash} 的虚拟起始资金及相同交易规则。各自的账户记录会不同，也看不到其他模型的决策。`,
    noRecords:"在真实决策与账户估值记录出现之前，不展示排名、收益曲线或交易记录。",
    methodology:"实验方法",historical:"历史策略研究",patterns:"形态验证",
  },
  ja: {
    eyebrow:"AI 模擬投資 · 初回公式ラウンド前",
    title:"最初の公式AI判断が記録されてから比較を始めます。",
    status:"公開済みの公式判断ラウンドはまだありません。",
    date:"設定された実験開始日",
    method:"どのように比較するのか？",
    detail:(models:number,stocks:number,cash:string)=>
      `${models}つのAIが米国株${stocks}銘柄の同じ市場データ、各${cash}の仮想初期資金、同じ売買ルールで判断します。口座履歴はそれぞれ異なり、他のAIの判断は共有しません。`,
    noRecords:"実際の判断と口座評価が記録されるまで、ランキング・収益グラフ・取引履歴は表示しません。",
    methodology:"研究方法",historical:"過去の戦略研究",patterns:"パターン検証",
  },
} as const;

/** Render only substantiated experiment configuration. This is NOT a demo
 * dashboard and never loads or invents AI decisions, trades or returns.
 */
export function FirstRoundHome({d}:{d:Dataset}) {
  const copy=COPY[d.locale];
  const aiCount=d.accounts.filter(a=>a.kind==="ai").length;
  const stockCount=d.universe.filter(s=>s.role==="investable").length;
  const initialCash="$"+d.experiment.initialCash.toLocaleString("en-US");
  const targets=[
    {href:"/methodology",label:copy.methodology,icon:BookOpenText},
    {href:"/historical",label:copy.historical,icon:ChartNoAxesCombined},
    {href:"/patterns",label:copy.patterns,icon:ArrowUpRight},
  ];
  return (
    <div data-home-phase="pre-first-published-round" className="mx-auto max-w-6xl pb-12">
      <section className="market-hero px-5 py-7 sm:px-9 sm:py-10" aria-label={copy.eyebrow}>
        <p className="hero-eyebrow text-[9px] tracking-[.12em] whitespace-nowrap sm:text-[10px] sm:tracking-[.2em]">{copy.eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-2xl font-extrabold leading-snug tracking-tight text-white sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#d4ddf0]">{copy.status}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(210px,0.85fr)_minmax(0,2fr)]">
          <div className="rounded-xl border border-white/15 bg-white/[.075] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-[#d5e9ff]">
              <CalendarDays size={16} aria-hidden="true"/>{copy.date}
            </p>
            <time dateTime={d.experiment.startSession}
              className="mt-2 block text-2xl font-extrabold tracking-tight text-white tabular">
              {d.experiment.startSession}
            </time>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/[.075] p-4">
            <h2 className="text-sm font-bold text-white">{copy.method}</h2>
            <p className="mt-2 text-sm leading-6 text-[#e0e8f8]">
              {copy.detail(aiCount,stockCount,initialCash)}
            </p>
            <div className="mt-4 border-t border-white/15 pt-4">
              <ModelDisclosure locale={d.locale} dark/>
            </div>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-xs leading-6 text-[#c1d1ec]">{copy.noRecords}</p>
        <nav aria-label={copy.method} className="mt-5 flex flex-wrap gap-2.5">
          {targets.map(({href,label,icon:Icon},i)=><Link key={href}
            href={localizedHref(d.locale,href)}
            className={i===0
              ?"inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d2f69a] px-4 py-2.5 text-sm font-bold text-[#15203f] hover:bg-white"
              :"inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:border-white/60 hover:bg-white/10"}>
            <Icon size={16} aria-hidden="true"/>{label}
          </Link>)}
        </nav>
      </section>
    </div>
  );
}
