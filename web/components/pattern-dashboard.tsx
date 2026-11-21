import Link from "next/link";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined,
  Clock3, GitCompareArrows, Layers3, ShieldAlert,
} from "lucide-react";
import type { Locale } from "@/lib/public-content";
import type { PatternId, PatternSummary, PatternStudy, HorizonStudy } from "@/lib/pattern-lab";
import { PATTERNS } from "@/lib/pattern-lab";
import type { PatternOverlap } from "@/lib/pattern-compare";
import type { PublicPatternLab } from "@/lib/pattern-server";
import { patternCopy, patternDetail } from "@/lib/pattern-copy";
import { localizedHref } from "@/lib/i18n";

function number(n:number,locale:Locale){
  return n.toLocaleString(locale==="zh"?"zh-CN":locale==="ja"?"ja-JP":locale==="ko"?"ko-KR":"en-US");
}
function signed(n:number){return (n>0?"+":"")+n.toFixed(2)+"%";}
function Head({locale,detail}:{locale:Locale;detail?:PatternId}){
  const c=patternCopy(locale);
  const specifics=detail?patternDetail(locale,detail):null;
  return <header className="insight-banner relative overflow-hidden rounded-2xl px-5 py-7 sm:px-8 sm:py-9">
    <p className="hero-eyebrow"><span className="hero-signal" aria-hidden/>{c.label}</p>
    <h1 className="mt-4 max-w-4xl text-[27px] font-extrabold leading-tight tracking-[-.04em] text-white sm:text-4xl">
      {specifics?specifics.name:c.headline}
    </h1>
    <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c5d3ef]">{specifics?specifics.intro:c.sub}</p>
    <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-[#d9e7fb]">
      <ShieldAlert size={16} className="shrink-0 text-[#cbfa81]" aria-hidden/>{c.source}
    </div>
  </header>;
}
function HorizonBox({row,locale}:{row:HorizonStudy;locale:Locale}){
  const c=patternCopy(locale);
  const label=row.horizon===5?c.window5:c.window20;
  return <div className="rounded-xl border border-line bg-panel-2 p-3.5">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-extrabold">{label}</h3>
      <span className="text-[11px] text-muted">{c.count} {number(row.observations,locale)}</span>
    </div>
    <div className="mt-3 flex items-baseline gap-2">
      <span className="text-2xl font-extrabold tabular">{row.hitRate===null?"—":signed(row.hitRate)}</span>
      <span className="text-[11px] text-muted">{row.hitRate===null?c.notQualified:c.hits}</span>
    </div>
    {row.hitRate!==null&&<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
      aria-hidden><div className="h-full rounded-full bg-accent" style={{width:Math.min(100,Math.max(0,row.hitRate))+"%"}}/></div>}
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
      <div><p className="text-[10px] text-muted">{c.avg}</p>
        <p className="mt-1 text-sm font-semibold tabular">{row.averageDirectionalPct===null?"—":signed(row.averageDirectionalPct)}</p></div>
      <div><p className="text-[10px] text-muted">{c.relative}</p>
        <p className="mt-1 text-sm font-semibold tabular">{row.averageRelativeToSpyPct===null?"—":signed(row.averageRelativeToSpyPct)}</p></div>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-muted">{c.pending}: {number(row.pending,locale)}</p>
  </div>;
}
function Stat({label,value}:{label:string;value:string|number}){
  return <div className="min-w-0 rounded-xl bg-panel-2 px-3 py-4">
    <p className="text-[11px] leading-4 text-muted">{label}</p>
    <p className="mt-2 break-words text-lg font-extrabold tabular">{value}</p>
  </div>;
}
function Overview({locale,study}:{locale:Locale;study:PatternStudy}){
  const c=patternCopy(locale);
  return <section className="ms-card px-4 py-5 sm:px-6" aria-label={c.from}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-bold">{c.from}</h2>
      <span className="text-xs text-muted">{study.dataFrom} – <time dateTime={study.dataTo}>{study.dataTo}</time></span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label={c.universe} value={number(study.eligibleSymbols,locale)}/>
      <Stat label={c.sessions} value={number(study.inputSessions,locale)}/>
      <Stat label={c.analysis} value={number(study.analysisSessions,locale)}/>
      <Stat label={c.excluded} value={number(study.excludedSymbols,locale)}/>
    </div>
  </section>;
}
function SummaryCard({locale,pattern}:{locale:Locale;pattern:PatternSummary}){
  const c=patternCopy(locale),detail=patternDetail(locale,pattern.id);
  return <article className="ms-card ms-card-hover flex min-w-0 flex-col overflow-hidden">
    <div className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-accent">{pattern.direction==="up"?c.positive:c.negative}</p>
          <h3 className="mt-1.5 text-lg font-extrabold">{detail.name}</h3>
        </div>
        <span className="rounded-lg bg-panel-2 p-2 text-accent"><ChartNoAxesCombined size={19} aria-hidden/></span>
      </div>
      <p className="mt-2 line-clamp-3 min-h-[54px] text-xs leading-5 text-muted">{detail.intro}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label={c.occurrences} value={number(pattern.occurrences,locale)}/>
        <Stat label={c.recent} value={number(pattern.recentFiveSessions,locale)}/>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {pattern.horizons.map(row=><div key={row.horizon} className="rounded-xl border border-line px-3 py-3">
          <p className="text-[11px] text-muted">{row.horizon===5?c.window5:c.window20}</p>
          <p className="mt-1 text-xl font-extrabold tabular">
            {row.hitRate===null?"—":signed(row.hitRate)}
          </p>
          <p className="mt-1 text-[10px] text-muted">
            {c.count} {row.observations} / {row.hitRate===null?c.notQualified:c.hits}
          </p>
        </div>)}
      </div>
      <p className="mt-3 text-[11px] text-muted">{c.last}: {pattern.lastDate??"—"}</p>
    </div>
    <Link href={localizedHref(locale,"/patterns/"+pattern.id)}
      className="mt-auto flex min-h-12 items-center justify-between border-t border-line px-5 text-sm font-semibold text-accent hover:bg-panel-2">
      {c.open}<ArrowRight size={17} aria-hidden/>
    </Link>
  </article>;
}
function AllWeather({locale}:{locale:Locale}){
  const c=patternCopy(locale);
  return <section className="rounded-2xl border border-dashed border-line bg-panel-2 p-5 sm:p-6">
    <p className="ms-kicker mb-2">PORTFOLIO / ALL WEATHER</p>
    <h2 className="text-base font-extrabold">{c.allWeather}</h2>
    <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{c.allWeatherText}</p>
  </section>;
}
function Method({locale}:{locale:Locale}){
  const c=patternCopy(locale);
  return <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
    <div className="flex items-center gap-2"><BookOpen size={19} className="text-accent" aria-hidden/><h2 className="text-lg font-extrabold">{c.methodology}</h2></div>
    <ol className="mt-4 space-y-3 text-sm leading-7 text-muted">
      <li>01. {c.method1}</li><li>02. {c.method2}</li><li>03. {c.method3}</li>
    </ol>
    <p className="mt-4 rounded-xl bg-panel-2 p-4 text-xs leading-6 text-muted">{c.caveat}</p>
    <p className="mt-3 text-xs leading-6 text-muted">{c.data}</p>
    <p className="mt-3 text-xs leading-6 text-muted">{c.disclose}</p>
  </section>;
}
function Overlap({locale,overlap}:{locale:Locale;overlap:PatternOverlap|null}){
  const c=patternCopy(locale);
  return <section className="ms-card p-4 sm:p-6">
    <div className="flex items-center gap-2"><GitCompareArrows size={20} className="text-accent" aria-hidden/><h2 className="text-lg font-extrabold">{c.ai}</h2></div>
    <p className="mt-2 text-xs leading-6 text-muted">{c.aiSub}</p>
    {!overlap||overlap.total===0?<p className="mt-4 rounded-xl bg-panel-2 p-4 text-sm leading-6 text-muted">{c.aiEmpty}</p>:
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="border-b border-line text-muted"><tr>
            <th className="px-3 py-3">{c.aiModel}</th>
            <th className="px-3 py-3 text-right">{c.agree}</th>
            <th className="px-3 py-3 text-right">{c.oppose}</th>
            <th className="px-3 py-3 text-right">{c.neutral}</th>
          </tr></thead>
          <tbody>{overlap.rows.map(row=><tr key={row.modelId} className="border-b border-line last:border-0">
            <th scope="row" className="px-3 py-3 font-bold">{row.model}</th>
            <td className="px-3 py-3 text-right tabular">{row.agreement}</td>
            <td className="px-3 py-3 text-right tabular">{row.opposition}</td>
            <td className="px-3 py-3 text-right tabular">{row.hold}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    <p className="mt-3 text-[11px] text-muted">{c.note}</p>
  </section>;
}
export function PatternUnavailable({locale}:{locale:Locale}){
  const c=patternCopy(locale);
  return <div className="mx-auto max-w-6xl space-y-5 pb-12">
    <Head locale={locale}/>
    <div className="ms-card p-6">
      <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-accent" aria-hidden/><h2 className="text-lg font-bold">{c.noData}</h2></div>
      <p className="mt-2 text-sm leading-7 text-muted">{c.noDataHelp}</p>
    </div>
    <section className="grid gap-3 sm:grid-cols-2">
      {PATTERNS.map(p=><article key={p.id} className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="text-sm font-extrabold">{patternDetail(locale,p.id).name}</h3>
        <p className="mt-2 text-xs leading-6 text-muted">{patternDetail(locale,p.id).rule}</p>
      </article>)}
    </section>
    <Method locale={locale}/><AllWeather locale={locale}/>
  </div>;
}
export function PatternDashboard({locale,data}:{locale:Locale;data:PublicPatternLab}){
  const c=patternCopy(locale);
  return <div className="mx-auto max-w-6xl space-y-5 pb-12">
    <Head locale={locale}/><Overview locale={locale} study={data.study}/>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="ms-kicker mb-2">PATTERN / OBSERVATIONS</p>
        <h2 className="text-xl font-extrabold">{c.explore}</h2></div>
      <p className="text-xs text-muted">{c.snapshot}: {data.study.dataTo}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.study.patterns.map(p=><SummaryCard key={p.id} locale={locale} pattern={p}/>)}
    </div>
    <AllWeather locale={locale}/>
    <Method locale={locale}/>
    <p className="text-xs leading-6 text-muted">{c.note}</p>
  </div>;
}
export function PatternDetailDashboard({locale,data,id}:{locale:Locale;data:PublicPatternLab;id:PatternId}){
  const c=patternCopy(locale),detail=patternDetail(locale,id);
  const p=data.study.patterns.find(p=>p.id===id);
  if(!p)return <PatternUnavailable locale={locale}/>;
  const overlap=data.aiOverlap?.find(row=>row.id===id)??null;
  return <div className="mx-auto max-w-5xl space-y-5 pb-12">
    <Link href={localizedHref(locale,"/patterns")}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline">
      <ArrowLeft size={17} aria-hidden/>{c.back}
    </Link>
    <Head locale={locale} detail={id}/>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label={c.snapshot} value={data.study.dataTo}/>
      <Stat label={c.occurrences} value={p.occurrences}/>
      <Stat label={c.recent} value={p.recentFiveSessions}/>
      <Stat label={c.last} value={p.lastDate??"—"}/>
    </div>
    <section className="ms-card p-5 sm:p-6">
      <div className="flex items-center gap-2"><Layers3 size={19} className="text-accent" aria-hidden/><h2 className="text-lg font-extrabold">{c.detail}</h2></div>
      <p className="mt-3 text-sm leading-7 text-muted">{detail.intro}</p>
      <h3 className="mt-5 text-sm font-bold">{c.formula}</h3>
      <p className="mt-2 rounded-xl bg-panel-2 p-4 text-sm leading-7 text-muted">{detail.rule}</p>
      <h3 className="mt-5 text-sm font-bold">{c.caution}</h3>
      <p className="mt-2 text-sm leading-7 text-muted">{detail.limitation}</p>
    </section>
    <section className="ms-card p-5 sm:p-6">
      <div className="flex items-center gap-2"><Clock3 size={19} className="text-accent" aria-hidden/><h2 className="text-lg font-extrabold">{c.qualified}</h2></div>
      <p className="mt-2 text-xs leading-6 text-muted">{c.interpretText}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {p.horizons.map(row=><HorizonBox key={row.horizon} row={row} locale={locale}/>)}
      </div>
    </section>
    <Overlap locale={locale} overlap={overlap}/>
    <Method locale={locale}/>
    <div className="flex flex-wrap gap-3">
      <Link href={localizedHref(locale,"/historical")}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-bold text-accent">
        {c.links}<ArrowUpRight size={16} aria-hidden/>
      </Link>
    </div>
  </div>;
}
export function PatternLabTeaser({locale}:{locale:Locale}){
  const c=patternCopy(locale);
  return <Link href={localizedHref(locale,"/patterns")}
    className="group flex min-h-[100px] items-center gap-3 rounded-2xl border border-accent/25 bg-panel px-4 py-4 transition hover:border-accent/50 hover:bg-panel-2 sm:px-5">
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
      <ChartNoAxesCombined size={23} aria-hidden/>
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] font-bold tracking-widest text-accent">PATTERN LAB / RESEARCH</span>
      <strong className="mt-1 block text-[15px] font-extrabold">{c.teaser}</strong>
      <span className="mt-1 block text-xs leading-5 text-muted">{c.teaserSub}</span>
    </span>
    <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-accent">
      <span className="hidden sm:inline">{c.teaserAction}</span>
      <ArrowRight size={19} aria-hidden/>
    </span>
  </Link>;
}
