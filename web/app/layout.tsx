import type { Metadata, Viewport } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { isLocale, type Locale } from "@/lib/public-content";
import { AppShell } from "@/components/app-shell";
import { getData, lastSessionDate } from "@/lib/data";
import { themeScript } from "@/lib/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "MarketSights — AI Paper-Trading Leaderboard", template: "%s · MarketSights" },
  description: "Compare four specific AI models using the same dated US-stock data, virtual starting capital and trading rules. Different model tiers; educational paper trading only.",
  // AdSense site verification metadata is emitted only after a real publisher
  // account is configured. This does not activate advertising.
  ...( /^pub-\d{16}$/.test(process.env.ADSENSE_PUBLISHER_ID ?? "") ? {
    other: {"google-adsense-account": (process.env.ADSENSE_PUBLISHER_ID ?? "").replace("pub-","ca-pub-")}
  } : {} ),
  // No global noindex: exact private routes are blocked by proxy.ts instead.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b0e13" }, { color: "#ffffff" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Keep independent research pages available when the private dataset is offline.
  // Never silently switch LIVE investment results to synthetic DEMO performance.
  const req = await headers();
  const candidate = req.get("x-ail-locale");
  const fallbackLocale: Locale = isLocale(candidate ?? "") ? (candidate as Locale) : "ko";
  let d: Awaited<ReturnType<typeof getData>> | null = null;
  try {
    d = await getData();
  } catch {
    console.error("[ail/web] market dataset unavailable; no fallback investment data was used");
  }
  const locale = d?.locale ?? fallbackLocale;
  const symbols = d?.universe.filter((u) => u.role === "investable").map((u) => ({ symbol: u.symbol, name: u.name })) ?? [];
  return (
    <html lang={locale === "zh" ? "zh-CN" : locale} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh">
        {/* The root App Router layout is preserved during client navigation.
            All language-dependent chrome must read the CURRENT pathname,
            not the initial server-rendered locale. */}
        <AppShell initialLocale={locale} asOf={d ? lastSessionDate(d) : ""} symbols={symbols}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
