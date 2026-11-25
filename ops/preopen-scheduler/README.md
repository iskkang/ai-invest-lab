# Independent pre-open wake-up

Cloudflare Cron Triggers supplement (do not remove) the three native GitHub
schedules. Cloudflare supplies the clock; the exact existing `daily-engine`
workflow still runs in GitHub Actions using its existing secret bindings and
production readiness gate. This removes dependency on GitHub **delivering its
own cron**; it is not a second engine or a fallback if GitHub runners are down.

One cron expression covers both UTC offsets and the Worker accepts only 08:17,
08:37 and 08:57 America/New_York. An event more than five minutes late or with a
different New York date is discarded. GitHub jobs also reject a fallback
dispatch if its target New York date differs from the actual execution date.
The engine independently enforces NYSE holidays, the 08:00–09:15 decision
window, simulator-only mode, and once-per-session database constraints. A
holiday may receive a GitHub wake-up but cannot create a round.

## Dry-run and activate

1. Merge the workflow change first. Run local tests with
   `node --test ops/preopen-scheduler/worker.test.mjs`. They use a fake HTTP
   responder; they make no GitHub requests. Check Cloudflare Workers Free
   account/trigger capacity before deploying. Do not upgrade or create a paid
   resource for this fallback.
2. Deploy `worker.mjs` with `wrangler.toml` as supplied, or create the matching
   Worker in the existing Cloudflare account using the Workers dashboard. Keep
   public and preview URLs off, set `SCHEDULER_MODE=dry-run`, and configure
   `17,37,57 12,13 * * MON-FRI`. Wait for a matched scheduled slot and confirm
   `dry-run` log with the exact New York session; configure no token yet.
3. In GitHub, create a fine-grained token on the owner's authorized GitHub
   account scoped only to `iskkang/ai-invest-lab`, repository permission
   **Actions: Read and write**, with a short expiry. Store as encrypted
   Worker secret `GITHUB_ACTIONS_TOKEN` using Cloudflare's dashboard or a
   secret-setting CLI prompt; never put it in source, a chat, a log, or the
   Vercel web project. After the dry-run proof, set `SCHEDULER_MODE=live` in
   the production Worker (ensure a future config redeploy doesn't reset it).
4. On the next NYSE session, check the Cloudflare trigger log, the exact dated
   GitHub `workflow_dispatch` and its `official_round` receipt. Dispatch
   acceptance is not success. Only a persisted `decided` or `settled` round
   with the valid records of all four models before cutoff is success.
   `market_closed` is a skip, not a round; a missing or invalid receipt on a
   trading day has nonzero exit status. Never dispatch or replay after the
   cutoff, and do not synthesize prices to obtain a green run.

Rollback: return `SCHEDULER_MODE` to `dry-run` or remove the Cron trigger and
revoke the dedicated token. This does not touch the GitHub native schedule,
market data, or the simulation ledger.
