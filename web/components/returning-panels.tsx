import Link from "next/link";
import { ArrowRight, Activity, CalendarClock, Clock3, GitCompareArrows, History, ShieldCheck } from "lucide-react";
import type { Dataset } from "@/lib/types";
import type { FollowupSignal, FollowupHorizon } from "@/lib/retention-analytics";
import {
  decisionRevisions, followupScorecard, latestPortfolioMoves, publicationPulse,
  recentRoundJournal, recentlyResolvedOutcomes,
} from "@/lib/returning-analytics";
import { returningCopy } from "@/lib/returning-copy";
import { localizedHref } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

const percent=(n:number,locale:Dataset["locale"])=>
  new Intl.NumberFormat(locale==="zh"?"zh-CN":locale,{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);

function Jump({d,to,label}:{d:Dataset;to:string;label:string}){
  return <Link href={localizedHref(d.locale,to)}
    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs font-bold text-accent hover:border-accent/60">
    {label}<ArrowRight size={15} aria-hidden/>
  </Link>;
}
function Direction({value,d}:{value:"BUY"|"SELL"|"HOLD";d:Dataset}){
  const c=returningCopy(d.locale);
  return <Badge variant={value==="BUY"?"up":value==="SELL"?"down":"muted"}>
    {value==="BUY"?c.buy:value==="SELL"?c.sell:c.hold}
  </Badge>;
}


/** Universe reservations are visible immediately, even before any AI round exists. */
export function UniverseChangeJournal({d}:{d:Dataset}){
  const events=d.universeChanges??[];
  return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-label="Stock universe change announcements">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold">Stock universe changes</h2>
      <span className="text-xs text-muted">Published before the effective round</span>
    </div>
    {!events.length?<p className="mt-3 rounded-xl bg-panel-2 p-3 text-sm text-muted">No scheduled changes.</p>
    :<ol className="mt-4 space-y-3">{events.map(event=><li key={event.id} className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-lg px-2 py-1 text-xs font-bold ${event.action==="add"?"bg-up/10 text-up":"bg-down/10 text-down"}`}>
          {event.action==="add"?"ADD":"REMOVE"}
        </span>
        <strong className="text-sm">{event.symbol}</strong>
        <span className="ml-auto rounded-lg border border-line px-2 py-1 text-[11px] text-muted">
          {event.status==="applied"?"Applied":"Scheduled"}
        </span>
      </div>
      <p className="mt-2 break-words text-sm text-fg">{event.reason}</p>
      <div className="mt-3 grid gap-1 text-xs leading-5 text-muted sm:grid-cols-2">
        <span>Announced: <time dateTime={event.scheduledAt}>{event.scheduledAt.replace("T"," ").slice(0,16)} UTC</time></span>
        <span>Effective round: <time dateTime={event.effectiveSession}>{event.effectiveSession}</time></span>
        {event.appliedAt&&<span>Applied: <time dateTime={event.appliedAt}>{event.appliedAt.replace("T"," ").slice(0,16)} UTC</time></span>}
        {event.appliedRoundId!==null&&<span>Round ID: {event.appliedRoundId}</span>}
      </div>
    </li>)}</ol>}
  </section>;
}

/** First screen: recorded publication and valuation freshness, not 'live' marketing copy. */
export function ReturnVisitPulse({d}:{d:Dataset}){
  const p=publicationPulse(d),c=returningCopy(d.locale);
  const status=p.latestRoundStatus==="settled"?c.settled
    :p.latestRoundStatus==="decided"?c.decided
    :p.latestRoundStatus==="aborted"?c.aborted
    :p.latestRoundStatus?c.awaiting:c.notStarted;
  const next=p.latestRoundStatus==="settled"?c.afterSettle
    :p.latestRoundStatus==="decided"?c.afterDecision
    :p.latestRoundStatus==="aborted"?c.afterAbort:c.beforeStart;
  return <section className="rounded-2xl border border-line bg-panel px-4 py-4 sm:px-6" aria-label={c.pulse}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-accent" aria-hidden/>
        <div><h2 className="text-sm font-bold sm:text-base">{c.pulse}</h2>
          <p className="mt-0.5 text-[11px] text-muted">{c.source}</p></div>
      </div>
      <Badge variant={p.latestRoundStatus==="aborted"?"down":"outline"}>{status}</Badge>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        [c.lastPublished,p.latestPublishedDate??"—"],
        [c.lastValuation,p.latestValuation??"—"],
        [c.verifiedModels,p.latestPublishedDate?`${p.verifiedModels}/${p.totalModels}`:"—"],
        [c.rounds,String(p.publishedRounds)],
      ].map(([label,value])=><div key={label} className="min-w-0 rounded-xl bg-panel-2 px-3 py-3">
        <p className="text-[11px] leading-4 text-muted">{label}</p>
        <p className="mt-1 break-words text-base font-extrabold tabular">{value}</p>
      </div>)}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <p className="max-w-2xl leading-6 text-muted"><span className="font-semibold text-fg">{c.followup}:</span> {next}</p>
      <Jump d={d} to="/journal" label={c.diaryLink}/>
    </div>
    {!p.latestSession&&<p className="mt-3 text-xs text-muted">{c.scheduled}: <time dateTime={p.startSession}>{p.startSession}</time></p>}
  </section>;
}

/** A narrative that literally compares each model's explicit adjacent-round votes. */
export function DecisionRevisionPanel({d,compact=false}:{d:Dataset;compact?:boolean}){
  const c=returningCopy(d.locale);
  const revisions=decisionRevisions(d,compact?4:12);
  const official=d.rounds.filter(r=>r.status==="settled"||r.status==="decided").length;
  return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-label={c.today}>
    <div className="flex items-center gap-2"><GitCompareArrows size={19} className="text-accent" aria-hidden/>
      <h2 className="text-lg font-bold">{c.today}</h2></div>
    <p className="mt-2 text-xs leading-6 text-muted">{c.changesSub}</p>
    {revisions.length===0?<p className="mt-4 rounded-xl bg-panel-2 px-4 py-4 text-sm text-muted">
      {official<2?c.needsTwo:c.noChanges}
    </p>:<ul className="mt-4 grid gap-2 lg:grid-cols-2">
      {revisions.map(x=><li key={x.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-3">
        <div className="mr-auto min-w-[100px]">
          <strong className="text-sm">{x.symbol}</strong>
          <p className="mt-0.5 text-[11px] text-muted">{x.model} · {x.previousDate} → {x.currentDate}</p>
        </div>
        <Direction value={x.from} d={d}/><span className="text-xs text-muted">→</span><Direction value={x.to} d={d}/>
      </li>)}
    </ul>}
    {compact&&<div className="mt-4"><Jump d={d} to="/journal" label={c.diaryLink}/></div>}
  </section>;
}

export function PortfolioMovement({d,compact=false}:{d:Dataset;compact?:boolean}){
  const c=returningCopy(d.locale),moves=latestPortfolioMoves(d);
  return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-label={c.movement}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">{c.movement}</h2>
        <p className="mt-2 text-xs leading-6 text-muted">{c.movementSub}</p></div>
      {moves[0]&&<time className="text-xs text-muted" dateTime={moves[0].date}>{moves[0].date}</time>}
    </div>
    {!moves.length?<p className="mt-4 rounded-xl bg-panel-2 p-4 text-sm text-muted">{c.noMovement}</p>
    :<ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {moves.map(x=><li key={x.aiId} className="flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:x.color}} aria-hidden/>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{x.name}</span>
        <span className={`text-sm font-extrabold tabular ${x.dailyReturn>0?"text-up":x.dailyReturn<0?"text-down":"text-muted"}`}>
          {x.dailyReturn>0?"+":""}{percent(x.dailyReturn,d.locale)}
        </span>
      </li>)}
    </ul>}
    {compact&&<div className="mt-4"><Jump d={d} to="/performance" label={c.portfolioMore}/></div>}
  </section>;
}

export function RoundJournalPanel({d,compact=false}:{d:Dataset;compact?:boolean}){
  const c=returningCopy(d.locale),rounds=recentRoundJournal(d,compact?4:d.rounds.length);
  return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-label={c.diary}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><History size={18} className="text-accent" aria-hidden/>
          <h2 className="text-lg font-bold">{c.diary}</h2></div>
        <p className="mt-2 text-xs leading-6 text-muted">{c.diarySub}</p></div>
      {compact&&<Jump d={d} to="/journal" label={c.diaryLink}/>}
    </div>
    {!rounds.length?<p className="mt-4 rounded-xl bg-panel-2 px-4 py-5 text-sm text-muted">{c.noSessions} · {d.experiment.startSession}</p>
    :<ol className="mt-4 space-y-2">
      {rounds.map(x=><li id={"round-"+x.date} key={x.id} className="rounded-xl border border-line bg-panel-2 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock size={15} className="text-muted" aria-hidden/>
            <time dateTime={x.date} className="text-sm font-extrabold tabular">{x.date}</time>
            <span className="text-[10px] text-muted">{c.marketCutoff}: {x.dataAsOf}</span>
          </div>
          <Badge variant={x.status==="aborted"?"down":x.status==="settled"?"outline":"muted"}>
            {x.status==="aborted"?c.aborted:x.status==="settled"?c.settled:c.decided}
          </Badge>
        </div>
        {x.status!=="aborted"&&<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>{c.models}: <strong className="text-fg">{x.models}/{x.totalModels}</strong></span>
          <span>{c.votes}: <strong className="text-fg">{x.buy}/{x.sell}/{x.hold}</strong></span>
          <span>{c.trades}: <strong className="text-fg">{x.trades}</strong></span>
        </div>}
      </li>)}
    </ol>}
    {!compact&&<p className="mt-4 text-xs leading-6 text-muted">{c.notInvestmentAdvice}</p>}
  </section>;
}

export function ModelOutcomeScorecard({d,signals}:{d:Dataset;signals:FollowupSignal[]}){
  const c=returningCopy(d.locale);
  const horizons:[FollowupHorizon,string][]=[[1,c.h1],[5,c.h5],[20,c.h20]];
  return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-label={c.scorecard}>
    <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-accent" aria-hidden/><h2 className="text-lg font-bold">{c.scorecard}</h2></div>
    <p className="mt-2 text-xs leading-6 text-muted">{c.scoreSub}</p>
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      {horizons.map(([horizon,label])=>{
        const rows=followupScorecard(d,signals,horizon);
        return <div key={horizon} className="rounded-xl border border-line bg-panel-2 p-3">
          <h3 className="mb-3 text-sm font-extrabold">{label}</h3>
          <ul className="space-y-2">
            {rows.map(row=><li key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel px-3 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:row.color}} aria-hidden/>
                <span className="truncate text-xs font-semibold">{row.name}</span>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-extrabold tabular">{row.hits}/{row.samples}</span>
                <p className="text-[10px] text-muted">
                  {row.qualified&&row.hitRate!==null?percent(row.hitRate,d.locale):row.samples?c.insufficient:c.none}
                </p>
              </div>
            </li>)}
          </ul>
        </div>;
      })}
    </div>
    <p className="mt-3 text-xs text-muted">{c.samples}: {c.qualified}. {c.notInvestmentAdvice}</p>
  </section>;
}

export function RecentResolvedPanel({d,signals}:{d:Dataset;signals:FollowupSignal[]}){
  const c=returningCopy(d.locale),latest=recentlyResolvedOutcomes(signals);
  return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-label={c.recently}>
    <div className="flex items-center gap-2"><Clock3 size={19} className="text-accent" aria-hidden/><h2 className="text-lg font-bold">{c.recently}</h2></div>
    <p className="mt-2 text-xs leading-6 text-muted">{c.recentlySub}</p>
    {!latest.length?<p className="mt-4 rounded-xl bg-panel-2 p-4 text-sm text-muted">{c.none}</p>
    :<ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {latest.map(item=><li key={item.id} className="rounded-xl border border-line bg-panel-2 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-extrabold">{item.symbol}</span>
          <span className="text-xs text-muted">{item.aiName}</span>
          <Direction value={item.side} d={d}/>
          <span className="ml-auto text-[11px] font-semibold">{item.verdict==="hit"?c.hit:item.verdict==="miss"?c.miss:c.flat}</span>
        </div>
        <p className="mt-2 text-[11px] text-muted">{c.issuedOn}: {item.decisionDate} · {item.horizon===1?c.h1:item.horizon===5?c.h5:c.h20}</p>
        <p className="mt-1 text-[11px] text-muted">{c.observedOn}: <time dateTime={item.observedDate}>{item.observedDate}</time></p>
      </li>)}
    </ul>}
    <div className="mt-4"><Jump d={d} to="/outcomes" label={c.viewOutcomes}/></div>
  </section>;
}
