import { notFound } from "next/navigation";
import { TodayRound } from "@/components/today-round";
import { fixtureNow, fixtureRound } from "./fixtures";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function RoundFixture({ searchParams }: { searchParams: Promise<{state?: string}> }) {
  if (process.env.AIL_UI_TEST_FIXTURE !== "on" || process.env.VERCEL) notFound();
  const { state = "recorded" } = await searchParams;
  if (!["recorded","hold","missing","price-error","unavailable"].includes(state)) notFound();
  return <div className="mx-auto max-w-5xl px-4 py-8"><TodayRound fixture data={state === "unavailable" ? null : fixtureRound(state)} now={fixtureNow}/></div>;
}
