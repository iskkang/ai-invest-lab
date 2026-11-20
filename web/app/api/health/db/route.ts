import { NextResponse } from "next/server";
import { serverSupabase } from "../../../lib/server-supabase";

// Private, non-mutating connectivity probe. Protected by web/proxy.ts Basic auth.
// Never return database credentials, query results, or user data.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = serverSupabase();
    const { error } = await sb.from("ai_models").select("id", { head: true, count: "exact" });
    if (error) {
      return NextResponse.json({ connected: false, schemaReady: false }, { status: 503 });
    }
    return NextResponse.json({ connected: true, schemaReady: true, dataMode: process.env.DATA_MODE === "live" ? "live" : "demo" });
  } catch {
    return NextResponse.json({ connected: false, schemaReady: false }, { status: 503 });
  }
}
