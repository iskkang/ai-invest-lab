import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav, DemoBanner, Footer, Sidebar, TopBar } from "@/components/shell";
import { getData, lastSessionDate } from "@/lib/data";
import { themeScript } from "@/lib/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "AI Invest Lab — AI Paper-Trading Leaderboard", template: "%s · AI Invest Lab" },
  description: "Four independent AI models compare simulated US-stock investment decisions under identical conditions. Educational research only.",
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
  const d = await getData();
  const symbols = d.universe.filter((u) => u.role === "investable").map((u) => ({ symbol: u.symbol, name: u.name }));
  return (
    <html lang={d.locale === "zh" ? "zh-CN" : d.locale} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh">
        <DemoBanner mode={d.mode} locale={d.locale} />
        <div className="flex">
          <Sidebar locale={d.locale} />
          <div className="min-w-0 flex-1">
            <TopBar asOf={lastSessionDate(d)} symbols={symbols} locale={d.locale} />
            <main className="px-4 pt-5 lg:px-6">{children}</main>
            <Footer locale={d.locale} />
          </div>
        </div>
        <BottomNav locale={d.locale} />
      </body>
    </html>
  );
}
