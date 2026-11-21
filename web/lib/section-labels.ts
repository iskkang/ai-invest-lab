import type { Locale } from "./public-content";

/** Editorial labels used across the public site.
 * Technical identifiers (ticker/model codes) are deliberately not translated.
 * Korean UI never mixes an untranslated English section tag into Korean prose.
 */
export const SECTION_LABELS = {
  brandTagline: {
    ko: "AI 투자 연구소",
    en: "INTELLIGENCE LAB",
    zh: "AI 投资研究室",
    ja: "AI投資研究室",
  },
  researchDesk: {
    ko: "연구 메뉴 / 01",
    en: "RESEARCH DESK / 01",
    zh: "研究导航 / 01",
    ja: "研究メニュー / 01",
  },
  researchTerminal: {
    ko: "투자 연구 안내",
    en: "RESEARCH TERMINAL",
    zh: "投资研究指南",
    ja: "投資研究ガイド",
  },
  heroResearch: {
    ko: "MARKETSIGHTS / AI 투자 연구 01",
    en: "MARKETSIGHTS / AI RESEARCH 01",
    zh: "MARKETSIGHTS / AI 投资研究 01",
    ja: "MARKETSIGHTS / AI投資研究 01",
  },
  marketOrbit: {
    ko: "시장",
    en: "MARKET",
    zh: "市场",
    ja: "市場",
  },
  performanceSeason: {
    ko: "수익률 비교 / 첫 번째 시즌",
    en: "PERFORMANCE / SEASON 01",
    zh: "收益率比较 / 第一季",
    ja: "収益率比較 / 第1シーズン",
  },
  dailyBrief: {
    ko: "모의투자 / 오늘의 기록",
    en: "DAILY / AI INVEST LAB",
    zh: "模拟投资 / 今日记录",
    ja: "模擬投資 / 今日の記録",
  },
  disagreement: {
    ko: "AI 의견 / 차이 비교",
    en: "AI / DIFFERENCE ENGINE",
    zh: "AI 观点 / 分歧分析",
    ja: "AI判断 / 相違の分析",
  },
  decisionFollowup: {
    ko: "투자 판단 / 이후 결과",
    en: "DECISIONS / FOLLOW-UP",
    zh: "投资判断 / 后续结果",
    ja: "投資判断 / その後の結果",
  },
  decisionTracker: {
    ko: "MARKETSIGHTS / 판단 결과 추적",
    en: "MARKETSIGHTS / DECISION TRACKER",
    zh: "MARKETSIGHTS / 决策结果追踪",
    ja: "MARKETSIGHTS / 判断結果の追跡",
  },
  intelligence: {
    ko: "MARKETSIGHTS / AI 판단 분석",
    en: "MARKETSIGHTS / INTELLIGENCE",
    zh: "MARKETSIGHTS / AI 决策分析",
    ja: "MARKETSIGHTS / AI判断分析",
  },
  explore: {
    ko: "AI 분석 / 더 살펴보기",
    en: "INTELLIGENCE / EXPLORE",
    zh: "AI 分析 / 进一步了解",
    ja: "AI分析 / さらに詳しく",
  },
  researchSchedule: {
    ko: "투자 연구 / 진행 일정",
    en: "RESEARCH / SCHEDULE",
    zh: "投资研究 / 实验日程",
    ja: "投資研究 / 実施日程",
  },
  historicalResearch: {
    ko: "과거 데이터 / 전략 검증",
    en: "HISTORICAL / RESEARCH",
    zh: "历史数据 / 策略验证",
    ja: "過去データ / 戦略検証",
  },
  patternEvidence: {
    ko: "패턴 연구 / 실제 검증",
    en: "PATTERN LAB / EVIDENCE",
    zh: "形态研究 / 实证检验",
    ja: "パターン研究 / 検証結果",
  },
  portfolioAllWeather: {
    ko: "자산배분 / 올웨더",
    en: "PORTFOLIO / ALL WEATHER",
    zh: "资产配置 / 全天候",
    ja: "資産配分 / オールウェザー",
  },
  patternObservations: {
    ko: "패턴 분석 / 실제 관측 결과",
    en: "PATTERN / OBSERVATIONS",
    zh: "形态分析 / 实际观察结果",
    ja: "パターン分析 / 観測結果",
  },
  patternTeaser: {
    ko: "패턴 분석 / 투자 연구",
    en: "PATTERN LAB / RESEARCH",
    zh: "形态分析 / 投资研究",
    ja: "パターン分析 / 投資研究",
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type SectionLabelKey = keyof typeof SECTION_LABELS;
export function sectionLabel(locale: Locale, key: SectionLabelKey): string {
  return SECTION_LABELS[key][locale];
}
