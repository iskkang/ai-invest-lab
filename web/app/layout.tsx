import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav, DemoBanner, Footer, Sidebar, TopBar } from "@/components/shell";
import { getData, lastSessionDate } from "@/lib/data";
import { themeScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "AI Invest Lab — AI 모의투자 리더보드", template: "%s · AI Invest Lab" },
  description: "GPT·Claude·Gemini·DeepSeek가 같은 데이터·같은 규칙으로 미국 대형주를 모의투자합니다. 교육·연구용, 투자 권유 아님.",
  robots: process.env.SITE_ACCESS === "public" ? undefined : { index: false, follow: false },
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <DemoBanner mode={d.mode} />
        <div className="flex">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <TopBar asOf={lastSessionDate(d)} symbols={symbols} />
            <main className="px-4 pt-5 lg:px-6">{children}</main>
            <Footer />
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
