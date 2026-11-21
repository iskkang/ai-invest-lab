import type { MetadataRoute } from "next";
import { LOCALES } from "@/lib/public-content";
import { VISIBLE_SECTIONS, alternateRoutes, localizedRoute } from "@/lib/seo";
import { PATTERNS } from "@/lib/pattern-lab";

/** SEO targets the real chart-first AI dashboard and its translated subpages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const sections:string[] = [
    ...VISIBLE_SECTIONS,
    "/ai/gpt", "/ai/claude", "/ai/gemini", "/ai/deepseek",
    ...PATTERNS.map(p=>"/patterns/"+p.id),
  ];
  return sections.flatMap((section)=>
    LOCALES.map(locale=>({
      url:localizedRoute(locale,section),
      lastModified:new Date("2026-11-21T00:00:00Z"),
      changeFrequency:section===""?"daily" as const:"weekly" as const,
      priority:section===""?1:section.startsWith("/ai/")?0.85:0.7,
      alternates:{languages:alternateRoutes(section)},
    }))
  );
}
