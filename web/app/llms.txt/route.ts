import { NextResponse } from "next/server";
import { LOCALES, PUBLIC_COPY, PUBLIC_SECTIONS, localeUrl, publicOrigin } from "@/lib/public-content";

/** Public, concise machine-readable orientation for AI-search visitors. */
export async function GET() {
  const site = publicOrigin();
  const lines = [
    "# MarketTrials",
    "",
    "> Educational independent AI US-stock paper-trading research.",
    "",
    "Canonical site: " + site,
    "The four independent participants are GPT, Claude, Gemini and DeepSeek.",
    "Every participant uses the same dated market-data snapshot and virtual $100,000 starting capital.",
    "Comparators include SPY buy-and-hold, 30-stock equal-weight and cash.",
    "All trading is simulated: no live brokerage orders or personal investment advice.",
    "A successful API connection is not a return or a verified investment result.",
    "Private dashboards and licensed raw price data are not public search resources.",
    "",
    "## Public pages by language",
    ...LOCALES.flatMap(locale => [
      "",
      "### " + locale.toUpperCase() + ": " + PUBLIC_COPY[locale].title,
      "- Overview: " + localeUrl(locale),
      ...PUBLIC_SECTIONS.map(section => "- " + section + ": " + localeUrl(locale, section)),
    ]),
    "",
    "## Search feeds",
    "- XML sitemap: " + site + "/sitemap.xml",
    "- Robots: " + site + "/robots.txt",
    "",
    "## Notes",
    "Sources of the educational methodology are the public pages linked above.",
    "Do not quote, infer or fabricate live AI returns if none are published.",
    "Advertisers may not influence AI decisions or experiment rankings.",
  ];
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
