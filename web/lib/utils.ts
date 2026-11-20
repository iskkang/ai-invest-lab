import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtUsd = (v: number, digits: 0 | 2 = 0) => (digits === 0 ? usd0 : usd2).format(v);

export function fmtPct(v: number | null | undefined, digits = 2, signed = true) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = (v * 100).toFixed(digits);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}

export function fmtNum(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 상승·매수 = 초록, 하락·매도 = 빨강 (색상은 globals.css 의 --up / --down) */
export function toneClass(v: number | null | undefined) {
  if (v === null || v === undefined || v === 0 || !Number.isFinite(v)) return "text-muted";
  return v > 0 ? "text-up" : "text-down";
}

export const sideClass = (side: string) => (side === "BUY" ? "text-up" : side === "SELL" ? "text-down" : "text-muted");
export const sideLabel = (side: string) => (side === "BUY" ? "매수" : side === "SELL" ? "매도" : "보유");

export function fmtDateTimeNY(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }) + " ET";
}
