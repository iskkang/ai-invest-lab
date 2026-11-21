import type { Locale } from "./public-content";
import { isNavActive } from "./nav-active.ts";

/** The 13 original destination URLs are intentionally retained verbatim.
 * Both desktop dropdowns and mobile accordion read this single structure.
 */
export const NAV_GROUPS = [
  {
    id:"dashboard",href:"/",
    names:{ko:"대시보드",en:"Dashboard",zh:"仪表盘",ja:"ダッシュボード"},
    children:[],
  },
  {
    id:"compare",href:"/consensus",
    names:{ko:"AI 비교",en:"AI comparison",zh:"AI 对比",ja:"AI 比較"},
    children:[
      {href:"/consensus",names:{ko:"AI 판단 비교",en:"AI decisions",zh:"AI 决策对比",ja:"AI判断の比較"}},
      {href:"/performance",names:{ko:"성과 비교",en:"Performance",zh:"绩效对比",ja:"運用成績"}},
      {href:"/portfolio",names:{ko:"포트폴리오",en:"Portfolios",zh:"投资组合",ja:"ポートフォリオ"}},
      {href:"/trades",names:{ko:"거래 내역",en:"Trade history",zh:"交易记录",ja:"取引履歴"}},
    ],
  },
  {
    id:"research",href:"/patterns",
    names:{ko:"리서치",en:"Research",zh:"研究",ja:"リサーチ"},
    children:[
      {href:"/patterns",names:{ko:"패턴 연구",en:"Pattern Lab",zh:"形态研究",ja:"パターン研究"}},
      {href:"/historical",names:{ko:"과거 전략 연구",en:"Historical lab",zh:"历史策略研究",ja:"過去の戦略研究"}},
      {href:"/accuracy",names:{ko:"판단 정확도 검증",en:"Accuracy lab",zh:"判断准确率验证",ja:"判断精度の検証"}},
      {href:"/weekly",names:{ko:"주간 리포트",en:"Weekly insights",zh:"每周报告",ja:"週間レポート"}},
    ],
  },
  {
    id:"journal",href:"/daily",
    names:{ko:"일지",en:"Journal",zh:"实验日志",ja:"実験日誌"},
    children:[
      {href:"/daily",names:{ko:"일일 브리핑",en:"Daily brief",zh:"每日简报",ja:"デイリーブリーフ"}},
      {href:"/journal",names:{ko:"실험 일지",en:"Experiment journal",zh:"实验记录",ja:"実験日誌"}},
      {href:"/outcomes",names:{ko:"판단 결과 추적",en:"Decision follow-ups",zh:"决策结果追踪",ja:"判断結果の追跡"}},
    ],
  },
  {
    id:"about",href:"/about",
    names:{ko:"소개",en:"About",zh:"关于",ja:"概要"},
    children:[],
  },
] as const satisfies ReadonlyArray<{
  id:string; href:string; names:Record<Locale,string>;
  children:ReadonlyArray<{href:string;names:Record<Locale,string>}>;
}>;

export type NavGroupId = (typeof NAV_GROUPS)[number]["id"];

const ADDITIONAL_ROUTE_GROUPS: Partial<Record<NavGroupId, readonly string[]>> = {
  compare:["/ai"],
  research:["/stocks"],
  about:["/methodology","/faq","/privacy","/advertise"],
};

/** A child page selects exactly one parent; /ko is NOT active on /ko/weekly. */
export function activeNavGroup(path:string,locale:Locale):NavGroupId|null {
  for(const group of NAV_GROUPS){
    if(group.children.some(child=>isNavActive(path, "/"+locale+child.href)))return group.id;
    if(isNavActive(path, group.href==="/"?"/"+locale:"/"+locale+group.href))return group.id;
    const extras=ADDITIONAL_ROUTE_GROUPS[group.id]??[];
    if(extras.some(route=>isNavActive(path,"/"+locale+route)))return group.id;
  }
  return null;
}
