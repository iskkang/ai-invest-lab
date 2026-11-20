# AI Invest Lab: Vercel + Supabase setup

This is a private prototype with 21 RLS-protected tables. The Supabase anon role has no access to investment records. A password gate on Vercel does not protect the Supabase Data API itself.

## Vercel environment variables (Production)

| Key | Value |
| --- | --- |
| SUPABASE_URL | https://ykhewuumkymjgpvqfpuo.supabase.co |
| SUPABASE_SECRET_KEY | Supabase Dashboard > Project Settings > API Keys > sb_secret_... key |
| DATA_MODE | demo (do not use live until a live experiment exists) |
| SITE_ACCESS | private |
| SITE_USER | lab (or existing username) |
| SITE_PASSWORD | Existing private password; configure this yourself |
| AIL_EXPERIMENT | season-1 (only when an experiment with that name exists) |

The secret key MUST be a Vercel server-only, preferably Sensitive, environment variable. Never use NEXT_PUBLIC_ prefix, never commit the secret, and never paste it into chat.

Do not put DATABASE_URL, NH PLUG, or OpenRouter credentials into the Vercel web project. They belong in the separate server-side engine environment.

After saving Production env vars, redeploy in Vercel and open /api/health/db after the private site login. Success returns connected:true, schemaReady:true, dataMode:demo. This non-mutating check doesn't reveal secrets.

## Live simulation prerequisites

The new database initially has a schema but no experiment, price, or trading records. Set up the Python engine and its database connection first, fill the selected live experiment, and only then change DATA_MODE to live and redeploy.

Keep SITE_ACCESS=private until implementing least-privilege data read APIs, robust access control, and confirming market-data redistribution permissions. The current privileged server key setup is for internal testing only.
