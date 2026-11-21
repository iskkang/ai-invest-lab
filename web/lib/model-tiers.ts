import type { Locale } from "./public-content";

/** Editorial classification verified against each manufacturer's own page.
 * Empty string means NO verified relative tier, not "lightweight".
 * Model IDs themselves come ONLY from the generated Python engine manifest.
 */
export const MODEL_TIER_EVIDENCE = {
  gpt:{
    tier:{ko:"소형(mini)",en:"Small (mini)",zh:"小型 (mini)",ja:"小型 (mini)"},
    source:"https://developers.openai.com/api/docs/models/gpt-4.1-mini",
  },
  claude:{
    tier:{ko:"Sonnet 계열·균형형",en:"Sonnet / balanced",zh:"Sonnet 系列·均衡型",ja:"Sonnet系・バランス型"},
    source:"https://www.anthropic.com/claude-sonnet-5-5",
  },
  gemini:{
    tier:{ko:"Flash 계열·범용 실무형",en:"Flash / workhorse",zh:"Flash 系列·通用型",ja:"Flash系・汎用実務型"},
    source:"https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models",
  },
  deepseek:{
    tier:{ko:"",en:"",zh:"",ja:""},
    source:"https://www.deepseek.com/en/news/deepseek-v3-2/",
  },
} as const satisfies Record<string,{tier:Record<Locale,string>;source:string}>;

export type ModelTierId=keyof typeof MODEL_TIER_EVIDENCE;
