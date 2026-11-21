import engine from "@/lib/engine-methodology.generated.json";
import { methodCopy } from "@/lib/methodology-copy";
import type { ActiveMethodology } from "@/lib/methodology-runtime";
import type { Locale } from "@/lib/public-content";
import { Section } from "./blocks";
import { ModelDisclosure } from "./model-disclosure";

const fmtBp=(value:string|number)=> {
  const bp=Number(value);
  return Number.isFinite(bp) ? bp.toLocaleString("en-US",{maximumFractionDigits:3})
    + " bp ("+(bp/100).toLocaleString("en-US",{maximumFractionDigits:4})+"%)" : "—";
};
const toCurrency=(value:string)=>"$"+Number(value).toLocaleString("en-US",{maximumFractionDigits:0});

function LabelValue({label,value}:{label:string;value:string}){
  return <div className="rounded-xl bg-panel-2 px-3 py-3.5">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="mt-1.5 break-words text-sm font-extrabold tabular">{value}</dd>
  </div>;
}
function TechnicalRow({label,value}:{label:string;value:string}){
  return <div className="flex flex-col gap-1 border-b border-line px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <dt className="text-xs font-semibold">{label}</dt>
    <dd className="font-mono text-xs text-muted tabular">{value}</dd>
  </div>;
}

/** This is descriptive, not user-specific investment advice. The generated
 * snapshot is rebuilt from Python source and CI checks that it never drifts.
 */
