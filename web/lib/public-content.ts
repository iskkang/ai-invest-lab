/** Public-facing localized editorial content. This never includes private NH prices. */
// Keep archived translations available for a future multilingual relaunch.
// Only LOCALES participates in routing, prerendering and SEO.
export const SUPPORTED_LOCALES = ["ko", "en", "zh", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALES = ["en"] as const;
export const DEFAULT_LOCALE: Locale = "en";
export const PUBLIC_SECTIONS = ["methodology", "faq", "privacy"] as const;
export type PublicSection = (typeof PUBLIC_SECTIONS)[number];

export const LANG_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
  ko: "한국어",
  ja: "日本語",
};

export function isLocale(value: string): value is Locale {
  return value === "en";
}
export function isPublicSection(value: string): value is PublicSection {
  return PUBLIC_SECTIONS.includes(value as PublicSection);
}
export function publicOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://ai-invest-lab-five.vercel.app").replace(/\/+$/, "");
}
export function localeUrl(locale: Locale, section?: PublicSection) {
  return `${publicOrigin()}/${locale}${section ? `/${section}` : ""}`;
}
export function languageAlternates(section?: PublicSection) {
  return {
    en: localeUrl("en", section),
    "x-default": localeUrl("en", section),
  };
}

type Copy = {
  title: string;
  description: string;
  tagline: string;
  nav: Record<"home" | PublicSection | "dashboard" | "advertise", string>;
  hero: string;
  heroSub: string;
  actionLearn: string;
  actionDashboard: string;
  safety: string;
  metrics: [string, string][];
  features: { heading: string; text: string }[];
  current: string;
  currentBody: string;
  why: string;
  whyBody: string;
  footnote: string;
  aboutMethod: string;
  method: { heading: string; body: string }[];
  aboutFaq: string;
  faq: { q: string; a: string }[];
  aboutPrivacy: string;
  privacy: { heading: string; body: string }[];
  aboutAdvertise: string;
  advertise: { heading: string; body: string }[];
  adLabel: string;
  sponsorLabel: string;
  back: string;
  copyright: string;
};

