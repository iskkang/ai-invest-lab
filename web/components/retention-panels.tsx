import Link from "next/link";
import { ArrowRight, CalendarDays, GitCompareArrows, History, ShieldCheck } from "lucide-react";
import { dailyBrief, followupInputs, rankedDisagreements, type FollowupSignal, type FollowupVerdict } from "@/lib/retention-analytics";
import { retentionCopy } from "@/lib/retention-copy";
import { sectionLabel } from "@/lib/section-labels";
import { compareLatestRound, verifiedDecisions } from "@/lib/insight-analytics";
import { localizedDecisionText, localizedHref } from "@/lib/i18n";
import type { Dataset } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/blocks";

function Action({side,locale}:{
  side:"BUY"|"SELL"|"HOLD";locale:Dataset["locale"]
}) {
  const c=retentionCopy(locale);
  return <Badge variant={side==="BUY"?"up":side==="SELL"?"down":"muted"}>
    {side==="BUY"?c.buy:side==="SELL"?c.sell:c.hold}
  </Badge>;
}
function EndLink({d,to,label}:{d:Dataset;to:string;label:string}){
  return <Link href={localizedHref(d.locale,to)}
    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/50">
    {label}<ArrowRight size={16} aria-hidden/>
  </Link>;
}
function EmptyBrief({d}:{d:Dataset}){
  const c=retentionCopy(d.locale);
  return <div className="rounded-2xl border border-dashed border-line bg-panel-2 px-4 py-5 sm:px-6">
    <p className="font-semibold">{c.awaiting}</p>
    <p className="mt-2 text-sm leading-6 text-muted">{c.awaitingBody}</p>
    <p className="mt-3 text-xs text-muted">{c.start}: <time dateTime={d.experiment.startSession}>{d.experiment.startSession}</time></p>
    <div className="mt-4"><EndLink d={d} to="/historical" label={c.openHistory}/></div>
  </div>;
}

/** The first thing return visitors see. Every word of model reasoning comes
 * from a verified, stored decision, never a newly generated news blurb. */
