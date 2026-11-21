import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/public-content";

/**
 * Search engines and AI search crawlers can index only public educational
 * translations. Private application and API URLs remain excluded.
 * robots.txt does not replace the separate HTTP authentication gate.
 */
export default function robots(): MetadataRoute.Robots {
  const publicPaths = [
    "/en", "/zh", "/ko", "/ja",
    "/sitemap.xml", "/robots.txt", "/llms.txt", "/ads.txt",
  ];
  return {
    rules: [
      { userAgent: "*", allow: publicPaths, disallow: "/" },
      // Search inclusion is separate from model-training crawling.
      { userAgent: "OAI-SearchBot", allow: publicPaths, disallow: "/" },
      { userAgent: "Claude-SearchBot", allow: publicPaths, disallow: "/" },
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
    ],
    sitemap: `${publicOrigin()}/sitemap.xml`,
    host: publicOrigin(),
  };
}