export const PUBLIC_COPY: Record<Locale, Copy> = {
  en: {
    title: "LogicSight | Four AI Models, One Paper-Trading Experiment",
    description: "Compare these four AI models using the same dated US-stock market data, virtual starting capital and trading rules. Their size and price tiers are not equivalent. Methodology and limitations.",
    tagline: "Transparent AI paper-trading research",
    nav: {home:"Overview",methodology:"Methodology",faq:"FAQ",privacy:"Privacy",advertise:"Advertising",dashboard:"AI leaderboard"},
    hero: "How do four different AI models decide using the same market data, virtual capital and trading rules?",
    heroSub: "LogicSight compares the specified GPT, Claude, Gemini and DeepSeek versions with the same dated market data, virtual starting capital and trading rules. The models differ in size and price tier.",
    actionLearn:"Explore the methodology",actionDashboard:"Explore AI leaderboard",
    safety:"Educational simulation only. No real brokerage orders, personalized recommendations or guaranteed returns.",
    metrics:[["4 independent AIs","GPT · Claude · Gemini · DeepSeek"],["30 US stocks","A fixed investable starting universe"],["$100,000 each","Equal hypothetical starting capital"],["3 benchmarks","SPY · equal-weight · cash"]],
    features:[
      {heading:"Shared dated market-data snapshot",text:"A versioned, timestamped market-data packet is shared with every participant. AI responses are recorded separately; other models' decisions are excluded."},
      {heading:"Defined execution rules",text:"Hypothetical orders are evaluated against the next regular US session's opening price, subject to a published slippage assumption and position limits."},
      {heading:"Visible failures and caveats",text:"Missing prices, invalid answers or provider errors are not silently converted into successful trades. Short observation periods are not treated as evidence of skill."},
    ],
    current:"Experiment status",
    currentBody:"The private research dashboard may show a pre-first-session state until authentic decisions, hypothetical fills and valuations have been recorded. No demo performance is presented as real model results.",
    why:"What makes this comparison useful?",
    whyBody:"Instead of cherry-picking one AI answer, the experiment holds input data, starting capital, market timing and risk limits constant. Each participant keeps its own transaction history, allowing later comparison with SPY, equal-weight and cash benchmarks.",
    footnote:"Published educational descriptions do not include raw licensed market-data-provider stock-price feeds. Live dashboards remain access-controlled pending data-redistribution rights and privacy/security review.",
    aboutMethod:"A reproducible comparison needs fixed rules, timestamped information and an audit trail. The study separates decisions from later hypothetical fills and valuations.",
    method:[
      {heading:"1. Comparable information",body:"For each eligible NYSE decision session, participants receive the same dated market snapshot containing only prices and computed technical indicators known by the cutoff. Each AI sees only its own prior holdings and transactions; it cannot inspect competitors."},
      {heading:"2. Same virtual capital and constraints",body:"Each AI begins with $100,000 in hypothetical cash. The experiment starts with 30 US large-cap stocks. Any later administrator change requires a reason and is audit-logged. Long-only, whole shares, no borrowing and a 20% per-position limit apply to new orders."},
      {heading:"3. Independent answers",body:"Models return structured buy, sell or hold decisions. Responses are checked for schema validity, ticker membership, quantities and cash/position constraints. The intended model ID is pinned to prevent an unnoticed model substitution."},
      {heading:"4. Honest time separation",body:"The decision is made before the regular US market opens, using prior-session data. Any accepted paper order is priced with the next regular opening price and the published hypothetical slippage and fee assumptions. That opening price is unknown at decision time."},
      {heading:"5. Reproducibility and errors",body:"Decision requests, market hashes, simulations and the virtual ledger are stored for audit. Missing or revised data and invalid model answers can stop a round. A stopped round is not counted as a completed investment outcome. Responses completed after the 09:15 ET cutoff cause the entire round to be aborted without orders or performance counting (22:15 KST during daylight saving time; 23:15 KST during standard time)."},
      {heading:"6. Interpreting performance",body:"Returns are simulated, not customer returns. Compare against the SPY buy-and-hold, 30-stock equal-weight and all-cash benchmarks. Sharpe, win rate and other statistics require sufficient observations; short windows are inconclusive."},
    ],
    aboutFaq:"Short answers about the AI comparison, public data availability and the limits of simulated performance.",
    faq:[
      {q:"Is this an investment advisory or automated brokerage?",a:"No. It is an educational, virtual-money experiment. It cannot execute a real brokerage order and does not provide individual investment advice."},
      {q:"Do the four AI models receive the same information?",a:"They receive the same timestamped market snapshot and general rules. Each only receives its own portfolio and previous decisions; their private state therefore differs naturally after decisions diverge."},
      {q:"Why might the dashboard be empty?",a:"The project may be initialized before its first verified NYSE decision session. API connectivity alone is not a trading result. Genuine orders and returns only appear after valid sessions and simulated settlement."},
      {q:"How are returns calculated?",a:"Accepted hypothetical orders are evaluated using a subsequent regular-session opening price plus disclosed simulated costs. Portfolio values are then marked using available session prices. Actual market execution may differ."},
      {q:"Can a better model be proven after a week?",a:"No. A small sample cannot establish predictive skill. Model versions, data availability, market regimes and risk assumptions can materially affect comparisons."},
      {q:"Why are raw price charts not publicly available?",a:"The service must confirm the market-data provider's redistribution permissions before publishing licensed quotes. Public research pages describe methodology without exposing the private feed."},
    ],
    aboutPrivacy:"How the public pages and prospective advertising handle data.",
    privacy:[
      {heading:"Current public website",body:"The public language pages are informational. They do not require an account and do not request brokerage credentials. Language navigation is encoded in the page URL. The public results dashboard is separately access-controlled."},
      {heading:"Hosting and logs",body:"The hosting platform may process IP addresses and technical request information to serve the website and protect its infrastructure. Operational retention and country of processing depend on the hosting provider's applicable configuration."},
      {heading:"Analytics and advertising",body:"Third-party advertising and personalized tracking are not enabled by this site implementation. If advertising or analytics is activated later, this notice must be updated and required consent management must be deployed before applicable data processing."},
      {heading:"Data minimization",body:"No private portfolio database keys or API secrets are shipped to browsers. Licensed market feeds and the public results dashboard are outside the public search index."},
    ],
    aboutAdvertise:"Editorial sponsorship and future advertising opportunities for finance, data and research audiences.",
    advertise:[
      {heading:"Relevant placements",body:"Potential placements include a clearly marked sponsor unit within the educational overview, a single in-article placement and a footer sponsorship. Ads never imitate rankings, AI trade decisions or independent research findings."},
      {heading:"Editorial independence",body:"Sponsors cannot influence benchmark selection, the AI models' decisions, historical trading records or performance calculations. Sponsored links will be labelled and use appropriate rel attributes."},
      {heading:"Programmatic ads",body:"Google AdSense or other networks require account/site approval, original content, the applicable privacy disclosures, an authorized ads.txt entry and lawful consent handling. No publisher ID or revenue is assumed before approval."},
      {heading:"Finance advertising safeguards",body:"Financial promotions must meet local advertising and publisher policies and avoid guaranteed-return or misleading performance claims. Contextual category targeting may be requested but individual stock-advertiser selection is not guaranteed."},
    ],
    adLabel:"Advertisement",sponsorLabel:"Sponsored",back:"Back to overview",copyright:"LogicSight — educational research, not financial advice.",
  },
  zh: {
    title:"LogicSight｜四大 AI 模型模拟投资研究",
    description:"在相同日期的市场数据、虚拟起始资金与交易规则下比较四个具体 AI 模型。模型规模及价格档次并不相同。查看研究方法与限制。",
    tagline:"透明的 AI 模拟投资研究",
    nav:{home:"概览",methodology:"研究方法",faq:"常见问题",privacy:"隐私",advertise:"广告合作",dashboard:"AI 排行榜"},
    hero:"采用相同市场数据、虚拟资金和交易规则时，这四个 AI 模型会如何决策？",
    heroSub:"LogicSight 使用同一份带时间戳的市场数据、相同虚拟起始资金和交易规则，比较 GPT、Claude、Gemini、DeepSeek 四个具体模型。它们的规模与价格档次不同。",
    actionLearn:"了解研究方法",actionDashboard:"进入AI 排行榜",
    safety:"仅供教育与研究。无真实证券交易、个性化投资建议或收益保证。",
    metrics:[["4 个独立 AI","GPT · Claude · Gemini · DeepSeek"],["30 只美股","固定的初始投资股票池"],["每个 $100,000","相同的虚拟起始资金"],["3 项基准","SPY · 等权重 · 现金"]],
    features:[
      {heading:"相同的市场快照",text:"每个参与模型获得相同的、可追溯时间的市场数据；AI 的回答独立记录，不包含其他模型的判断。"},
      {heading:"明确的模拟成交规则",text:"模拟订单按之后的美股正常交易时段开盘价估算，并受到滑点假设和仓位上限约束。"},
      {heading:"错误和局限公开说明",text:"缺失的价格、无效回答或服务错误不会被伪装成成功交易。较短的观察期无法证明模型具备投资能力。"},
    ],
    current:"实验状态",
    currentBody:"在首次真实验证的 AI 决策、模拟成交与估值产生前，AI 排行榜可能显示等待状态。演示收益不会冒充真实模型业绩。",
    why:"为什么这种比较有意义？",
    whyBody:"研究统一市场数据、起始资金、决策时点与风险限制，而不是挑选某一次漂亮的 AI 回答。每个模型保留独立交易历史，并与 SPY、等权重投资组合及现金基准比较。",
    footnote:"公开研究页面不提供受许可限制的 licensed market-data provider 原始股价数据。AI 决策和模拟账户表现可公开查看，但未经授权不得重新发布原始行情或成交单价。",
    aboutMethod:"可信的比较需要固定规则、时间戳和审计记录。本研究将决策、后续模拟成交与估值分开记录。",
    method:[
      {heading:"1. 一致的信息",body:"在符合条件的纽约证券交易所交易日，每个 AI 获取同一份截止时已知的历史价格和技术指标。每个模型只能读取自己的持仓与交易，不能查看竞争模型。"},
      {heading:"2. 相同虚拟资金与限制",body:"每个 AI 以 $100,000 虚拟现金开始，从 30 只美国大型股票中选择。只允许做多、整数股、不使用杠杆，新买入订单受单一股票 20% 的仓位限制。"},
      {heading:"3. 独立结构化回答",body:"模型按 JSON 格式给出买入、卖出或持有决定，程序验证股票代码、数量、现金与仓位限制，并锁定模型版本，避免无声替换。"},
      {heading:"4. 避免未来信息",body:"AI 在美股正常开盘前，只使用此前已确认的数据作决定。通过验证的模拟订单使用随后交易时段的开盘价及公开的假设成本估算；决策时无法知道该价格。"},
      {heading:"5. 审计和失败处理",body:"保存数据哈希、决策请求、虚拟账本与模拟结果。数据缺失、行情被修订或 AI 输出无效，都可能导致该轮停止，而不会伪造结果。若 AI 回答在美国东部时间 09:15 截止后才完成，则整轮中止、不生成模拟订单、也不计入正式业绩（韩国夏令时段 22:15 KST / 标准时段 23:15 KST）。"},
      {heading:"6. 正确解读收益",body:"所有收益均为模拟数据，并非客户实盘业绩。与 SPY 持有、30 股等权重及现金基准比较；夏普比率等指标需要足够样本。"},
    ],
    aboutFaq:"关于四大 AI 的独立比较、公开数据以及模拟收益局限的简要说明。",
    faq:[
      {q:"这是投资顾问或自动证券交易平台吗？",a:"不是。这是使用虚拟资金的教育性研究，不会下达真实证券订单，也不提供个人投资建议。"},
      {q:"四个 AI 获得的数据完全相同吗？",a:"它们获得相同的市场快照和规则；但每个 AI 只能看到自己的账户和过往操作，因此账户状态可能逐渐不同。"},
      {q:"为什么仪表盘没有交易结果？",a:"可能尚未进入第一个有效交易日。API 连接成功不等于已经产生投资结果；只有真实调用、验证及模拟结算后才会出现记录。"},
      {q:"收益率如何计算？",a:"通过验证的模拟订单根据之后正常交易时段的开盘价和假设成本估算，再根据可用的价格对组合估值。实际成交可能不同。"},
      {q:"一周内能证明哪个模型最好吗？",a:"不能。样本过短不足以证明预测能力。模型版本、市场环境及风险假设都会影响结果。"},
      {q:"为何不公开原始行情图表？",a:"必须先确认行情提供商允许重新发布数据。公开页面仅介绍研究方法，不公开私人行情源。"},
    ],
    aboutPrivacy:"公开页面与未来广告的数据处理原则。",
    privacy:[
      {heading:"当前公开页面",body:"公开的语言页面只提供信息，不需要账户或证券凭据。语言由页面 URL 决定，AI 排行榜单独受访问控制。"},
      {heading:"托管和技术日志",body:"网站托管商可能为了服务和安全处理 IP 地址等技术信息。保留期限和处理地区取决于托管平台的相关设置。"},
      {heading:"统计与广告",body:"当前实现未启用第三方广告或个性化追踪。将来上线时，需要更新此说明，并按照适用法规部署合规的同意管理工具。"},
      {heading:"数据最小化",body:"浏览器不会收到数据库密钥或 API 秘密。许可行情与AI 排行榜不会被公开索引。"},
    ],
    aboutAdvertise:"面向金融科技、研究工具和数据用户的广告及赞助规划。",
    advertise:[
      {heading:"广告位置",body:"拟在教育性概览、研究正文和页脚设置清晰标注的赞助位。广告不得模仿 AI 排名、买卖判断或独立研究结果。"},
      {heading:"编辑独立性",body:"赞助商不能影响研究基准、AI 决策、历史交易或表现计算。付费链接需明确标识。"},
      {heading:"程序化广告",body:"Google AdSense 等平台需审核网站与账户，提供原创内容、隐私披露、有效 ads.txt，并处理所需的用户同意。批准前不假设广告收入。"},
      {heading:"金融广告要求",body:"金融推广应符合当地法律与平台政策，不得承诺收益或误导读者。可以考虑财经相关广告，但不能保证出现特定股票广告。"},
    ],
    adLabel:"广告",sponsorLabel:"赞助",back:"返回概览",copyright:"LogicSight — 仅供教育研究，不构成投资建议。",
  },
  ko: {
    title:"LogicSight | GPT·Claude·Gemini·DeepSeek 모의투자 비교",
    description:"같은 날짜의 시장 데이터·가상 원금·매매 규칙으로 4개 AI 모델의 모의투자 판단을 비교합니다. 모델의 규모와 가격대는 서로 다릅니다. 실험 방법과 한계를 확인하세요.",
    tagline:"검증 가능한 AI 모의투자 연구",
    nav:{home:"서비스 소개",methodology:"실험 방법",faq:"자주 묻는 질문",privacy:"개인정보",advertise:"광고·협찬",dashboard:"AI 성과 대시보드"},
    hero:"같은 데이터·가상 원금·매매 규칙으로 네 AI는 어떻게 판단할까?",
    heroSub:"LogicSight는 GPT·Claude·Gemini·DeepSeek 4개 모델이 같은 날짜의 미국 주식 데이터·가상 원금·매매 규칙으로 독립적으로 판단하는 교육용 모의투자 실험입니다. 모델 규모와 가격대는 다릅니다.",
    actionLearn:"실험 방법",actionDashboard:"AI 성과 대시보드 열기",
    safety:"교육·연구용 모의투자입니다. 실제 주식 주문, 개인별 투자 권유, 수익 보장은 없습니다.",
    metrics:[["독립 AI 4개","GPT · Claude · Gemini · DeepSeek"],["미국 주식 30개","고정된 초기 투자 종목군"],["AI별 가상 $100,000","동일한 초기 투자 원금"],["비교 기준 3개","SPY · 동일비중 · 현금"]],
    features:[
      {heading:"동일한 시장 데이터",text:"각 모델은 기준일·시각이 기록된 동일한 데이터 스냅샷을 받습니다. 다른 AI의 투자 판단은 공유하지 않습니다."},
      {heading:"명확한 모의 체결 규칙",text:"승인된 가상 주문은 이후 정규장 시가를 기준으로 슬리피지와 종목별 투자 비중 제한을 적용해 평가합니다."},
      {heading:"실패와 한계도 기록",text:"시세 누락·형식 오류·API 실패를 임의로 성공 거래로 처리하지 않습니다. 짧은 기간의 성과로 AI 투자 실력을 단정하지 않습니다."},
    ],
    current:"실험 진행 상태",
    currentBody:"실제 AI 판단·가상 체결·평가 기록이 생성되기 전에는 AI 성과 대시보드에 시작 대기 상태가 표시될 수 있습니다. 예시 수익률을 실제 모델 성과인 것처럼 표시하지 않습니다.",
    why:"이 실험의 핵심은 무엇인가?",
    whyBody:"특정 AI의 유리한 답변만 골라 비교하지 않습니다. 동일한 데이터·초기 원금·판단 시점·위험 규칙을 유지하고, AI별 거래 내역을 SPY·동일비중 포트폴리오·현금과 비교합니다.",
    footnote:"공개 페이지에는 licensed market-data provider의 원본 주가 데이터를 게시하지 않습니다. AI 투자 판단과 가상 수익률은 공개하되, 재배포 허가되지 않은 원본 주가와 체결 단가는 공개하지 않습니다.",
    aboutMethod:"검증 가능한 비교를 위해 규칙·정보 기준 시각·감사 기록을 고정합니다. 투자 판단과 나중의 모의 체결·평가를 분리합니다.",
    method:[
      {heading:"1. 완전히 동일한 시장 데이터",body:"미국 거래소의 유효한 판단 시점마다 AI 네 개에 똑같은 과거 주가·기술적 지표 스냅샷을 제공합니다. 각 AI는 자신의 계좌·과거 거래만 볼 수 있으며 경쟁 AI의 정보는 받지 않습니다."},
      {heading:"2. 동일한 가상 자금과 제약",body:"AI마다 초기 원금은 가상 $100,000입니다. 미국 대형주 30종목을 대상으로 공매도·신용·레버리지를 제한하고, 정수 주식만 거래하며 신규 매수 비중은 종목당 20%로 제한합니다."},
      {heading:"3. 독립적인 AI 판단",body:"각 모델은 매수·매도·보유 의견을 구조화된 JSON으로 제출합니다. 종목·수량·계좌 제약을 검증하고 요청한 모델이 바뀌지 않도록 모델 버전을 고정합니다."},
      {heading:"4. 미래 정보 사용 방지",body:"판단은 미국 정규장 개장 전에 직전 거래일까지 확인된 데이터만 사용합니다. 유효한 가상 주문은 이후 개장 시가와 공개된 가상 비용 가정을 적용하며, 판단 당시에는 그 시가를 알 수 없습니다."},
      {heading:"5. 무결성과 실패 기록",body:"판단 요청·시세 해시·모의 원장·결과를 검증할 수 있도록 보관합니다. 시세가 누락되거나 수정되거나 AI 응답이 무효이면 회차가 중단될 수 있으며, 가짜 수익률로 대체하지 않습니다. 미국 동부시간 09:15 이후 AI 판단이 완료되면 해당 회차는 중단·미집계 처리하고 가상 주문을 만들지 않습니다(마감 22:15 KST(서머타임) / 23:15 KST(표준시))."},
      {heading:"6. 성과 해석의 한계",body:"표시되는 수익은 모두 가상 체결 결과입니다. SPY 장기보유·30종목 동일비중·현금과 비교하되, 샤프 지수와 거래 승률은 관찰 자료가 충분할 때만 해석할 수 있습니다."},
    ],
    aboutFaq:"AI 비교 방식과 공개 범위, 모의 성과의 의미에 대한 답변입니다.",
    faq:[
      {q:"실제 주식을 사거나 투자 자문을 제공하나요?",a:"아닙니다. 가상 자금으로 진행하는 교육·연구 실험이며 실제 증권 주문이나 개인별 투자 조언을 제공하지 않습니다."},
      {q:"네 AI에 정말 같은 데이터가 들어가나요?",a:"시세 스냅샷과 공통 규칙은 동일합니다. 다만 AI마다 자신의 과거 매매·잔액만 보므로 시간이 지나면 계좌 상태는 달라집니다."},
      {q:"왜 사이트에 투자 성과가 없나요?",a:"첫 유효한 판단 회차가 시작되기 전일 수 있습니다. API 연결 성공은 투자 성과가 아닙니다. 검증된 판단·가상 체결·평가가 생성되었을 때만 기록이 나옵니다."},
      {q:"수익률은 어떻게 계산하나요?",a:"유효한 가상 주문을 이후 정규장 시가에 가상 비용을 더해 체결한 것으로 계산하고, 확정된 시세로 포트폴리오를 평가합니다. 실제 체결 결과와 다를 수 있습니다."},
      {q:"일주일 만에 가장 좋은 AI를 판단할 수 있나요?",a:"아닙니다. 단기 수익률로 예측 능력을 입증할 수 없습니다. 시장 환경, AI 모델 버전, 데이터 품질과 위험 제한의 영향이 큽니다."},
      {q:"실시간 주가 차트가 공개되지 않는 이유는?",a:"시세 공급자의 원본 데이터 재배포 허가가 확인되지 않았기 때문입니다. 공개 페이지는 원본 시세 대신 실험 방법을 설명합니다."},
    ],
    aboutPrivacy:"공개 웹사이트와 향후 광고 운영에 관한 데이터 처리 안내입니다.",
    privacy:[
      {heading:"현재 공개 페이지",body:"4개 언어의 소개 페이지는 별도 가입이나 증권 계좌 인증 없이 접근할 수 있습니다. 선택한 언어는 URL로 표현되며 실제 투자 대시보드는 별도로 보호됩니다."},
      {heading:"호스팅 로그",body:"서비스 제공과 인프라 보안을 위해 호스팅 업체가 IP 주소 및 기술적 요청 정보를 처리할 수 있습니다. 보존 기간과 처리 지역은 해당 호스팅 설정의 영향을 받습니다."},
      {heading:"통계·광고",body:"현재 구현에는 제3자 광고와 개인화 추적이 활성화되지 않았습니다. 향후 이를 도입할 경우 개인정보 안내를 갱신하고 필요한 동의 관리 기능을 먼저 적용해야 합니다."},
      {heading:"비밀정보 보호",body:"브라우저에 데이터베이스 비밀키나 모델 API 키를 전달하지 않습니다. 허가가 필요한 원본 시세 및 비공개 관리 기능은 검색 인덱스에서 제외됩니다."},
    ],
    aboutAdvertise:"금융·데이터·연구 관심 사용자를 대상으로 한 광고와 협찬 운영 계획입니다.",
    advertise:[
      {heading:"광고 배치",body:"교육용 소개·방법론 본문·하단에 명확히 표시되는 협찬 영역을 고려합니다. 광고를 AI 순위표나 매수·매도 판단인 것처럼 꾸미지 않습니다."},
      {heading:"편집 독립성",body:"광고주가 비교 대상·AI 판단·거래 기록·성과 계산에 영향을 줄 수 없습니다. 유료 링크에는 광고 표시와 적절한 링크 속성을 사용합니다."},
      {heading:"애드센스 준비",body:"Google AdSense 등은 별도의 사이트·계정 심사와 독창적 콘텐츠, 개인정보 고지, 정확한 ads.txt, 필요한 사용자 동의 관리가 요구됩니다. 승인 전에 수익이 발생한다고 가정하지 않습니다."},
      {heading:"금융 광고의 제한",body:"금융 광고는 국가별 광고 규정과 플랫폼 정책을 따라야 하며 수익 보장 등 오해 소지가 있는 표현을 금지합니다. 금융 분야의 문맥 광고를 고려할 수 있지만 특정 주식 광고를 임의로 보장할 수는 없습니다."},
    ],
    adLabel:"광고",sponsorLabel:"협찬",back:"서비스 소개로",copyright:"LogicSight — 교육·연구용이며 투자 자문이 아닙니다.",
  },
  ja: {
    title:"LogicSight｜4つのAIによる米国株シミュレーション比較",
    description:"4つのAIモデルが同じ日付の市場データ・仮想初期資金・売買ルールで独立して判断する模擬投資研究。モデルの規模と価格帯は異なります。",
    tagline:"透明性を重視したAI模擬投資研究",
    nav:{home:"概要",methodology:"研究方法",faq:"よくある質問",privacy:"プライバシー",advertise:"広告・協賛",dashboard:"AIランキング"},
    hero:"同じ市場データ・仮想資金・売買ルールで4つのAIはどう判断するのか？",
    heroSub:"LogicSightは4つのAIモデルが同じ日付の米国株データ・仮想初期資金・売買ルールで個別に判断する教育用研究です。モデルの規模と価格帯は同じではありません。",
    actionLearn:"研究方法を見る",actionDashboard:"AIランキングへ",
    safety:"教育・研究目的の模擬投資です。実際の発注、個別の投資助言、利益保証はありません。",
    metrics:[["4つの独立AI","GPT · Claude · Gemini · DeepSeek"],["米国株30銘柄","初期の投資可能銘柄群"],["各AIに仮想$100,000","同一の初期資金"],["3つの比較基準","SPY · 等ウェイト · 現金"]],
    features:[
      {heading:"同一の市場スナップショット",text:"すべてのAIに同一の時点確定データを提供します。他のAIの判断内容は共有せず、各モデルの回答を別々に記録します。"},
      {heading:"透明な仮想約定ルール",text:"検証済みの仮想注文は、次の米国市場の通常取引開始価格とスリッページの想定、ポジション上限に基づいて評価されます。"},
      {heading:"失敗も記録する仕組み",text:"価格の欠落や無効な回答、APIエラーを成功した取引として扱いません。短期間の結果のみでAIの投資能力を証明することはできません。"},
    ],
    current:"実験の進行状況",
    currentBody:"有効な判断、仮想約定、評価記録が生成されるまではAIランキングが開始待ちとなる場合があります。デモ損益を実際のモデル成績として表示しません。",
    why:"この比較で分かること",
    whyBody:"都合のよい回答だけを採用せず、市場データ、初期資金、判断時刻、リスク条件を統一します。各AIの履歴をSPY、等ウェイト、現金と比較することで経過を検証できます。",
    footnote:"公開ページではlicensed market-data providerのライセンス対象となる株価原データを提供しません。再配布許諾・プライバシー・セキュリティの確認が終わるまで実験ダッシュボードは保護されます。",
    aboutMethod:"公平な検証には固定ルール、情報の基準時刻、監査記録が必要です。判断と後続の仮想約定・評価を区別しています。",
    method:[
      {heading:"1. 同じ市場情報",body:"米国取引所の対象営業日ごとに、締切時点までに確認された過去の株価とテクニカル指標を同じ形式で配布します。各AIは自分の残高・保有・取引のみ参照できます。"},
      {heading:"2. 同一の仮想資金と制約",body:"各AIは仮想$100,000から開始し、米国大型株30銘柄を対象とします。現物買いのみ、整数株、借入・レバレッジなし、新規購入時の1銘柄上限20%を適用します。"},
      {heading:"3. 独立した意思決定",body:"AIは売買・保有を構造化JSONで回答します。銘柄、株数、現金と比率の制約を検証し、モデルIDを固定して無断のモデル切替を防ぎます。"},
      {heading:"4. 将来情報の排除",body:"米国市場の通常取引開始前に、前営業日までの確定情報だけで判断します。仮想注文にはその後の始値と公開された費用想定を使用しますが、判断時点では始値は不明です。"},
      {heading:"5. 監査と失敗の扱い",body:"データハッシュ、リクエスト、仮想台帳と結果を検証可能な形で保存します。欠落・修正された市場情報や無効なAI回答があればラウンドを中断し、架空の成果を作りません。米東部時間09:15の締切を超えてAI判断が完了した場合はラウンドを中断・集計対象外とし、仮想注文を作りません（韓国時間は夏時間22:15 KST／標準時23:15 KST）。"},
      {heading:"6. 結果の読み方",body:"すべて仮想約定の成果であり実際の運用成績ではありません。SPY保有、30銘柄等ウェイト、現金と比較し、シャープレシオ等は十分な観測数がある場合に解釈します。"},
    ],
    aboutFaq:"AIの公平な比較、公開データ、模擬成績の限界について説明します。",
    faq:[
      {q:"実際の証券取引や投資助言は行いますか？",a:"いいえ。仮想資金による教育・研究のための実験であり、実際の発注や個人向け投資助言は行いません。"},
      {q:"4つのAIが受け取る情報は同じですか？",a:"共通の市場情報とルールは同じです。ただし各AIが見る自分の残高と過去の売買は、判断が分かれた後には異なります。"},
      {q:"取引成績が表示されないのはなぜですか？",a:"最初の有効な判断日より前の可能性があります。API接続に成功しても投資結果は自動生成されません。検証された判断、仮想約定、評価を経て初めて表示されます。"},
      {q:"利益率はどう計算しますか？",a:"有効な仮想注文を次の通常取引開始価格と想定費用で計算し、その後の確定価格で資産を評価します。実際の約定とは異なる場合があります。"},
      {q:"1週間で最も優秀なAIが分かりますか？",a:"いいえ。少ない観測数では予測能力は証明できません。市場環境、モデルのバージョン、データ品質、リスク制約が結果に影響します。"},
      {q:"株価チャートを一般公開しない理由は？",a:"市場データ提供者の再配布許諾を確認する必要があるためです。公開サイトには方法論を掲載し、非公開の価格データは掲載しません。"},
    ],
    aboutPrivacy:"公開ページと将来の広告利用についての情報です。",
    privacy:[
      {heading:"現在の公開ページ",body:"4言語の案内ページは登録や証券口座情報を求めません。言語はURLで指定され、実験ダッシュボードは別途アクセス制限されています。"},
      {heading:"ホスティングとログ",body:"インフラ運営と保護のため、ホスティング事業者がIPアドレス等の技術情報を取り扱う場合があります。保持期間と処理地域は該当サービス設定に従います。"},
      {heading:"解析・広告",body:"現段階では第三者広告およびパーソナライズされたトラッキングを有効化していません。導入時には本案内を更新し、必要な同意管理を整備します。"},
      {heading:"秘密情報の管理",body:"ブラウザへDBシークレットやAI APIキーを配布しません。許諾が必要な株価と非公開画面は検索インデックスから除外します。"},
    ],
    aboutAdvertise:"金融・データ・研究分野の読者向けの広告・協賛設計について。",
    advertise:[
      {heading:"予定する広告枠",body:"教育コンテンツ内、解説本文、フッターに明示された協賛枠を想定します。広告をAIランキングや売買判断に見せかけることはありません。"},
      {heading:"編集の独立性",body:"スポンサーは実験の比較基準、モデルの判断、過去の取引や成績計算を左右できません。有料リンクは適切に明示します。"},
      {heading:"広告ネットワーク",body:"Google AdSense等の導入にはサイト審査、独自コンテンツ、プライバシー開示、正しいads.txtおよび必要な同意管理が必要です。承認前の収益は保証できません。"},
      {heading:"金融広告の注意",body:"各国の法律とプラットフォーム規則に従い、利益保証等の誤解を招く表現を避けます。金融分野の文脈広告は検討できますが、特定の銘柄広告の表示を保証しません。"},
    ],
    adLabel:"広告",sponsorLabel:"スポンサー",back:"概要へ戻る",copyright:"LogicSight — 教育・研究用であり投資助言ではありません。",
  },
};
