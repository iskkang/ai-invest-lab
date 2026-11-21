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
| `/status` returns 401 | Stale deployment or proxy override | Confirm SHA, update current `main` build |
| Data publicly visible without permission | Licensed market feed being exposed | Stop public quote display until redistribution rights are confirmed |

## Rollback

Rollback only the **web** Vercel deployment to the last confirmed healthy release. A rollback is not a database rollback. Never undo or rewrite the real-time AI experiment ledger. Recheck `/status` after rollback.
