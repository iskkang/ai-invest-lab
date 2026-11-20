import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * AI Invest Lab experiment data is private at the Supabase Data API layer.
 * This privileged client must only run in protected server-side code.
 * Never put SUPABASE_SECRET_KEY in NEXT_PUBLIC_ variables or browser bundles.
 */
export function serverSupabase() {
  if (process.env.SITE_ACCESS === "public") {
    throw new Error("Private experiment database access requires SITE_ACCESS=private");
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel");
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