export function DailyBriefing({d,compact=false}:{d:Dataset;compact?:boolean}) {
  const c=retentionCopy(d.locale),brief=dailyBrief(d);
  return <section className="ms-card overflow-hidden" aria-label={c.daily}>
    <div className="border-b border-line bg-panel-2/60 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ms-kicker mb-2">{sectionLabel(d.locale,"dailyLab")}</p>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{c.daily}</h2>
          <p className="mt-2 text-xs leading-5 text-muted sm:text-sm">{c.dailySub}</p>
        </div>
        <Badge variant="outline">{c.verified}</Badge>
      </div>
      {brief.date&&<div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <span>{c.latest}: <time className="font-semibold text-fg" dateTime={brief.date}>{brief.date}</time></span>
        {brief.dataAsOf&&<span>{c.sourceDay}: <time dateTime={brief.dataAsOf}>{brief.dataAsOf}</time></span>}
      </div>}
    </div>
    <div className="p-4 sm:p-6">
      {!brief.date?<EmptyBrief d={d}/>:<>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {[
            [c.models,String(brief.participants)+"/"+brief.total],
            [c.buys,brief.buy],[c.sells,brief.sell],[c.holds,brief.hold],
          ].map(([label,value])=><div key={label} className="rounded-xl bg-panel-2 px-2 py-3 text-center sm:px-4">
            <p className="text-[10px] text-muted sm:text-xs">{label}</p>
            <p className="mt-1 text-lg font-extrabold tabular sm:text-xl">{value}</p>
          </div>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {brief.models.map(model=><article key={model.id} className="rounded-xl border border-line bg-panel px-3 py-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:model.color}} aria-hidden/>
              {model.name}
              {!model.participated&&<Badge variant="muted">{c.noVerdict}</Badge>}
            </div>
            <p className={"mt-2 text-xs leading-5 text-muted sm:text-sm sm:leading-6 "+(compact?"line-clamp-3":"")}>
              {model.participated
                ?model.summary?localizedDecisionText(d.locale,model.summary):c.noSummary
                :c.missing}
            </p>
          </article>)}
        </div>
        {brief.disagreements.length>0&&<div className="mt-4 rounded-xl bg-panel-2 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><GitCompareArrows size={15} className="text-accent" aria-hidden/>{c.conflict}</div>
          <p className="mt-2 text-sm leading-6">
            {brief.disagreements.slice(0,compact?2:5).map(row=>row.symbol).join(" · ")}
          </p>
        </div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {compact&&<EndLink d={d} to="/daily" label={c.viewDaily}/>}
          <EndLink d={d} to="/consensus" label={c.viewCompare}/>
        </div>
      </>}
    </div>
  </section>;
}

export function TopConflicts({d,compact=false}:{d:Dataset;compact?:boolean}) {
  const c=retentionCopy(d.locale),comparison=compareLatestRound(d);
  const top=rankedDisagreements(comparison.disagreements).slice(0,5);
  return <section aria-label={c.conflict} className="space-y-3">
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="ms-kicker mb-2">{sectionLabel(d.locale,"differenceEngine")}</p>
        <h2 className="text-xl font-extrabold tracking-tight">{c.conflict}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">{c.conflictSub}</p>
      </div>
      {comparison.date&&<time className="text-xs text-muted" dateTime={comparison.date}>{comparison.date}</time>}
    </header>
    {!comparison.date?<div className="rounded-xl border border-line bg-panel p-5 text-sm text-muted">{c.awaiting}</div>
    :!top.length?<div className="rounded-xl border border-line bg-panel p-5 text-sm text-muted">{c.noConflict}</div>
    :<div className="grid gap-3 lg:grid-cols-2">
      {top.slice(0,compact?3:5).map((row,index)=><article key={row.symbol} className="rounded-xl border border-line bg-panel p-4">
        <div className="flex items-start justify-between gap-2">
          <div><span className="text-[11px] font-bold text-accent">#{index+1}</span>
            <h3 className="mt-1 text-base font-bold">{row.symbol}
              <span className="ml-2 text-xs font-normal text-muted">{row.company}</span>
            </h3>
          </div>
          <span className="text-[11px] text-muted">{row.votes.length} {c.explicit}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {row.votes.map(vote=><li key={vote.aiId} className="flex items-start justify-between gap-2 rounded-lg bg-panel-2 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold">{vote.aiName}</p>
              {!compact&&vote.reason&&<p className="mt-1 text-xs leading-5 text-muted">{localizedDecisionText(d.locale,vote.reason)}</p>}
            </div>
            <Action side={vote.action} locale={d.locale}/>
          </li>)}
        </ul>
      </article>)}
    </div>}
    {compact&&<EndLink d={d} to="/consensus" label={c.viewCompare}/>}
  </section>;
}

export function FollowupsPreview({d}:{d:Dataset}){
  const c=retentionCopy(d.locale),inputs=followupInputs(d);
  const settled=new Set(d.rounds.filter(r=>r.status==="settled").map(r=>r.id));
  const total=verifiedDecisions(d).filter(dec=>settled.has(dec.roundId))
    .reduce((n,dec)=>n+dec.actions.filter(a=>
      (a.action==="BUY"||a.action==="SELL")&&a.quantity>0).length,0);
  return <section className="ms-card px-4 py-5 sm:px-6" aria-label={c.followups}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="ms-kicker mb-2">{sectionLabel(d.locale,"decisionFollowup")}</p>
        <h2 className="text-xl font-extrabold tracking-tight">{c.followups}</h2>
        <p className="mt-2 max-w-xl text-xs leading-6 text-muted sm:text-sm">{c.followupsSub}</p>
      </div>
      <History size={24} className="text-accent" aria-hidden/>
    </div>
    <div className="mt-4 rounded-xl bg-panel-2 p-4">
      {!inputs.since?<p className="text-sm leading-6 text-muted">{c.followupsEmpty}</p>
      :<div className="flex flex-wrap items-center gap-4">
        <span className="text-2xl font-bold tabular">{total}</span>
        <span className="text-xs text-muted">{c.observations} · 1 / 5 / 20 {c.sessions}</span>
      </div>}
    </div>
    <div className="mt-4"><EndLink d={d} to="/outcomes" label={c.viewFollowups}/></div>
  </section>;
}
function Verdict({verdict,locale}:{verdict:FollowupVerdict;locale:Dataset["locale"]}){
  const c=retentionCopy(locale);
  const label=verdict==="hit"?c.hit:verdict==="miss"?c.miss:verdict==="flat"?c.flat:verdict==="pending"?c.pending:c.unavailable;
  return <span className={"inline-block rounded-md px-2 py-1 text-[11px] font-semibold "+(
    verdict==="hit"?"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400":
    verdict==="miss"?"bg-rose-500/10 text-rose-600 dark:text-rose-400":"bg-panel-2 text-muted"
  )}>{label}</span>;
}
export function FollowupsPage({d,signals}:{d:Dataset;signals:FollowupSignal[]}) {
  const c=retentionCopy(d.locale);
  const matured=signals.filter(s=>s.observed[0].verdict==="hit"||
    s.observed[0].verdict==="miss"||s.observed[0].verdict==="flat").length;
  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl border border-line bg-panel p-5 sm:p-7">
      <p className="ms-kicker mb-3">{sectionLabel(d.locale,"decisionTracker")}</p>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{c.followups}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{c.followupsSub}</p>
      <Badge variant="outline" className="mt-4">{c.verified}</Badge>
    </header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[[c.observations,signals.length],[c.evaluated,matured],[c.waiting,signals.length-matured]].map(([label,value])=>
      <div key={label} className="rounded-xl border border-line bg-panel p-4">
        <p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-extrabold tabular">{value}</p>
      </div>)}
    </div>
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-accent" aria-hidden/>{c.learn}</div>
      <p className="mt-2 text-xs leading-6 text-muted">{c.method}</p>
      <p className="mt-2 text-xs leading-6 text-muted">{c.caution}</p>
    </div>
    <Section title={c.latestResults}>
      {!signals.length?<div className="py-5">
        <p className="text-sm leading-6 text-muted">{c.followupsEmpty}</p>
        <div className="mt-4"><EndLink d={d} to="/historical" label={c.openHistory}/></div>
      </div>
      :<div className="grid gap-3 lg:grid-cols-2">
        {signals.slice(0,100).map(signal=><article key={signal.id} className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor:signal.color}} aria-hidden/>
              <strong className="text-sm">{signal.aiName}</strong>
              <Link href={localizedHref(d.locale,"/stocks/"+signal.symbol)} className="text-sm font-bold text-accent hover:underline">{signal.symbol}</Link>
            </div>
            <Action side={signal.side} locale={d.locale}/>
          </div>
          <p className="mt-2 text-[11px] text-muted">{c.decisionDate}: <time dateTime={signal.sessionDate}>{signal.sessionDate}</time></p>
          {signal.reason&&<p className="mt-3 line-clamp-3 text-xs leading-5 text-muted">{localizedDecisionText(d.locale,signal.reason)}</p>}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
            {signal.observed.map(observation=><div key={observation.horizon} className="text-center">
              <p className="mb-2 text-[10px] text-muted">{observation.horizon} {c.sessions}</p>
              <Verdict verdict={observation.verdict} locale={d.locale}/>
              {observation.date&&<p className="mt-2 text-[10px] text-muted">{observation.date}</p>}
            </div>)}
          </div>
        </article>)}
      </div>}
    </Section>
    {signals.length>100&&<p className="text-xs leading-6 text-muted">{c.recentHundred}</p>}
    <p className="text-xs leading-6 text-muted">{c.updated}</p>
  </div>;
}
