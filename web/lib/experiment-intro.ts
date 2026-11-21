import type { Locale } from "./public-content";

/** Keep Korean particles adjacent to the value they follow. */
export function experimentIntroText(
  locale: Locale,
  initialCash: number,
  startSession: string,
): string {
  const amount = "$" + initialCash.toLocaleString("en-US");
  return ({
    ko: `AI 4개 모두 같은 시장 데이터와 투자 규칙을 사용하며, 각각 ${amount}로 시작합니다. 첫 거래일은 ${startSession}입니다.`,
    en: `All four AIs use the same market data and rules, each starting with ${amount}. First session: ${startSession}.`,
    zh: `四个 AI 使用相同的市场数据与规则，每个初始资金为 ${amount}。首个交易日：${startSession}。`,
    ja: `4つのAIが同じ市場情報とルールを使い、それぞれ ${amount} から開始します。初回取引日：${startSession}。`,
  } as const)[locale];
}
