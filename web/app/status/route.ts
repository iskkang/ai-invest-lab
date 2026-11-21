import { NextResponse } from "next/server";

/** Public deploy identity only. Not a signal that the market-data/AI engine works. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      service: "AI Invest Lab",
      component: "web",
      deployCommit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || null,
      dataMode: process.env.DATA_MODE === "live" ? "live" : "demo",
      engineStatus: "not_checked",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
