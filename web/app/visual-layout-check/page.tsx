import { notFound } from "next/navigation";
import { ChartLegend } from "@/components/chart-legend";
import { UniverseRail } from "@/components/universe-rail";
import { DashboardHero } from "@/components/dashboard-hero";
import { DecisionCoverage } from "@/components/decision-coverage";
import { FirstRoundHome } from "@/components/first-round-home";
import type { Account, Dataset } from "@/lib/types";

/** Auth-protected and explicitly disabled in Vercel / normal deployments.
 * Fake holdings exist only to exercise conditional UI rendering in CI.
 * This route MUST NEVER show simulated trading statistics in production.
 */
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function HomeRenderFixture() {
  if (process.env.AIL_UI_TEST_FIXTURE !== "on" || process.env.VERCEL) notFound();
  const accounts: Account[] = [
    {id:1,kind:"ai",aiId:"gpt",benchmarkCode:null,name:"GPT",color:"#10a37f",model:null,initialCash:100000},
    {id:2,kind:"ai",aiId:"claude",benchmarkCode:null,name:"Claude",color:"#d97757",model:null,initialCash:100000},
    {id:3,kind:"ai",aiId:"gemini",benchmarkCode:null,name:"Gemini",color:"#4285f4",model:null,initialCash:100000},
    {id:4,kind:"ai",aiId:"deepseek",benchmarkCode:null,name:"DeepSeek",color:"#7c5cff",model:null,initialCash:100000},
    {id:5,kind:"benchmark",aiId:null,benchmarkCode:"SPY_BUY_HOLD",name:"SPY",color:"#6b7280",model:null,initialCash:100000},
  ];
  const base={
    locale:"en" as const,publicQuotesRedacted:true,accounts,
    universe:[{symbol:"AAPL",name:"Apple",sector:"IT",role:"investable"}],
    prices:{AAPL:[]},snapshots:[],rounds:[],decisions:[],
    experiment:{startSession:"2026-11-23",initialCash:100000},
  };
  const empty = base as unknown as Dataset;
  const held = {
    ...base,
    snapshots:[{
      accountId:1,date:"2026-11-19",equity:100000,cash:99970,cumReturn:0,dailyReturn:0,
      holdings:[{symbol:"AAPL",quantity:1,avgCost:30,close:30,marketValue:30,unrealizedPnl:0}],
    }],
  } as unknown as Dataset;
  const decisionNow = new Date("2026-11-25T14:16:00Z");
  const holdDate = "2026-11-24";
  const buyDate = "2026-11-23";
  const coverage: Dataset = {
    ...empty,
    experiment: {...empty.experiment, status:"running"},
    generatedAt: decisionNow.toISOString(),
    rounds: [holdDate,buyDate].map((sessionDate, index) => ({
      id:index+7, sessionDate, dataAsOf:"2026-11-20", decisionAt:sessionDate+"T13:25:00Z",
      status:"settled", abortReason:null, snapshotHash:"fixture",
    })),
    decisions: [holdDate,buyDate].flatMap((sessionDate, index) => accounts.filter(a=>a.aiId)
      .map((a,i) => ({
        id:index*4+i+1, roundId:index+7, aiId:a.aiId!, model:a.name, status:"valid",
        error:null, summary:null, sessionDate, dataAsOf:"2026-11-20",
        actions:index===1 && i===0 ? [{
          symbol:"AAPL", action:"BUY", quantity:1, reason:"Fixture", risks:[],
          indicators_used:[], expected_return_pct:null, confidence:null,
        }] : [],
      }))),
  };
  return <div data-home-ui-fixture="true" className="mx-auto max-w-[900px] space-y-8 pb-12">
    <h1 className="text-xl font-bold">Private layout regression fixture</h1>
    <section data-prelaunch-fixture="true"><FirstRoundHome d={empty}/></section>
    <DecisionCoverage d={coverage} now={decisionNow}/>
    <DashboardHero d={empty}/>
    <section aria-label="AI chart legend test">
      <ChartLegend locale="en" lines={accounts.map(a=>({name:a.name,color:a.color,dashed:a.kind==="benchmark"}))}/>
    </section>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section data-universe-state="empty"><UniverseRail d={empty}/></section>
      <section data-universe-state="held"><UniverseRail d={held}/></section>
    </div>
  </div>;
}
