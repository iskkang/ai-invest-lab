import { NextResponse } from "next/server";

/** Public deploy identity only. Not a signal that the market-data/AI engine works. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      service: "LogicSight",
      component: "web",
      deployCommit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || null,
      dataMode: "live",
      demoEnabled: false,
      dataSource: "nh_plug",
      configurationWarning: process.env.DATA_MODE && process.env.DATA_MODE !== "live" ? "Legacy DATA_MODE ignored; live-only enforced" : null,
      engineStatus: "not_checked",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
