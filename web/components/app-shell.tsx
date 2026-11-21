"use client";

import { Footer, TopBar } from "@/components/shell";

/** Single-language shell. Retired locale dictionaries stay in the codebase. */
export function AppShell({
  children, symbols, asOf,
}: {
  children: React.ReactNode;
  initialLocale: import("@/lib/public-content").Locale;
  symbols: { symbol: string; name: string }[];
  asOf: string;
}) {
  return (
    <div className="min-h-screen min-w-0" data-active-locale="en">
      <TopBar locale="en" asOf={asOf} symbols={symbols} />
      <main className="mx-auto max-w-[1580px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">{children}</main>
      <Footer locale="en" />
    </div>
  );
}
