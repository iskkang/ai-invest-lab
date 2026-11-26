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

## Deployment mode

The checked-in `wrangler.toml` sets `SCHEDULER_MODE=live` so a routine redeploy
preserves the existing scheduler's activation target. This setting is not
evidence of a successful dispatch or an official decision round. Every new
installation must first change it to `dry-run` and follow the checks below.
Keep `GITHUB_ACTIONS_TOKEN` as an encrypted Worker secret; the production
Worker does not read a binding named `GITHUB_ACTIONS_TOKEN_TEST`.

## Dry-run and activate

1. Merge the workflow change first. Run local tests with
   `node --test ops/preopen-scheduler/worker.test.mjs`. They use a fake HTTP
   responder; they make no GitHub requests. Check Cloudflare Workers Free
   account/trigger capacity before deploying. Do not upgrade or create a paid
   resource for this fallback.
2. For a new installation, set `SCHEDULER_MODE="dry-run"` in `wrangler.toml`
   before deploying `worker.mjs`, or create the matching Worker in the existing
   Cloudflare account using the Workers dashboard with that mode. Keep
   public and preview URLs off and configure
   `17,37,57 12,13 * * MON-FRI`. Wait for a matched scheduled slot and confirm
   `dry-run` log with the exact New York session; configure no token yet.
3. In GitHub, create a fine-grained token on the owner's authorized GitHub
   account scoped only to `iskkang/ai-invest-lab`, repository permission
   **Actions: Read and write**, with a short expiry. Store as encrypted
   Worker secret `GITHUB_ACTIONS_TOKEN` using Cloudflare's dashboard or a
   secret-setting CLI prompt; never put it in source, a chat, a log, or the
   Vercel web project. After the dry-run proof, set `SCHEDULER_MODE=live` in
   both the production Worker and its deployment configuration so a future
   redeploy preserves the selected mode. A read-only `verify` dispatch can
   confirm credential access and engine configuration; it cannot establish
   that an official decision round ran.
4. On the next NYSE session, check the Cloudflare trigger log, the exact dated
   GitHub `workflow_dispatch` and its `official_round` receipt. Dispatch
   acceptance is not success. Only a persisted `decided` or `settled` round
   with the valid records of all four models before cutoff is success.
   `market_closed` is a skip, not a round; a missing or invalid receipt on a
   trading day has nonzero exit status. Never dispatch or replay after the
   cutoff, and do not synthesize prices to obtain a green run.

Rollback: return `SCHEDULER_MODE` to `dry-run` in both the deployed Worker and
its deployment configuration, or remove the Cron trigger and revoke the
dedicated token. This does not touch the GitHub native schedule, market data,
or the simulation ledger.
