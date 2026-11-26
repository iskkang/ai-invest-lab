# Return-visitor content operations (verified paper-trading only)

## Editorial lifecycle

1. Pre-market decision job writes a verified four-model round; invalid rounds are aborted and remain visible in the journal.
2. Closing settlement job stores simulated fills, portfolio daily returns, and market snapshots.
3. Public pages re-read server-side verified records (5-minute cache for results). They do not invoke LLMs on visits.
4. The public home shows publication freshness, the latest four-model brief, confirmed portfolio moves, vote changes and journal activity.
5. /daily shows recorded summaries, explicit AI conflicts, confirmed changes, the journal and a follow-up entry point.
6. /journal retains dated aborted/decided/settled round statuses and does not count invalid decisions as votes.
7. /outcomes shows 1/5/20-market-session directional results from private adjusted NH bars. Small samples show counts rather than percentages.
8. /weekly publishes only completed weeks and uses stored snapshots; weeks without valid data are not published.

## Launch gate (2026-11-23, America/New_York)

- Check GitHub repo variable AIL_ENGINE_ENABLED=true, environment production, DATABASE_URL, OPENROUTER_API_KEY, NHPLUG_APP_KEY and NHPLUG_APP_SECRET.
- Check configured model identifiers match the active model_versions in Supabase. Never rotate models silently.
- Execute workflow_dispatch verify and provider preflight before first live session.
- Confirm the scheduled pre-market run creates one DECIDED (not ABORTED) experiment_round and four VALID ai_decisions.
- Confirm closing settle adds four AI portfolio_snapshots and fills, if any. Zero trades can be valid.
- Confirm first /daily page has the same session date and four valid models and /journal has correct status.
- Confirm /outcomes has only PENDING until the relevant subsequent verified market sessions; it must not show invented performance.
- After 5/20 sessions, confirm cohort labels mature with no missing-data forward fill.
- Inspect GitHub Actions daily-engine failure logs if the scheduled run is not recorded. Scheduled jobs can start late.
- During a failure, keep the latest verified publication visible with a separate aborted or missing latest-round status.

## Truthfulness and license constraints

- Outcomes are per-ticker *direction checks*, not trade profitability, CAGR or model skill proof.
- Charts and public pages must not redistribute original NH PLUG or Nasdaq prices or quote-level returns.
- HOLD and silence are excluded from outcomes. An omitted ticker is **not** a HOLD.
- If no verified AI decisions exist, show the scheduled start and empty state.
- Do not send daily engagement emails/alerts unless explicit user consent, delivery source and consent handling are designed.
