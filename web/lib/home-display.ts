import type { Locale } from "./public-content";

/** Empty valuation dates are a pre-round status, not a missing character. */
const PRE_FIRST: Record<Locale, string> = {
  ko: "첫 회차 전",
  en: "Before first round",
  zh: "首轮开始前",
  ja: "初回ラウンド前",
};

export function dataAsOfLabel(asOf: string, locale: Locale): string {
  return asOf.trim() || PRE_FIRST[locale];
}

/** The explanatory holder-dot legend must only appear when dots exist. */
export function hasHolderDots(rows: ReadonlyArray<{ holders: readonly unknown[] }>): boolean {
  return rows.some(row => row.holders.length > 0);
}
