# Public multilingual AI Invest Lab: the original dashboard design

## Customer-facing UX (2026-11-21)

The original AI leaderboard, return chart, portfolio / performance tables, model details and stock views are the main user experience. The former standalone marketing landing page and public "advertising plan" page were removed. No ads or promotional blanks appear until an approved advertising network and lawful consent workflow are configured.

- `/` and legacy `/lab` redirect to `/ko`.
- `/ko`, `/en`, `/zh`, `/ja` each render **the original full dashboard** with the language switcher inside the top toolbar.
- Dashboard subpages are duplicated by language, using shared UI components: `/<locale>/portfolio`, `/<locale>/trades`, `/<locale>/performance`, `/<locale>/about`, `/<locale>/ai/{gpt,claude,gemini,deepseek}`, `/<locale>/stocks/{symbol}`, `/<locale>/trades/{id}`.
- Secondary education/SEO: `/<locale>/methodology`, `/<locale>/faq`, `/<locale>/privacy`. These are shown inside the same dashboard shell, not a separate theme.
- AI text such as historical generated rationales is stored in its source language (Korean in the current engine). UI labels and the educational articles have 4 native localizations; editorial translations of arbitrary historical AI-generated reasoning require a separate controlled translation job.
- Public trading data are hypothetical educational results only, never real brokerage orders. A new real-data experiment may initially have **no outcomes**. Do not substitute synthetic DEMO returns and call them live.

## Access control and quote-license separation

The public read-only pages use the server-rendered Supabase data projection, but the API/secret key remains server-side. Public live responses **redact** NH PLUG per-symbol OHLCV, original opening/fill prices and trade cash amounts. They may display independently generated AI decisions, simulated portfolio-level curves, and hypothetical positions; confirm provider-derived-data licensing separately before any further public feed.
- Health endpoints, dashboard database operations and unlisted paths remain behind Basic authentication.
- `SITE_ACCESS=public` is **not necessary**. The route allowlist in `web/proxy.ts` opens only named read-only localized routes and public SEO files.
- The private secret must never be put in a `NEXT_PUBLIC_` variable.
- Content requiring real-time prices needs a separate redistribution license, not merely crawler changes.

## Global search and AI search

- `/sitemap.xml` lists **48 public localized pages**: 4 languages × (dashboard + portfolio/trades/performance/about/methodology/faq/privacy + four AI detail pages).
- Per-page HTML title, description, canonical, alternate `hreflang`, `x-default`, Open Graph metadata.
- `/robots.txt` allows global search crawlers and AI-search crawlers on the public pages, blocks private legacy routes and APIs. `/llms.txt` is a nonbinding orientation file. No standard guarantees inclusion in ChatGPT, Claude, Gemini or other AI search results.
- Stock/trade individual detail pages remain `noindex` until content quality and data license review. They are still accessible by users.
- Publish useful regular original analysis that is clearly dated, not fabricated, spammy, or just duplicated across languages.

After domain/production deploy, verify anonymous `/ko`, `/en`, `/zh`, `/ja`, detailed routes and 200 response on sitemap, robots and llms files. Verify `/api/health/db` and old `/portfolio` require credentials. Submit the exact canonical domain's sitemap via Google Search Console, Bing Webmaster Tools, and regionally relevant search engines. When selecting a custom domain, set `NEXT_PUBLIC_SITE_URL=https://yourdomain.example` and redeploy. Redirect other domains canonically.

## Monetization foundations

The **public advertising-plan page was deliberately withdrawn**. Advertising configuration belongs in deployment settings, not the reader-facing navigation.

- `/ads.txt`: returns "No advertising sellers..." until a real `ADSENSE_PUBLISHER_ID=pub-1234567890123456` belonging to the approved publisher is configured; emits Google's authorized seller line only with a valid ID.
- If `ADSENSE_PUBLISHER_ID` is valid, the Next.js app adds the `google-adsense-account` ownership-verification meta tag. This **does not** activate ads.
- The existing dashboard supports one **dormant** `DashboardAdSlot` below the cumulative-return chart. It never appears unless all of the following are configured at build/deploy time:
  - `NEXT_PUBLIC_ADSENSE_ENABLED=true`
  - `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-<your-16-digit-publisher-id>`
  - `NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD=<actual-numeric-ad-unit-id>`
  - `NEXT_PUBLIC_ADSENSE_CMP_READY=true`
  - A properly installed certified CMP returns affirmative consent via TCF `__tcfapi` for storage purpose 1 and Google vendor 755. Without this signal, no ad requests are triggered. The CMP integration itself has **not** been installed.
- Until approval, regional policy review, ownership verification and the consent-management implementation are complete, leave `NEXT_PUBLIC_ADSENSE_ENABLED` unset/false and `NEXT_PUBLIC_ADSENSE_CMP_READY` false. Revisit the `/privacy` page with legal review before turning on trackers.
- Ads must be labeled and must never impersonate AI decisions or rankings. Google chooses actual ad demand; "stock-related" ad inventory and RPM are not guaranteed.

Official guidance:
- Google Search `hreflang`: https://developers.google.com/search/docs/specialty/international/localized-versions
- OpenAI crawler policy: https://developers.openai.com/api/docs/bots
- AdSense publisher policies: https://support.google.com/adsense/answer/10008391
- AdSense CMP: https://support.google.com/adsense/answer/13554116

## CI and deployment

GitHub Actions Web CI executes `npm ci`, tests, typecheck, secret checks, a production build, and an HTTP smoke suite for anonymous 4-language dashboards, sitemap and private API rejection.

The connected Vercel tooling in this ChatGPT session currently lists only the unrelated `kformula` project. Changes are committed to `iskkang/ai-invest-lab` `main`, but a remote Vercel deploy must be verified through the **actual Vercel team/project**. Do not equate a green GitHub check with proof that the alias is serving that commit.

Do not publish fictitious live returns. `DATA_MODE=demo` remains explicitly marked as synthetic; switching to `DATA_MODE=live` needs successful engine real-data ingestion and verified performance records.
