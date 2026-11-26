# AI Invest Lab: Vercel + Supabase setup

This is a private prototype with 21 RLS-protected tables. The Supabase anon role has no access to investment records. A password gate on Vercel does not protect the Supabase Data API itself.

## Vercel environment variables (Production)

| Key | Value |
| --- | --- |
| SUPABASE_URL | https://ykhewuumkymjgpvqfpuo.supabase.co |
| SUPABASE_SECRET_KEY | Supabase Dashboard > Project Settings > API Keys > sb_secret_... key |
| DATA_MODE | live (mandatory; synthetic demo is removed) |
| SITE_ACCESS | private |
| SITE_USER | lab (or existing username) |
| SITE_PASSWORD | Existing private password; configure this yourself |
| AIL_EXPERIMENT | season-1 (only when an experiment with that name exists) |

The secret key MUST be a Vercel server-only, preferably Sensitive, environment variable. Never use NEXT_PUBLIC_ prefix, never commit the secret, and never paste it into chat.

Do not put DATABASE_URL, NH PLUG, or OpenRouter credentials into the Vercel web project. They belong in the separate server-side engine environment.

After saving Production env vars, redeploy in Vercel and open /api/health/db after the private site login. Success returns connected:true, schemaReady:true, dataMode:live. This non-mutating check doesn't reveal secrets.

## Live simulation prerequisites

The private `season-1` experiment is initialized with four AI portfolios, three benchmark portfolios, and a first NYSE session of **2026-11-23**. Initial balances are $100,000 per virtual portfolio, but no return, AI decision, order, or trade is reported until it truly exists.

1. Apply `20261126000007_reconciled_price_history.sql` before deploying the matching engine and web code. The LIVE namespace is `reconciled_live_v1`; existing NH records remain intact. Confirm the experiment has no official decisions, trades or valuations before its initial namespace switch. Validate all 30 stocks plus SPY with `daily-engine`, `job=run-settle`, and an already closed `scheduled_session`. The older `live-price-warmup` and direct NH preflight are primary-provider diagnostics; they do not establish that the reconciled dataset or Nasdaq fallback is ready.
2. Actions > `model-smoke-test` > Run workflow: explicitly test real model inference with a conservative estimated-cost guard, without writing trades.
3. Vercel > AI Invest Lab project > Settings > Environment Variables > change `DATA_MODE` from `demo` to `live` for Production, then **Redeploy**. Keep `SITE_ACCESS=private` and `SUPABASE_SECRET_KEY` server-only. The dashboard truthfully shows **first round pending**, not a fabricated leaderboard, until valuations exist.
4. GitHub repository Settings > Secrets and variables > Actions > Variables: set `AIL_ENGINE_ENABLED=true` **only after both checks pass and model usage/budget are reviewed**. The daily-engine schedule then creates decisions only on eligible NYSE sessions; the first is Nov 23 if activated before premarket. Post-close settlement creates performance snapshots.
5. Once the engine has recorded real decisions and portfolio valuations, the LIVE dashboard shows actual AI decisions, hypothetical fills, returns and benchmarks. The web is read-only and visitors never invoke AI APIs.

Do not turn on `DATA_MODE=live` expecting historical demo-like results. A newly created real experiment has no historical performance; only accumulate it from genuine dated decisions and daily valuations.

Keep SITE_ACCESS=private until implementing least-privilege data read APIs, robust access control, and confirming market-data redistribution permissions. The current privileged server key setup is for internal testing only.

Analytical web queries use `price_history_current`, which returns the latest complete provider batch per symbol. Do not fall back to a mixture of canonical NH and Nasdaq rows for historical volume indicators. Preserve `provider`, `basis` and `volume_unit`; NH native volume units must not be treated as shares. The public projection continues to redact raw prices from both providers.
