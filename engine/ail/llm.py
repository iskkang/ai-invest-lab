"""OpenRouter 연동 + DEMO 공급자 + 비용 추정.

- 모델 ID 고정: 응답의 model 이 요청 ID 와 다르면(다른 모델로 라우팅) 오류 처리.
- 키는 환경변수에서만 읽고, 오류 메시지·DB 에 HTTP 본문/헤더를 남기지 않는다.
- 응답을 받기 전의 전송 실패(429/5xx/타임아웃)만 1회 재시도. 받은 응답은 재시도하지 않는다
  (특정 모델에게 '다시 뽑기' 기회를 주지 않기 위함).
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from decimal import Decimal

import httpx

from .common import D, canonical
from .decision import DECISION_SCHEMA, SYSTEM_PROMPT

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
CHARS_PER_TOKEN_CONSERVATIVE = 3  # 실제보다 토큰을 많게 잡는 보수적 추정


@dataclass
class LLMResult:
    status: str                      # ok | error
    content: str | None = None
    error: str | None = None
    returned_model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: Decimal | None = None
    latency_ms: int | None = None


@dataclass
class ModelPrice:
    prompt: Decimal       # USD / token
    completion: Decimal
    request: Decimal = Decimal(0)
    context_length: int = 0


def estimate_cost(price: ModelPrice, prompt_chars: int, max_output_tokens: int) -> Decimal:
    tokens_in = prompt_chars // CHARS_PER_TOKEN_CONSERVATIVE + 1
    return tokens_in * price.prompt + max_output_tokens * price.completion + price.request


def user_message(packet: dict) -> str:
    return canonical(packet)


class OpenRouterProvider:
    is_demo = False

    def __init__(self, api_key: str | None = None, client: httpx.Client | None = None, sleep=time.sleep):
        self._key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        if not self._key:
            raise RuntimeError("OPENROUTER_API_KEY is missing")
        self._client = client or httpx.Client(base_url=OPENROUTER_BASE, timeout=30)
        self._sleep = sleep
        self._catalog: dict | None = None

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._key}", "Content-Type": "application/json",
                "X-Title": "AI Invest Lab"}

    def prices(self, model_ids: list[str]) -> dict[str, ModelPrice]:
        if self._catalog is None:
            r = self._client.get("/models", headers=self._headers())
            r.raise_for_status()
            self._catalog = {m["id"]: m for m in r.json()["data"]}
        out = {}
        for mid in model_ids:
            m = self._catalog.get(mid)
            if not m:
                raise RuntimeError(f"model not in OpenRouter catalog: {mid}")
            p = m.get("pricing") or {}
            if "prompt" not in p or "completion" not in p:
                raise RuntimeError(f"no pricing metadata: {mid}")
            out[mid] = ModelPrice(D(p["prompt"]), D(p["completion"]), D(p.get("request", "0") or "0"),
                                  int(m.get("context_length") or 0))
        return out

    def decide(self, model: str, packet: dict, max_output_tokens: int, timeout: int) -> LLMResult:
        body = {
            "model": model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                         {"role": "user", "content": user_message(packet)}],
            "max_tokens": max_output_tokens,
            "temperature": 0,
            "response_format": {"type": "json_schema",
                                "json_schema": {"name": "trading_decision", "strict": True, "schema": DECISION_SCHEMA}},
            "usage": {"include": True},
        }
        started = time.monotonic()
        attempts = 0
        while True:
            attempts += 1
            try:
                r = self._client.post("/chat/completions", headers=self._headers(),
                                      content=json.dumps(body), timeout=timeout)
            except httpx.TransportError:
                if attempts < 2:
                    self._sleep(3)
                    continue
                return LLMResult("error", error="transport failure/timeout",
                                 latency_ms=int((time.monotonic() - started) * 1000))
            if r.status_code in (429, 500, 502, 503, 504) and attempts < 2:
                self._sleep(5)
                continue
            break
        latency = int((time.monotonic() - started) * 1000)
        if r.status_code != 200:
            return LLMResult("error", error=f"HTTP {r.status_code}", latency_ms=latency)
        try:
            data = r.json()
        except ValueError:
            return LLMResult("error", error="non-JSON provider response", latency_ms=latency)
        usage = data.get("usage") or {}
        cost = usage.get("cost")
        res = LLMResult(
            "ok",
            returned_model=data.get("model"),
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            cost_usd=D(cost) if cost is not None else None,
            latency_ms=latency,
        )
        if data.get("error"):
            res.status, res.error = "error", "provider error payload"
            return res
        if not res.returned_model or not str(res.returned_model).startswith(model):
            res.status, res.error = "error", f"model mismatch: requested {model}, got {res.returned_model}"
            return res
        try:
            choice = data["choices"][0]
            content = choice["message"].get("content")
        except (KeyError, IndexError, TypeError):
            res.status, res.error = "error", "missing choices"
            return res
        if choice.get("finish_reason") not in ("stop", None) or not isinstance(content, str):
            res.status, res.error = "error", f"incomplete output (finish_reason={choice.get('finish_reason')})"
            res.content = content if isinstance(content, str) else None
            return res
        res.content = content
        return res


class DemoProvider:
    """키 없이 전체 흐름을 시험하기 위한 결정적 규칙 기반 '가짜 AI'. 실제 AI 추론이 아니다."""
    is_demo = True
    STRATEGY = {"gpt": "momentum", "claude": "trend", "gemini": "mean_reversion", "deepseek": "low_vol"}

    def prices(self, model_ids):
        return {m: ModelPrice(Decimal("0"), Decimal("0")) for m in model_ids}

    def decide(self, model: str, packet: dict, max_output_tokens: int, timeout: int) -> LLMResult:
        pid = packet["participant_id"]
        strategy = self.STRATEGY.get(pid, "momentum")
        rows = packet["market"]["investable"]
        acct = packet["account"]
        holdings = {h["symbol"]: h["quantity"] for h in acct["holdings"]}
        equity = D(acct["equity_at_last_close"])
        cash = D(acct["cash"])

        def score(r):
            if strategy == "momentum":
                return r["ret_20d"] or 0
            if strategy == "trend":
                return (r["last_close"] / r["sma50"] - 1) if r["sma50"] else 0
            if strategy == "mean_reversion":
                return -(r["rsi14"] or 50)
            return -(r["volatility_20d_ann"] or 1)

        ranked = sorted(rows, key=lambda r: (score(r), r["symbol"]), reverse=True)
        target = {r["symbol"] for r in ranked[:5]}
        rank = {r["symbol"]: i for i, r in enumerate(ranked)}
        conf = lambda sym: "high" if rank[sym] < 2 else "medium" if rank[sym] < 5 else "low"
        ind = self.INDICATORS[strategy]
        actions = []
        for sym, qty in sorted(holdings.items()):
            if sym in target and sym in rank:
                actions.append(self._act(sym, "HOLD", 0, f"[DEMO] {strategy} 점수 {rank[sym] + 1}위로 상위권 유지, 보유 지속",
                                         conf(sym), ind))
            elif sym not in target:
                actions.append(self._act(sym, "SELL", qty, f"[DEMO] {strategy} 점수 {rank.get(sym, 99) + 1}위로 상위 5종목에서 밀려 전량 매도",
                                         "medium", ind))
                row = next((r for r in rows if r["symbol"] == sym), None)
                if row:
                    cash += D(row["last_close"]) * qty * Decimal("0.99")
        per = min(equity * Decimal("0.18"), cash / max(1, len(target - set(holdings))))
        for r in ranked[:5]:
            if r["symbol"] in holdings:
                continue
            qty = int(per * Decimal("0.97") / D(r["last_close"]))
            if qty > 0:
                actions.append(self._act(r["symbol"], "BUY", qty, f"[DEMO] {strategy} 점수 {rank[r['symbol']] + 1}위 종목 신규 편입",
                                         conf(r["symbol"]), ind))
        decision = {
            "participant_id": pid,
            "decision_at": packet["decision_at"],
            "data_as_of": packet["data_as_of"],
            "summary": f"[DEMO] 실제 AI 추론이 아닌 '{strategy}' 고정 규칙으로 만든 시연용 판단입니다.",
            "actions": actions,
        }
        text = canonical(decision)
        return LLMResult("ok", content=text, returned_model=model, input_tokens=len(canonical(packet)) // 4,
                         output_tokens=len(text) // 4, cost_usd=Decimal("0"), latency_ms=1)

    INDICATORS = {"momentum": ["ret_20d", "ret_60d"], "trend": ["sma50", "sma200", "macd"],
                  "mean_reversion": ["rsi14", "sma20"], "low_vol": ["volatility_20d_ann", "max_drawdown_252d"]}

    @staticmethod
    def _act(sym, side, qty, reason, confidence, indicators):
        return {"symbol": sym, "action": side, "quantity": int(qty), "reason": reason,
                "risks": ["[DEMO] 합성 데이터 기반 — 실제 위험 분석 아님"], "indicators_used": indicators,
                "expected_return_pct": None, "confidence": confidence}
