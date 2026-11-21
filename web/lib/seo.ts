import type { Metadata } from "next";
import { LOCALES, PUBLIC_COPY, publicOrigin, type Locale } from "./public-content";

export const VISIBLE_SECTIONS = [
  "", "/portfolio", "/trades", "/performance", "/about",
  "/methodology", "/faq", "/privacy",
] as const;
export type VisibleSection = (typeof VISIBLE_SECTIONS)[number];

export function localizedRoute(locale: Locale, suffix: string = "") {
  return `${publicOrigin()}/${locale}${suffix}`;
}
export function alternateRoutes(suffix: string = "") {
  return {
    en: localizedRoute("en", suffix),
    "zh-CN": localizedRoute("zh", suffix),
    ko: localizedRoute("ko", suffix),
    ja: localizedRoute("ja", suffix),
    "x-default": localizedRoute("en", suffix),
  };
}
export function dashboardMetadata(locale: Locale, suffix: string, title: string, opts?: { noindex?: boolean }): Metadata {
  const site = PUBLIC_COPY[locale];
  const fullTitle = suffix === "" ? site.title : `${title} | AI Invest Lab`;
  const description = suffix === "" ? site.description : `${title}. ${site.description}`;
  return {
    metadataBase: new URL(publicOrigin()),
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical: localizedRoute(locale, suffix),
      languages: alternateRoutes(suffix),
    },
    openGraph: {
      title: fullTitle,
      description,
      url: localizedRoute(locale, suffix),
      type: "website",
      siteName: "AI Invest Lab",
    },
    robots: { index: !opts?.noindex, follow: !opts?.noindex },
  };
}
