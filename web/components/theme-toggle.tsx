"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const toggle = () => {
    const el = document.documentElement;
    const dark = !el.classList.contains("dark");
    el.classList.toggle("dark", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={toggle} aria-label="다크 모드 전환"
            className="grid h-9 w-9 place-items-center rounded-md border border-line text-muted hover:text-fg">
      <Sun size={16} className="hidden dark:block" />
      <Moon size={16} className="dark:hidden" />
    </button>
  );
}
