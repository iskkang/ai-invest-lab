import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, Clock3, Layers3, ShieldCheck } from "lucide-react";
import { insightCopy } from "@/lib/insight-copy";
import { historicalCopy } from "@/lib/historical-copy";
import {
  compareLatestRound, generateWeeklyReports, weekFriday, verifiedDecisions,
  type AccuracyModel, type SymbolComparison, type WeeklyReport,
  MIN_DIRECTION_SAMPLES,
} from "@/lib/insight-analytics";
import { localizedHref, localizedDecisionText } from "@/lib/i18n";
import type { Dataset } from "@/lib/types";
import type { Locale } from "@/lib/public-content";
import { fmtPct } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Section } from "./blocks";

const stat = (n: number) => new Intl.NumberFormat("en-US").format(n);
const signalText = (locale: Locale, dir: string) => {
  const c = insightCopy(locale);
  return dir==="BUY"?c.buy:dir==="SELL"?c.sell:c.hold;
};

export function InsightsHeader({locale,title,sub}:{locale:Locale;title:string;sub:string}) {
  const c=insightCopy(locale);
  return <header className="insight-banner mb-6 px-5 py-7 sm:px-8 sm:py-9">
    <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="hero-eyebrow"><span className="hero-signal" aria-hidden/>MARKETSIGHTS / INTELLIGENCE</p>
        <h1 className="mt-4 max-w-3xl text-[26px] font-extrabold leading-tight tracking-[-.04em] text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#c5d3ef]">{sub}</p>
      </div>
      <Badge variant="outline" className="border-white/25 px-3 py-2 !text-[#d6e6ff]">{c.dataMode}</Badge>
    </div>
  </header>;
}

export function InsightUnavailable({locale}:{locale:Locale}) {
  const c=insightCopy(locale);
  return <div className="mx-auto max-w-3xl py-8">
    <InsightsHeader locale={locale} title={c.title} sub={c.sub}/>
    <div className="rounded-2xl border border-line bg-panel p-7">
      <p className="font-semibold">{c.unavailable}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{c.unavailableHelp}</p>
    </div>
  </div>;
}

export function InsightTeasers({d}:{d:Dataset}) {
  const c=insightCopy(d.locale), comparison=compareLatestRound(d), reports=generateWeeklyReports(d);
  const cards=[
    {title:c.consensus,desc:comparison.date
      ?c.latestSession+": "+comparison.date+" · "+c.agree+" "+comparison.consensus.length+" · "+c.diverge+" "+comparison.disagreements.length
      :c.noDecision,href:"/consensus",icon:Layers3},
    {title:c.weekly,desc:reports.length
      ?reports[0].week+" · "+reports[0].actionCount+" "+c.votedCount:c.noReport,
      href:"/weekly",icon:Clock3},
    {title:c.accuracy,desc:c.noPublishedAccuracy,href:"/accuracy",icon:ShieldCheck},
    {title:historicalCopy(d.locale).nav,desc:historicalCopy(d.locale).sub,href:"/historical",icon:ChartNoAxesCombined},
  ];
  return <section aria-label={c.title}>
    <div className="mb-4">
      <p className="ms-kicker mb-2">INTELLIGENCE / EXPLORE</p>
      <h2 className="text-xl font-extrabold tracking-tight">{c.title}</h2>
      <p className="mt-1 text-xs leading-6 text-muted">{c.sub}</p>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card,i)=><Link key={card.href}
        href={localizedHref(d.locale,card.href)}
        data-index={String(i+1).padStart(2,"0")}
        className="ms-card ms-card-hover ms-insight-card group flex min-h-[171px] flex-col p-4 sm:p-5">
        <div className="relative z-10 flex items-center justify-between gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
            <card.icon size={19} strokeWidth={1.85} aria-hidden/>
          </span>
          <ArrowRight size={17} className="text-muted transition group-hover:translate-x-1 group-hover:text-accent" aria-hidden/>
        </div>
        <h3 className="relative z-10 mt-4 text-[15px] font-bold tracking-tight">{card.title}</h3>
        <p className="relative z-10 mt-2 flex-1 text-xs leading-5 text-muted">{card.desc}</p>
        <span className="relative z-10 mt-3 text-[11px] font-bold text-accent">{c.seeAll} →</span>
      </Link>)}
    </div>
  </section>;
}

function Symbols({rows,locale,empty}:{rows:SymbolComparison[];locale:Locale;empty:string}) {
  const c=insightCopy(locale);
  if(!rows.length)return <p className="py-7 text-sm leading-6 text-muted">{empty}</p>;
  return <div className="divide-y divide-line">
    {rows.slice(0,25).map(row=><article key={row.symbol} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{row.symbol}</span>
          <span className="ml-2 text-xs text-muted">{row.company}</span>
        </div>
        <span className="text-xs text-muted">{row.votes.length} {c.votes} · {c.buy} {row.buy} / {c.sell} {row.sell} / {c.hold} {row.hold}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {row.votes.map(vote=><div key={vote.aiId} className="rounded-lg border border-line bg-panel-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{vote.aiName}</span>
            <Badge variant={vote.action==="BUY"?"up":vote.action==="SELL"?"down":"muted"}>
              {signalText(locale,vote.action)}
            </Badge>
          </div>
          {vote.reason&&<p className="mt-2 text-xs leading-5 text-muted">
            {localizedDecisionText(locale,vote.reason)}
          </p>}
        </div>)}
      </div>
    </article>)}
  </div>;
}

