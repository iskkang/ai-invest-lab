import type { MetadataRoute } from "next";
import {
  LOCALES, PUBLIC_SECTIONS, languageAlternates, localeUrl,
  type PublicSection
} from "@/lib/public-content";

/** Only actual, public, translated HTML pages are included. */
export default function sitemap(): MetadataRoute.Sitemap {
  const sections: (PublicSection | undefined)[] = [undefined, ...PUBLIC_SECTIONS];
  return sections.flatMap((section) =>
    LOCALES.map((locale) => ({
      url: localeUrl(locale, section),
      lastModified: new Date("2026-11-21T00:00:00Z"),
      changeFrequency: section ? "monthly" as const : "weekly" as const,
      priority: section ? 0.65 : 0.9,
      alternates: { languages: languageAlternates(section) },
    }))
  );
}
