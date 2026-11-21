import { sectionLabel } from "@/lib/section-labels";
import Link from "next/link";
import { ArrowRight, BookOpenText, Database, ShieldAlert } from "lucide-react";
import { ReturnChart, type LineInput } from "./charts";
import { ChartLegend } from "./chart-legend";
import { HISTORICAL_PROFILES, FEATURES, type HistoricalStudy, type Feature } from "@/lib/historical-strategy";
import { historicalCopy } from "@/lib/historical-copy";
import type { Locale } from "@/lib/public-content";
import { localizedHref } from "@/lib/i18n";

const names=(c:ReturnType<typeof historicalCopy>):Record<string,string>=>({
  balanced:c.balanced,momentum:c.momentum,defensive:c.defensive,spy:c.spy,equal:c.equal,
});
const featureLabels=(c:ReturnType<typeof historicalCopy>):Record<Feature,string>=>({
  momentum:c.momentumFeature,relative:c.relativeFeature,
  lowVol:c.lowVolFeature,volume:c.volumeFeature,lowDrawdown:c.lowDdFeature,
});
const pct=(n:number)=>(n>0?"+":"")+n.toFixed(2)+"%";
const tone=(n:number)=>n>0?"text-up":n<0?"text-down":"text-fg";

function Head({locale}:{locale:Locale}){
  const c=historicalCopy(locale);
  return <header className="insight-banner space-y-4 px-5 py-7 sm:px-8 sm:py-10">
    <p className="hero-eyebrow"><span className="hero-signal" aria-hidden/>{c.strap}</p>
    <h1 className="max-w-3xl text-[27px] font-extrabold leading-tight tracking-[-.04em] text-white sm:text-4xl">{c.headline}</h1>
    <p className="max-w-3xl text-sm leading-7 text-[#c5d3ef]">{c.sub}</p>
    <span className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-[#e5eefa]">
      <ShieldAlert size={15} className="text-[#cbfa81]" aria-hidden/>{c.notice}
    </span>
  </header>;
}
function Title({title,sub}:{title:string;sub:string}){
  return <div className="mb-4">
    <p className="ms-kicker mb-2">{sectionLabel(locale,"historicalResearch")}</p>
    <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
    <p className="mt-1 text-xs leading-6 text-muted">{sub}</p>
  </div>;
}
function Method({locale}:{locale:Locale}){
  const c=historicalCopy(locale);
  return <div className="grid gap-4 lg:grid-cols-2">
    <section className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold"><BookOpenText size={18} className="text-accent"/>{c.method}</h2>
      <ol className="mt-3 space-y-3 text-xs leading-6 text-muted">
        <li>01. {c.method1}</li><li>02. {c.method2}</li><li>03. {c.method3}</li>
      </ol>
    </section>
    <section className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} className="text-accent"/>{c.limitations}</h2>
      <div className="mt-3 space-y-3 text-xs leading-6 text-muted">
        <p>{c.bias}</p><p>{c.hindsight}</p><p>{c.license}</p>
      </div>
    </section>
  </div>;
}
export function HistoricalUnavailable({locale}:{locale:Locale}){
  const c=historicalCopy(locale);
  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <Head locale={locale}/>
    <div className="rounded-2xl border border-line bg-panel p-6">
      <p className="text-base font-semibold">{c.unavailable}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{c.unavailableInfo}</p>
    </div>
    <Method locale={locale}/>
  </div>;
}
export function HistoricalDashboard({locale,study}:{locale:Locale;study:HistoricalStudy}){
  const c=historicalCopy(locale),label=names(c),features=featureLabels(c);
  const spy=study.results.find(r=>r.id==="spy");
  const strategies=HISTORICAL_PROFILES.map(p=>study.results.find(r=>r.id===p.id)).filter(
    (x):x is HistoricalStudy["results"][number]=>Boolean(x)
  );
  const strongest=strategies.slice().sort((a,b)=>b.returnPct-a.returnPct)[0];
  const lines:LineInput[]=study.results.map(r=>({
    name:label[r.id]??r.id,
    color:HISTORICAL_PROFILES.find(p=>p.id===r.id)?.color??(r.id==="spy"?"#9ca3af":"#eab308"),
    dashed:r.id==="spy"||r.id==="equal",
    data:r.curve.map(point=>({time:point.time,value:point.value})),
  }));
  return <div className="mx-auto max-w-6xl space-y-6 pb-12">
    <Head locale={locale}/>
    <section className="ms-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Database size={17} className="text-accent" aria-hidden/>{c.status}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [c.samples,study.inputSessions.toLocaleString("en-US")],
          [c.sessions,study.analysisSessions.toLocaleString("en-US")],
          [c.members,String(study.eligibleSymbols)],
          [c.dateAsOf,study.lastDataAsOf],
        ].map(([k,v])=><div key={k} className="rounded-xl bg-panel-2 px-3 py-3">
          <p className="text-[11px] leading-5 text-muted">{k}</p>
          <p className="mt-1 text-base font-bold tabular">{v}</p>
        </div>)}
      </div>
      <p className="mt-3 text-xs text-muted">{c.period}: {study.start} – {study.end} · {c.lookback}: {study.warmup} · {c.cost}: {study.costBps}bp</p>
    </section>
    <section>
      <Title title={c.study} sub={c.studySub}/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        aria-label={c.study}>
        {strategies.map(r=><article key={r.id} className="ms-card ms-card-hover min-w-0 p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{background:HISTORICAL_PROFILES.find(p=>p.id===r.id)?.color}}/>
            <h3 className="text-sm font-bold">{label[r.id]}</h3>
          </div>
          <p className="mt-3 text-[11px] text-muted">{c.total}</p>
          <p className={"mt-0.5 text-3xl font-bold tabular "+tone(r.returnPct)}>{pct(r.returnPct)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
            <div><p className="text-muted">{c.mdd}</p><p className="mt-1 font-semibold tabular">{pct(r.drawdownPct)}</p></div>
            <div><p className="text-muted">{c.vol}</p><p className="mt-1 font-semibold tabular">{pct(r.volatilityPct)}</p></div>
            <div><p className="text-muted">{c.excess}</p><p className="mt-1 font-semibold tabular">{spy?pct(r.returnPct-spy.returnPct):"—"}</p></div>
            <div><p className="text-muted">{c.rebalances}</p><p className="mt-1 font-semibold tabular">{r.rebalanceCount}</p></div>
          </div>
        </article>)}
      </div>
      <p className="mt-1 text-right text-[11px] text-muted sm:hidden">{c.swipe}</p>
      {strongest&&<p className="mt-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-xs leading-6 text-muted">
        {c.lead} <span className="font-semibold text-fg">{label[strongest.id]}</span> {c.leaderSuffix}
      </p>}
    </section>
    <section className="ms-card p-4 sm:p-5">
      <Title title={c.curves} sub={c.curvesSub}/>
      <ReturnChart lines={lines} height={285} locale={locale}/>
      <ChartLegend lines={lines} locale={locale}/>
    </section>
    <section>
      <Title title={c.profiles} sub={c.profilesSub}/>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 scrollbar-none lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0"
        aria-label={c.profiles} tabIndex={0}>
        {HISTORICAL_PROFILES.map(p=><article key={p.id} className="w-[81vw] max-w-[315px] shrink-0 snap-start rounded-2xl border border-line bg-panel px-4 py-5 lg:w-auto lg:max-w-none lg:shrink">
          <h3 className="font-semibold">{label[p.id]}</h3>
          <p className="mt-1 text-xs text-muted">
            {p.id==="balanced"?c.balancedDesc:p.id==="momentum"?c.momentumDesc:c.defensiveDesc}
          </p>
          <dl className="mt-4 space-y-3">
            {FEATURES.map(key=><div key={key}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <dt className="text-muted">{features[key]}</dt>
                <dd className="font-semibold tabular">{p.weights[key]}%</dd>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full" style={{width:p.weights[key]+"%",background:p.color}}/>
              </div>
            </div>)}
          </dl>
        </article>)}
      </div>
      <p className="mt-1 text-right text-[11px] text-muted lg:hidden">{c.swipe}</p>
    </section>
    <section className="ms-card p-4 sm:p-5">
      <Title title={c.comparison} sub={c.separate}/>
      <div className="space-y-2 sm:hidden">
        {study.results.map(r=><article key={r.id} className="rounded-xl border border-line bg-panel-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold">{label[r.id]}</h3>
            <p className={"text-lg font-extrabold tabular "+tone(r.returnPct)}>{pct(r.returnPct)}</p>
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <div><dt className="text-muted">{c.mdd}</dt><dd className="mt-1 font-semibold tabular">{pct(r.drawdownPct)}</dd></div>
            <div><dt className="text-muted">{c.vol}</dt><dd className="mt-1 font-semibold tabular">{pct(r.volatilityPct)}</dd></div>
          </dl>
        </article>)}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[470px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-3 pr-3">{c.study}</th><th className="px-3 text-right">{c.total}</th>
            <th className="px-3 text-right">{c.mdd}</th><th className="py-3 pl-3 text-right">{c.vol}</th>
          </tr></thead>
          <tbody>{study.results.map(r=><tr key={r.id} className="border-b border-line/60">
            <td className="py-3 pr-3 font-semibold">{label[r.id]}</td>
            <td className={"px-3 text-right tabular "+tone(r.returnPct)}>{pct(r.returnPct)}</td>
            <td className="px-3 text-right tabular">{pct(r.drawdownPct)}</td>
            <td className="py-3 pl-3 text-right tabular">{pct(r.volatilityPct)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <Method locale={locale}/>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 p-4">
      <p className="max-w-2xl text-xs leading-6 text-muted">{c.proof}</p>
      <Link href={localizedHref(locale,"/")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold hover:border-accent">
        {c.cta}<ArrowRight size={15} aria-hidden/>
      </Link>
    </div>
  </div>;
}