export function ConsensusBody({d}:{d:Dataset}) {
  const c=insightCopy(d.locale), result=compareLatestRound(d);
  return <div className="mx-auto max-w-5xl space-y-5">
    <InsightsHeader locale={d.locale} title={c.consensus} sub={c.consensusSub}/>
    {!result.date?<Section title={c.waiting}>
      <p className="text-sm text-muted">{c.noDecision}</p>
    </Section>:<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [c.latestSession,result.date],
          [c.participants,result.participatingModels+"/"+result.totalModels],
          [c.agree,stat(result.consensus.length)],
          [c.diverge,stat(result.disagreements.length)],
        ].map(([label,value])=><div key={label} className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs text-muted">{label}</p>
          <p className="mt-2 text-xl font-bold tabular">{value}</p>
        </div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={c.agree}><Symbols locale={d.locale} rows={result.consensus} empty={c.noConsensus}/></Section>
        <Section title={c.diverge}><Symbols locale={d.locale} rows={result.disagreements} empty={c.noConflict}/></Section>
      </div>
    </>}
    <p className="text-xs leading-6 text-muted">{c.source}. {c.caveat}</p>
  </div>;
}

/** A truthful, data-driven launch state, not an invented weekly report. */
function WeeklyEmptyState({d}:{d:Dataset}) {
  const c=insightCopy(d.locale);
  const start=d.experiment.startSession;
  const earliest=new Date(Date.parse(weekFriday(start)+"T00:00:00Z")+86400000)
    .toISOString().slice(0,10);
  const beforeStart=new Date().toISOString().slice(0,10)<start;
  const completed=new Set(verifiedDecisions(d).map(dec=>dec.roundId)).size;
  return <section className="ms-card overflow-hidden" aria-label={c.emptyTitle}>
    <div className="border-b border-line px-5 py-6 sm:px-6">
      <Badge variant="muted">{beforeStart?c.launchStatus:c.pendingStatus}</Badge>
      <p className="ms-kicker mt-4 mb-2">RESEARCH / SCHEDULE</p>
      <h2 className="mt-2 text-lg font-bold tracking-tight">{c.emptyTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{c.noReport}</p>
    </div>
    <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {[
        [c.startSessionLabel,start],
        [c.verifiedRoundsLabel,String(completed)],
        [c.earliestReportLabel,earliest],
      ].map(([label,value])=><div key={label} className="px-5 py-4 sm:px-6">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 text-base font-semibold tabular">{value}</p>
      </div>)}
    </div>
    <div className="border-t border-line px-5 py-4 sm:px-6">
      <p className="text-xs leading-6 text-muted">
        {beforeStart?c.beforeLaunchDetail:c.afterLaunchDetail}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={localizedHref(d.locale,"/consensus")}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">
          {c.viewComparison}<ArrowRight size={14} aria-hidden/>
        </Link>
        <Link href={localizedHref(d.locale,"/")}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold">
          {c.viewDashboard}<ArrowRight size={14} aria-hidden/>
        </Link>
      </div>
    </div>
  </section>;
}

export function WeeklyIndexBody({d}:{d:Dataset}) {
  const c=insightCopy(d.locale),reports=generateWeeklyReports(d);
  return <div className="mx-auto max-w-5xl space-y-5">
    <InsightsHeader locale={d.locale} title={c.weekly} sub={c.weeklySub}/>
    {!reports.length?<WeeklyEmptyState d={d}/>:<div className="grid gap-3 md:grid-cols-2">
      {reports.map(report=><Link href={localizedHref(d.locale,"/weekly/"+report.week)}
        key={report.week} className="group rounded-2xl border border-line bg-panel p-5 transition hover:border-accent/70">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-accent">{report.week}</span>
          <ArrowRight size={16} className="text-muted group-hover:text-accent"/>
        </div>
        <h2 className="mt-2 text-lg font-bold">{c.report}</h2>
        <p className="mt-1 text-xs text-muted">{report.start} – {report.end}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <span>{c.completedRounds} {report.roundCount}</span>
          <span>{c.votedCount} {report.actionCount}</span>
          <span>{c.agree} {report.common.length}</span>
          <span>{c.diverge} {report.divergent.length}</span>
        </div>
        <p className="mt-4 text-xs font-semibold text-accent">{c.viewReport}</p>
      </Link>)}
    </div>}
    <p className="text-xs leading-6 text-muted">{c.reportCaveat}</p>
  </div>;
}

export function WeeklyReportBody({d,report}:{d:Dataset;report:WeeklyReport}) {
  const c=insightCopy(d.locale);
  const best=report.models.filter(m=>m.weeklyReturn!==null)
    .sort((a,b)=>(b.weeklyReturn??-Infinity)-(a.weeklyReturn??-Infinity))[0];
  return <div className="mx-auto max-w-5xl space-y-5">
    <Link href={localizedHref(d.locale,"/weekly")} className="text-xs text-accent">{c.back}</Link>
    <InsightsHeader locale={d.locale} title={c.report+" · "+report.week}
      sub={report.start+" – "+report.end+" · "+c.source}/>
    <div className="grid grid-cols-3 gap-3">
      {[
        [c.completedRounds,report.roundCount],
        [c.signals,report.actionCount],
        [c.participants,report.models.filter(m=>m.votes>0).length],
      ].map(([label,value])=><div key={label} className="rounded-xl border border-line bg-panel p-4">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-2 text-xl font-bold tabular">{value}</p>
      </div>)}
    </div>
    <Section title={c.highlights}>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          [c.topAgreement, report.common[0]
            ?report.common[0].symbol+" · "+report.common[0].agreement+"/"+report.common[0].votes.length
            :c.noConsensus],
          [c.topDisagreement, report.divergent[0]
            ?report.divergent[0].symbol+" · "+report.divergent[0].votes.length+" "+c.votes
            :c.noConflict],
          [c.topPerformer, best&&best.weeklyReturn!==null
            ?best.name+" · "+fmtPct(best.weeklyReturn)
            :c.notAvailable],
        ].map(([label,value])=><div key={label} className="rounded-xl border border-line bg-panel-2 p-4">
          <p className="text-xs text-muted">{label}</p>
          <p className="mt-2 text-sm font-semibold">{value}</p>
        </div>)}
      </div>
    </Section>
    <Section title={c.weeklyChanges}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-3 pr-2">{c.model}</th>
            <th className="px-2">{c.buy}</th><th className="px-2">{c.sell}</th>
            <th className="px-2">{c.hold}</th>
            <th className="py-3 pl-2 text-right">{c.portfolioReturn}</th>
          </tr></thead>
          <tbody>{report.models.map(m=><tr key={m.id} className="border-b border-line/60">
            <td className="py-3 pr-2 font-semibold">{m.name}</td>
            <td className="px-2 tabular">{m.buys}</td><td className="px-2 tabular">{m.sells}</td>
            <td className="px-2 tabular">{m.holds}</td>
            <td className="py-3 pl-2 text-right tabular">{m.weeklyReturn===null?c.notAvailable:fmtPct(m.weeklyReturn)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Section>
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={c.agree}><Symbols rows={report.common} locale={d.locale} empty={c.noConsensus}/></Section>
      <Section title={c.diverge}><Symbols rows={report.divergent} locale={d.locale} empty={c.noConflict}/></Section>
    </div>
    <p className="text-xs leading-6 text-muted">{c.reportCaveat} {c.caveat}</p>
  </div>;
}

export function AccuracyBody({d,rows}:{d:Dataset;rows:AccuracyModel[]}) {
  const c=insightCopy(d.locale),any=rows.some(row=>row.samples>0);
  return <div className="mx-auto max-w-5xl space-y-5">
    <InsightsHeader locale={d.locale} title={c.accuracy} sub={c.accuracySub}/>
    <div className="rounded-2xl border border-line bg-panel px-5 py-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck size={17} className="text-accent"/>{c.rules}
      </div>
      <p className="text-xs leading-6 text-muted">{c.method}</p>
      <p className="mt-2 text-xs text-muted">{c.noPublishedAccuracy}</p>
    </div>
    {!any?<Section title={c.waiting}><p className="text-sm leading-6 text-muted">{c.noAccuracy}</p></Section>
    :([5,20] as const).map(horizon=>{
      const group=rows.filter(row=>row.horizon===horizon).sort((a,b)=>
        Number(b.qualified)-Number(a.qualified) || (b.hitRate??-1)-(a.hitRate??-1));
      return <Section key={horizon} title={horizon+" "+c.days+" · "+c.hit}>
        {!group.some(row=>row.qualified)&&<p className="mb-3 text-xs text-muted">{c.insufficient}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2">{c.model}</th>
              <th className="px-2 text-right">{c.sample}</th>
              <th className="px-2 text-right">{c.hit}</th>
              <th className="py-2 text-right">{c.excess}</th>
            </tr></thead>
            <tbody>{group.map(model=><tr key={model.aiId} className="border-b border-line/60">
              <td className="py-3 font-medium">{model.name}</td>
              <td className="px-2 text-right tabular">{model.samples}</td>
              <td className="px-2 text-right tabular">{model.qualified && model.hitRate!==null?fmtPct(model.hitRate,1,false):"—"}</td>
              <td className="py-3 text-right tabular">{model.qualified && model.averageExcessVsSpy!==null
                ?fmtPct(model.averageExcessVsSpy,2):"—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted">{c.sample} ≥ {MIN_DIRECTION_SAMPLES} · {c.source}</p>
      </Section>;
    })}
    <p className="text-xs leading-6 text-muted">{c.caveat}</p>
  </div>;
}
