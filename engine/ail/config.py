"""환경 설정. 비밀값은 환경변수에서만 읽고 로그·DB에 남기지 않는다."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

# 초기 투자 대상 30종목 (관리자 CLI로 변경 가능, 변경 이력은 stock_universe 행으로 보존)
DEFAULT_UNIVERSE: list[tuple[str, str, str]] = [
    ("AAPL", "Apple", "Information Technology"),
    ("MSFT", "Microsoft", "Information Technology"),
    ("NVDA", "NVIDIA", "Information Technology"),
    ("AVGO", "Broadcom", "Information Technology"),
    ("ORCL", "Oracle", "Information Technology"),
    ("CRM", "Salesforce", "Information Technology"),
    ("AMD", "Advanced Micro Devices", "Information Technology"),
    ("CSCO", "Cisco Systems", "Information Technology"),
    ("AMZN", "Amazon.com", "Consumer Discretionary"),
    ("TSLA", "Tesla", "Consumer Discretionary"),
    ("HD", "Home Depot", "Consumer Discretionary"),
    ("GOOGL", "Alphabet Class A", "Communication Services"),
    ("META", "Meta Platforms", "Communication Services"),
    ("NFLX", "Netflix", "Communication Services"),
    ("JPM", "JPMorgan Chase", "Financials"),
    ("V", "Visa", "Financials"),
    ("MA", "Mastercard", "Financials"),
    ("BAC", "Bank of America", "Financials"),
    ("LLY", "Eli Lilly", "Health Care"),
    ("UNH", "UnitedHealth Group", "Health Care"),
    ("JNJ", "Johnson & Johnson", "Health Care"),
    ("ABBV", "AbbVie", "Health Care"),
    ("MRK", "Merck & Co.", "Health Care"),
    ("WMT", "Walmart", "Consumer Staples"),
    ("COST", "Costco Wholesale", "Consumer Staples"),
    ("PG", "Procter & Gamble", "Consumer Staples"),
    ("KO", "Coca-Cola", "Consumer Staples"),
    ("PEP", "PepsiCo", "Consumer Staples"),
    ("XOM", "Exxon Mobil", "Energy"),
    ("CVX", "Chevron", "Energy"),
]
BENCHMARK_SYMBOL = ("SPY", "SPDR S&P 500 ETF Trust", "ETF")

# 참가자 기본 모델 (2026-11-21 OpenRouter 목록에서 확인한 고정 ID. 별칭 '~...-latest' 사용 금지)
DEFAULT_PARTICIPANTS: list[dict] = [
    {"id": "gpt", "name": "GPT", "env": "AIL_MODEL_GPT", "model": "openai/gpt-4.1-mini", "color": "#10a37f"},
    {"id": "claude", "name": "Claude", "env": "AIL_MODEL_CLAUDE", "model": "anthropic/claude-sonnet-5.5", "color": "#d97757"},
    {"id": "gemini", "name": "Gemini", "env": "AIL_MODEL_GEMINI", "model": "google/gemini-3.8-flash", "color": "#4285f4"},
    {"id": "deepseek", "name": "DeepSeek", "env": "AIL_MODEL_DEEPSEEK", "model": "deepseek/deepseek-v3.2", "color": "#7c5cff"},
]


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    mode: str = field(default_factory=lambda: os.environ.get("AIL_MODE", "live"))
    database_url: str = field(default_factory=lambda: os.environ.get("DATABASE_URL", ""))
    experiment_name: str = field(default_factory=lambda: os.environ.get("AIL_EXPERIMENT", "season-1"))
    start_session: str = field(default_factory=lambda: os.environ.get("AIL_START_SESSION", ""))
    initial_cash: str = field(default_factory=lambda: os.environ.get("AIL_INITIAL_CASH", "100000"))
    fee_bps: str = field(default_factory=lambda: os.environ.get("AIL_FEE_BPS", "0"))
    slippage_bps: str = field(default_factory=lambda: os.environ.get("AIL_SLIPPAGE_BPS", "5"))
    monthly_budget_usd: str = field(default_factory=lambda: os.environ.get("AIL_MONTHLY_BUDGET_USD", "10"))
    max_output_tokens: int = field(default_factory=lambda: int(os.environ.get("AIL_MAX_OUTPUT_TOKENS", "4000")))
    llm_timeout_seconds: int = field(default_factory=lambda: int(os.environ.get("AIL_LLM_TIMEOUT", "120")))
    history_bars: int = field(default_factory=lambda: int(os.environ.get("AIL_HISTORY_BARS", "300")))
    # 결정 실행 허용 구간(뉴욕 현지시각). 개장 전에 판단이 끝나야 다음 시가 체결이 공정하다.
    decision_earliest: str = field(default_factory=lambda: os.environ.get("AIL_DECISION_EARLIEST", "08:00"))
    decision_latest: str = field(default_factory=lambda: os.environ.get("AIL_DECISION_LATEST", "09:15"))
    # NH 시세 재배포 권한이 확인되기 전에는 False (웹이 비공개 모드로 동작)
    public_data_confirmed: bool = field(default_factory=lambda: _bool("AIL_PUBLIC_DATA_CONFIRMED"))

    @property
    def is_demo(self) -> bool:
        return self.mode == "demo"

    def participants(self) -> list[dict]:
        out = []
        for p in DEFAULT_PARTICIPANTS:
            out.append({**p, "model": os.environ.get(p["env"], p["model"]).strip()})
        return out

    def validate(self) -> None:
        if self.mode not in ("demo", "live"):
            raise ValueError("AIL_MODE must be 'demo' or 'live'")
        if not self.database_url:
            raise ValueError("DATABASE_URL is required")
        if self.mode == "live":
            missing = [k for k in ("OPENROUTER_API_KEY", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET") if not os.environ.get(k)]
            if missing:
                raise ValueError(f"live mode requires env: {', '.join(missing)}")
        for p in self.participants():
            if p["model"].startswith("~"):
                raise ValueError(f"{p['id']}: auto-updating alias models are not allowed ({p['model']})")