export function EngineMethodologyDetails({locale,active}:{locale:Locale;active:ActiveMethodology|null}){
  const c=methodCopy(locale),d=engine.decision,i=engine.indicators;
  const activeModels=new Map(active?.models.map(row=>[row.id,row.model])??[]);
  const indicators=[
    [c.returns,i.returnDays.join(" / ")+" "+c.sessions],
    [c.sma,i.smaDays.join(" / ")+" "+c.sessions],
    [c.ema,i.emaDays.join(" / ")+" "+c.sessions],
    [c.rsi,i.rsiDays+" "+c.sessions],
    [c.macd,[i.macdFast,i.macdSlow,i.macdSignal].join(" / ")],
    [c.volatility,i.volatilityDays+" "+c.sessions],
    [c.annual,i.annualizationSessions+" "+c.sessions],
    [c.maxDrawdown,i.maxDrawdownDays+" "+c.sessions],
    [c.volume,i.volumeChangeDays+" "+c.sessions],
    [c.hiLo,i.highLowDays+" "+c.sessions],
    [c.closes,i.recentClosesDays+" "+c.sessions],
  ];
  return <div className="space-y-4" data-engine-methodology="python-generated">
    <div className="rounded-2xl border border-line bg-panel px-5 py-5 sm:px-6">
      <h2 className="text-lg font-extrabold">{c.title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">{c.scope}</p>
      <p className="mt-2 font-mono text-[11px] text-muted">{engine.source}</p>
    </div>
    <Section title={c.schedule}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <LabelValue label={c.target+" · ET"} value={d.targetET}/>
        <LabelValue label={c.window+" · ET"} value={d.earliestET+"–"+d.cutoffET}/>
        <LabelValue label={c.deadline+" · ET"} value={d.cutoffET}/>
        <LabelValue label={c.target+" · KST / EDT"} value={d.targetKST_EDT}/>
        <LabelValue label={c.summer} value={d.earliestKST_EDT+"–"+d.cutoffKST_EDT+" KST"}/>
        <LabelValue label={c.winter} value={d.earliestKST_EST+"–"+d.cutoffKST_EST+" KST"}/>
        <LabelValue label={c.target+" · KST / EST"} value={d.targetKST_EST}/>
      </dl>
      <dl className="mt-4 space-y-3 text-sm leading-7">
        <div><dt className="font-bold">{c.frequency}</dt><dd className="text-muted">{c.frequencyValue}</dd></div>
        <div><dt className="font-bold">{c.calendar} · {d.calendar}</dt><dd className="text-muted">{c.calendarValue}</dd></div>
      </dl>
      <p className="mt-3 rounded-xl bg-panel-2 p-3 text-sm font-bold leading-6">{c.kstCutoff}</p>
      <p className="mt-2 text-xs leading-6 text-muted">{c.cutoffPolicy}</p>
      <p className="mt-2 rounded-xl bg-panel-2 p-3 text-xs leading-6 text-muted">{c.timingNote}</p>
    </Section>
    <Section title={c.universe}>
      <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-10">
        {engine.universe.map(symbol=><li key={symbol}
          className="rounded-lg border border-line bg-panel-2 px-1.5 py-2.5 text-center font-mono text-xs font-bold">{symbol}</li>)}
      </ul>
      <p className="mt-4 text-xs leading-6 text-muted">{c.universeNote}</p>
    </Section>
    <Section title={c.indicators}>
      <h3 className="mb-2 text-sm font-bold">{c.indicatorParams}</h3>
      <dl className="overflow-hidden rounded-xl border border-line">
        {indicators.map(([label,value])=><TechnicalRow key={label} label={label} value={value}/>)}
      </dl>
      <h3 className="mb-3 mt-5 text-sm font-bold">{c.rawFields} ({i.fields.length})</h3>
      <ul className="flex flex-wrap gap-1.5">
        {i.fields.map(name=><li key={name} className="rounded-md bg-panel-2 px-2 py-1.5 font-mono text-[11px] text-fg">{name}</li>)}
      </ul>
      <p className="mt-3 text-xs leading-6 text-muted">{c.indicatorNote}</p>
    </Section>
    <Section title={c.costs}>
      <h3 className="text-xs font-bold tracking-wide text-muted">{c.defaults}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <LabelValue label={c.fee} value={fmtBp(engine.execution.feeBps)}/>
        <LabelValue label={c.slippage} value={fmtBp(engine.execution.slippageBps)}/>
        <LabelValue label={c.initial} value={toCurrency(engine.execution.initialCashUsd)}/>
      </dl>
      <h3 className="mt-5 text-xs font-bold tracking-wide text-muted">{c.active}</h3>
      {active?<dl className="mt-3 grid grid-cols-2 gap-2">
        <LabelValue label={c.fee+" · "+c.verified} value={fmtBp(active.feeBps)}/>
        <LabelValue label={c.slippage+" · "+c.verified} value={fmtBp(active.slippageBps)}/>
      </dl>:<p className="mt-2 text-xs leading-6 text-muted">{c.notVerified}</p>}
      <p className="mt-3 text-xs leading-6 text-muted">{c.override}</p>
    </Section>
    <Section title={c.models}>
      <ModelDisclosure locale={locale} activeModels={active?activeModels:undefined}/>
      <p className="mt-3 text-xs leading-6 text-muted">{c.modelsNote}</p>
    </Section>
    <Section title={c.inference}>
      <dl className="grid grid-cols-2 gap-2">
        <LabelValue label={c.temp} value={String(engine.inference.temperature)}/>
        <LabelValue label={c.maxTokens+" · "+c.defaults} value={String(engine.inference.maxTokens)}/>
      </dl>
      <div className="mt-4 space-y-3 text-sm leading-7">
        <div><h3 className="font-bold">{c.systemPrompt}</h3><p className="text-muted">{c.systemPromptValue}</p></div>
        <div><h3 className="font-bold">{c.userPacket}</h3><p className="text-muted">{c.userPacketValue}</p></div>
        <p className="rounded-xl bg-panel-2 p-3 text-xs leading-6 text-muted">{c.maxDefault}</p>
        <div><h3 className="font-bold">{c.claudeException}</h3><p className="text-muted">{c.claudeExceptionValue}</p></div>
      </div>
    </Section>
    <Section title={c.sample}>
      <dl className="grid gap-2 sm:grid-cols-3">
        <LabelValue label={c.sharpe+" · "+c.sharpeValue} value={String(engine.statistics.minSharpeObservations)}/>
        <LabelValue label={c.win+" · "+c.winValue} value={String(engine.statistics.minRealizedSellsForWinRate)}/>
        <LabelValue label={c.volSample+" · "+c.volValue} value={String(engine.statistics.minVolatilityObservations)}/>
      </dl>
      <p className="mt-3 text-xs leading-6 text-muted">{c.sampleNote}</p>
    </Section>
    <Section title={c.source}>
      <p className="text-sm font-bold">{c.provider}</p>
      <p className="mt-2 text-sm leading-7 text-muted">{c.sourceNote}</p>
      <p className="mt-3 text-xs text-muted">{c.disclaimer}</p>
    </Section>
  </div>;
}
