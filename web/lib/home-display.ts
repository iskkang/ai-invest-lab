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

/** A complete localized sentence avoids the Korean particle being separated
 * from the currency amount (e.g. "$100,000 로 시작"). */
export function experimentStartingSummary(
  locale: Locale, initialCash: number, startSession: string,
): string {
  const amount="$"+initialCash.toLocaleString("en-US");
  switch(locale){
    case "ko":return `같은 시장 데이터와 규칙으로 각 AI가 ${amount}로 시작합니다. 실험 시작일: ${startSession}`;
    case "en":return `Each AI starts with ${amount}, using the same market data and rules. Experiment starts: ${startSession}`;
    case "zh":return `各 AI 使用相同的市场数据和规则，以 ${amount} 起步。实验开始日：${startSession}`;
    case "ja":return `各AIが同じ市場データとルールで ${amount} から開始します。実験開始日：${startSession}`;
  }
}
