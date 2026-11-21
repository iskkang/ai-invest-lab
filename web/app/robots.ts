import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/public-content";

/**
 * Public multilingual pages, sitemap and static assets are crawlable.
 * Internal portfolio / raw licensed data pages require authentication and
 * are explicitly disallowed for search bots.
 */
export default function robots(): MetadataRoute.Robots {
  const blockedPrivate = [
    "/lab", "/api/", "/ai/", "/stocks/", "/portfolio",
    "/trades", "/performance", "/about",
  ];
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/_next/static/", "/_next/image/"], disallow: blockedPrivate },
      { userAgent: "OAI-SearchBot", allow: ["/", "/_next/static/", "/_next/image/"], disallow: blockedPrivate },
      { userAgent: "Claude-SearchBot", allow: ["/", "/_next/static/", "/_next/image/"], disallow: blockedPrivate },
      // Training crawlers are distinct from public search indexing bots.
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
    ],
    sitemap: `${publicOrigin()}/sitemap.xml`,
    host: publicOrigin(),
  };
}
