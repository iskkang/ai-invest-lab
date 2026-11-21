"use client";

import { Moon, Sun } from "lucide-react";
import type { Locale } from "@/lib/public-content";

export function ThemeToggle({locale="ko"}:{locale?:Locale}) {
  const toggle = () => {
    const el = document.documentElement;
    const dark = !el.classList.contains("dark");
    el.classList.toggle("dark", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={toggle} aria-label={({ko:"다크 모드 전환",en:"Toggle dark mode",zh:"切换深色模式",ja:"ダークモード切替"} as const)[locale]}
            className="grid h-11 w-11 place-items-center rounded-xl border border-line text-muted hover:text-fg">
      <Sun size={16} className="hidden dark:block" />
      <Moon size={16} className="dark:hidden" />
    </button>
  );
}
