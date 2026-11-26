# AI Invest Lab production recovery

## What is actually deployed

- **Only `web/` is a Vercel Next.js service.** In its Vercel project, set **Root Directory = `web`**, Framework = Next.js, production branch = `main`.
- `engine/` is a Python CLI scheduled by GitHub Actions (`daily-engine`), **not** a Vercel HTTP service. Disconnect its unnecessary Vercel Git project. As a defensive fallback, `engine/vercel.json` skips builds if the mistaken project is still linked with root `engine`.
- NH PLUG and OpenRouter credentials belong to the GitHub Actions engine secrets; the web only needs server-only Supabase access. Do **not** enable real brokerage orders.
- Never reset the DB, overwrite historical decisions, or promote DEMO returns to LIVE performance.

## Rebuild and verify

1. In GitHub, first require green `ci` checks (including DB-independent production build and smoke tests).
2. Verify the correct Vercel team, project and Git source. A prior deploy's Redeploy can reuse the old SHA; deploy the newest tested `main` commit instead.
3. Ensure Root Directory = `web` in the actual **web** Vercel project. This cannot be fixed via `vercel.json`.
4. Inspect build logs, wait for READY, and verify `/status` in a fresh private window:
   - `component` = `web`
   - `deployCommit` matches the newly deployed SHA prefix
   - `dataMode` = desired `demo` or `live`
   - `engineStatus` is deliberately `not_checked`; this route checks only the web deploy.
5. Open `/ko`, `/en` and `/ko/methodology` without a login prompt; API routes stay private.
6. Only after checking the deployment and security verify the protected `/api/health/db` endpoint with authorized access.
7. For LIVE mode, run NH `provider-preflight`, four-model `model-smoke-test`, and optional `live-price-warmup` in GitHub Actions. Check failures there, not on Vercel.
8. Do not set `AIL_ENGINE_ENABLED=true` until data quality, model identities, cost guards, and the first eligible trading session have been validated.

## Failure matrix

| Symptom | Likely cause | Correct fix |
|---|---|---|
| Python entrypoint missing in `engine` deploy | Unnecessary Vercel project builds CLI | Disconnect `engine` Vercel Git link; do not add a fake `app.py` |
| `headers()` in `generateStaticParams` | Old source deployed | Use latest tested `main`, never redeploy the same stale SHA |
| GitHub CI green but site unchanged | Wrong project/team, alias, branch, or old deployed SHA | Verify Vercel project's Git link and `/status` SHA |
| Public dashboard shows data unavailable | Supabase not configured or down | Verify server env and private `/api/health/db`; do not fabricate results |
| All 4 AI positions pending | Engine has not completed a valid round/settlement | Check Actions engine job, `AIL_ENGINE_ENABLED`, NH/OpenRouter checks |
| Historical candle differs from storage | Provider revision or an unexplained change of price basis | Run the read-only whole-universe audit; compare changed fields and dated observations before accepting data |
| Reported high is below the reported open/close | Inconsistent provider OHLC | Recheck the exact dated response; require a valid provider observation, never manufacture a replacement price |
| `/status` returns 401 | Stale deployment or proxy override | Confirm SHA, update current `main` build |
| Data publicly visible without permission | Licensed market feed being exposed | Stop public quote display until redistribution rights are confirmed |

## Rollback

Rollback only the **web** Vercel deployment to the last confirmed healthy release. A rollback is not a database rollback. Never undo or rewrite the real-time AI experiment ledger. Recheck `/status` after rollback.

## Engine settlement recovery

`ail verify` checks existing records. It does not fetch fresh quotes and cannot establish that ingestion or settlement works.

1. Run `market-data-audit` with the affected completed NYSE session when investigating the primary provider. It uses an explicitly read-only database transaction and compares the original NH namespace with two identical NH requests. It makes no AI calls and writes no prices, decisions, or orders. It does not verify the reconciled dataset or the fallback provider.
2. The LIVE engine uses `reconciled_live_v1`. It validates NH first and can replace a problematic symbol's entire requested history with a validated Nasdaq batch. Keep the actual provider, observation time, query evidence, reported basis and native volume unit. Never splice fields from different providers, guess an OHLC correction or silently convert volume units. A corporate-action announcement alone does not prove the provider's adjustment formula; never infer a split or dividend from a price difference alone.
3. Retry `daily-engine` with `job=run-settle` and `scheduled_session=YYYY-MM-DD`. The target must be a genuine NYSE session already past its close plus 60 minutes. The engine keeps its real current clock, including after New York midnight or on a holiday. It does not backfill AI decisions.
4. Require `settlement_receipt.verified=true`: exact-session source prices, four AI and three benchmark valuations, matching holdings/cash/marks, and no pending orders through that date. A duplicate job is rechecked against these records. A pre-start ingestion reports that distinct phase and does not claim portfolio valuations.
5. Separately verify the next eligible pre-open decision round with all four valid model records. A settlement receipt does not establish that a future decision round ran.

Canonical `stock_prices` remain immutable, including the original `nh_plug` records. New provider observations are kept in immutable historical batches, and future analyses select only information observed by their cutoff. `price_history_current` exposes one complete latest provider batch per symbol to the web. Existing market snapshots and financial records are never rebuilt from a later batch.

If neither provider supplies a valid required batch, the job remains failed with structured findings. A fallback request that succeeds is not sufficient proof of settlement: require the settlement receipt and then verify the next real four-model round independently. Database errors must propagate rather than being mislabeled as duplicate jobs.
