"""시세 공급원.

- NHQuoteSource: NH투자증권 PLUG 공식 SDK(nhplug)로 **해외주식 기간별 시세만** 조회한다.
  주문·계좌 API 는 호출할 수 없도록 경로 허용목록으로 막는다.
- DemoSource: 키 없이 테스트하기 위한 합성 시세. 실제 가격이 아니며 source='demo' 로 저장된다.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

import numpy as np

from . import market_calendar as mc
from .common import PRICE_Q, D, DataIntegrityError


@dataclass(frozen=True)
class Bar:
    symbol: str
    trade_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    source: str
    raw: dict = field(default_factory=dict, compare=False, hash=False)

    def check(self) -> None:
        if min(self.open, self.high, self.low, self.close) <= 0:
            raise DataIntegrityError(f"{self.symbol} {self.trade_date}: non-positive price")
        if not (self.low <= min(self.open, self.close) and self.high >= max(self.open, self.close)):
            raise DataIntegrityError(f"{self.symbol} {self.trade_date}: inconsistent OHLC")
        if self.volume < 0:
            raise DataIntegrityError(f"{self.symbol} {self.trade_date}: negative volume")


# ─────────────────────────────────────────── NH PLUG
# 명세(gbstock openapi.json, 2026-11 확인): POST /gbstock/quote/v1/period
#   입력: iem_cd, end_dt(YYYYMMDD), count, maxavg, gubun(해외 3=일 — 국내 1=일과 다름!),
#         xtick("0001"), today_cls(0=종료일조회), market_cls(1=정규장)
#   출력 Output_1[]: trade_date, trade_time, open_prc, high, low, close_prc, movolume, movalue, bsop_date (최신이 앞)
#   ⚠️ 명세에 수정주가 여부 표시가 없다 → 분할은 ingest 단계에서 감지·중단하고 corporate_actions 로 처리.
NH_PERIOD_PATH = "/gbstock/quote/v1/period"
NH_GUBUN_DAY = "3"
ALLOWED_NH_PATHS = frozenset({NH_PERIOD_PATH})


class NHQuoteSource:
    name = "nh_plug"

    def __init__(self, call=None, sleep=time.sleep, max_retries: int = 3):
        if call is None:
            from nhplug import call as sdk_call  # 공식 SDK (토큰·스로틀·cts 처리)
            call = sdk_call
        self._call = call
        self._sleep = sleep
        self._max_retries = max_retries

    def _request(self, path: str, body: dict) -> dict:
        if path not in ALLOWED_NH_PATHS:
            raise PermissionError(f"NH path not allowed (quote-only engine): {path}")
        delay = 1.0
        for attempt in range(self._max_retries + 1):
            try:
                return self._call(path, body)
            except Exception as exc:  # NhplugError(category=rate_limit|network|http|auth|config)
                category = getattr(exc, "category", "")
                if category not in ("rate_limit", "network") or attempt == self._max_retries:
                    raise DataIntegrityError(f"NH request failed [{category or type(exc).__name__}]") from None
                self._sleep(delay)
                delay *= 2
        raise AssertionError("unreachable")

    def daily_bars(self, symbol: str, end: date, count: int) -> list[Bar]:
        data = self._request(NH_PERIOD_PATH, {
            "iem_cd": symbol,
            "end_dt": end.strftime("%Y%m%d"),
            "count": str(int(count)),
            "maxavg": "0",
            "gubun": NH_GUBUN_DAY,
            "xtick": "0001",
            "today_cls": "0",
            "market_cls": "1",
        })
        rows = data.get("Output_1") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            msg = data.get("rsp_msg") if isinstance(data, dict) else None
            raise DataIntegrityError(f"NH period: no Output_1 for {symbol} ({msg!r})")
        bars = [self.parse_row(symbol, r) for r in rows]
        bars.sort(key=lambda b: b.trade_date)
        return bars

    @staticmethod
    def parse_row(symbol: str, r: dict) -> Bar:
        try:
            td = datetime.strptime(str(r["trade_date"]), "%Y%m%d").date()
            q = lambda k: D(r[k]).quantize(PRICE_Q)
            bar = Bar(symbol, td, q("open_prc"), q("high"), q("low"), q("close_prc"),
                      int(D(r["movolume"])), "nh_plug", raw=dict(r))
        except (KeyError, ValueError, TypeError, ArithmeticError) as exc:
            raise DataIntegrityError(f"NH period: malformed row for {symbol}: {exc}") from None
        bar.check()
        return bar


# ─────────────────────────────────────────── DEMO (합성 데이터)
DEMO_EPOCH = date(2024, 1, 2)
# 데모용 기업행동: 실제 일정 아님. 엔진의 분할·배당 처리 경로를 시험하기 위한 가상 이벤트.
DEMO_CORPORATE_ACTIONS = [
    {"symbol": "NVDA", "kind": "split", "ex_date": date(2026, 9, 14), "ratio": Decimal(4), "amount": None},
    {"symbol": "KO", "kind": "cash_dividend", "ex_date": date(2026, 9, 15), "ratio": None, "amount": Decimal("0.51")},
]


class DemoSource:
    name = "demo"

    def __init__(self):
        self._cache: dict[str, dict[date, Bar]] = {}

    def _series(self, symbol: str, until: date) -> dict[date, Bar]:
        cached = self._cache.get(symbol)
        if cached and max(cached) >= until:
            return cached
        sessions = mc.sessions_between(DEMO_EPOCH, max(until, date.today()))
        seed = int.from_bytes(hashlib.sha256(symbol.encode()).digest()[:4], "big")
        rng = np.random.default_rng(seed)
        drift = 0.0003 + (seed % 7) * 0.00005
        vol = 0.012 + (seed % 5) * 0.003
        price = 50 + seed % 400
        split = {a["ex_date"]: a["ratio"] for a in DEMO_CORPORATE_ACTIONS
                 if a["symbol"] == symbol and a["kind"] == "split"}
        out: dict[date, Bar] = {}
        for s in sessions:
            if s in split:
                price = price / float(split[s])
            gap = rng.normal(0, vol * 0.3)
            o = price * (1 + gap)
            c = o * (1 + rng.normal(drift, vol))
            hi = max(o, c) * (1 + abs(rng.normal(0, vol * 0.4)))
            lo = min(o, c) * (1 - abs(rng.normal(0, vol * 0.4)))
            v = int(abs(rng.normal(2e7, 6e6))) + 100000
            q = lambda x: Decimal(str(round(x, 4))).quantize(PRICE_Q)
            out[s] = Bar(symbol, s, q(o), q(hi), q(lo), q(c), v, "demo")
            price = c
        self._cache[symbol] = out
        return out

    def daily_bars(self, symbol: str, end: date, count: int) -> list[Bar]:
        series = self._series(symbol, end)
        dates = [d for d in sorted(series) if d <= end][-count:]
        return [series[d] for d in dates]
