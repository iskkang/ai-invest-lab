# Public multilingual website / worldwide discovery / advertising rollout

## Shipped site architecture (November 2026)

- `/` redirects to the public English research landing page at `/en`.
- `/en`, `/zh` (Simplified Chinese), `/ko`, and `/ja` provide four human-readable language options in the header.
- The four sections on every language route are `/methodology`, `/faq`, `/privacy`, `/advertise`: **20 indexable public editorial URLs total**.
- `/lab` is the original **private** AI paper-trading dashboard. Its detailed portfolio, quote/price chart, /api, benchmark, orders, and trade paths remain password-gated. Do NOT expose them by setting `SITE_ACCESS=public`; `proxy.ts` independently protects them.
- No market-price feed or Supabase secret is shipped to these public pages. Full public access to licensed stock data requires verified **redistribution rights** from the provider and an explicit least-privilege access design.
- Incomplete experiment results are not converted to fake performance for marketing.

The new public layer does **not** translate every private dashboard chart, tooltip, and table yet. The `/lab` application remains the internal Korean research console while legal review for public reporting is underway.

## SEO & AI search

Implemented:
- Individual, server-rendered human content per language; a selectable language menu on every public URL.
- Each page has language-specific `title`, `description`, canonical URL, reciprocal `hreflang` alternates, `x-default`, Open Graph metadata.
- `/sitemap.xml` contains all 20 public pages. `/robots.txt` is public and lets ordinary search bots and recognized AI search bots crawl public pages only.
- `/llms.txt` gives bots a public overview and methodology links. It is an informational convenience, **not** a ranking/indexing mechanism.
- `WebSite` JSON-LD on language landing pages, and FAQ/WebPage JSON-LD on supporting pages. FAQ structured data does not guarantee a rich result.
- HTTP `noindex, nofollow, noarchive` and the Basic auth check remain active on all protected paths.

Search visibility is not guaranteed by crawler permissions. A new domain, content quality, links, competitors, availability and search-provider policies determine whether/when a page is indexed or cited by ChatGPT, Claude, Gemini/Google, Bing, etc.

After deployment:
1. Visit `/`, `/en`, `/ko`, `/zh`, `/ja`, `/en/methodology`, `/sitemap.xml`, `/robots.txt`, `/llms.txt` anonymously and verify no Basic challenge. They should return 200 except `/`, which should redirect to `/en`.
2. Visit `/lab`, `/portfolio`, `/api/health/db` without credentials. They MUST return 401 and must not expose data or API secrets.
3. Confirm language selector works on mobile, including preservation of the current article section.
4. For a **custom production domain**, first set `NEXT_PUBLIC_SITE_URL=https://your-domain.tld` in Vercel Production and redeploy, then submit the exact domain-specific `/sitemap.xml` in **Google Search Console**, **Bing Webmaster Tools**, and regionally relevant tools (Baidu/Yandex) if supported. The alternate domain should redirect to the canonical origin. Avoid indexing two domains with duplicate content.
5. Check Google URL Inspection and Bing IndexNow/inspection as appropriate. Crawlable does **not** mean indexed or selected as an AI-search citation.
6. Regularly publish useful original content beyond translations: dated market **methodology and experiment** reports, independent benchmark comparisons, error/limitations disclosures, and source references. Confirm licensing before publishing derived price tables or screenshots.

Relevant official sources:
- Google Search Central localizations: https://developers.google.com/search/docs/specialty/international/localized-versions
- OpenAI search crawler: https://developers.openai.com/api/docs/bots

## Ads and monetization

Shipped:
- An optional **clearly identified sponsor** area on public pages. Only shows when both `NEXT_PUBLIC_SPONSOR_NAME` and a valid HTTPS `NEXT_PUBLIC_SPONSOR_URL` are configured. Sponsor link uses `rel="sponsored nofollow noopener noreferrer"`.
- `/ads.txt` advertises no sellers unless `ADSENSE_PUBLISHER_ID=pub-1234567890123456` (your own *approved* publisher ID) is set; with a valid ID it emits Google's direct-seller declaration. Replace the example with the REAL approved ID, never invent one.
- Advertising and privacy editorial pages in all four languages, with clear separation from AI model decisions and rankings.

Not yet done / required before **actual programmatic ads**:
1. Own a suitable domain, apply for a legitimate Google AdSense account, complete site verification and site/ad account approval; a hosted Vercel preview domain is not an advertising strategy.
2. Create a real publisher contact/ownership disclosure and review the privacy page against your actual hosting, vendors, analytics and retention. The current wording is a preliminary technical disclosure, not finalized legal advice.
3. Choose and implement a consent management platform (CMP) and consent flow complying with relevant regional regulations. Google requires a Google-certified TCF CMP for personalized ads to visitors in EEA/UK/Switzerland. **Do not inject Google ads/scripts or user tracking into public pages before this is configured.**
4. Add the approved `ADSENSE_PUBLISHER_ID`, verify `/ads.txt`, then only conditionally load approved AdSense code and clearly labeled ad units after all consent/policy gates are met. No platform can guarantee display of a particular stock-category advertisement or specific RPM.
5. Keep ad placements away from portfolio trade actions, AI research facts, navigation and misleading high-return claims. Explicitly label sponsored articles, prevent conflicts of interest and disclose paid placements.
6. Monitor accessibility, Core Web Vitals, organic impressions, CTR, ad viewability, RPM and policy-center messages. Do not bulk-publish low-value AI filler for indexing/AdSense.

Official references:
- AdSense CMP requirements: https://support.google.com/adsense/answer/13554116
- Publisher policy and content requirements: https://support.google.com/adsense/answer/15689616

## Deployment

The previously connected Vercel account does not contain the `ai-invest-lab` project, so GitHub updates may deploy through a different, unconnected Vercel team. Use **the Vercel account actually hosting the site** to inspect deployment status.

No setting or secret named `SITE_ACCESS=public` is necessary to open the editorial site. Public routes are explicitly allowlisted in `web/proxy.ts`, while the private lab remains gated. Do NOT disable the password for `/lab` merely for SEO.

For the public page to be discoverable under the existing alias, the code must be deployed to `https://ai-invest-lab-five.vercel.app`. The `NEXT_PUBLIC_SITE_URL` value defaults to this alias; update it only when the canonical production domain changes.
