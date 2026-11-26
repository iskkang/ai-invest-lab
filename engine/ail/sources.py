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
from .common import PRICE_Q, D, DataIntegrityError, LabError


def _coherent_ohlc(open_: Decimal, high: Decimal, low: Decimal, close: Decimal) -> bool:
    return low <= min(open_, close) and high >= max(open_, close)


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
        if not _coherent_ohlc(self.open, self.high, self.low, self.close):
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
_NH_OHLC_FIELDS = ("open_prc", "high", "low", "close_prc")


class _NHInconsistentOHLC(DataIntegrityError):
    def __init__(self, symbol: str, trade_date: date, raw_prices: tuple[Decimal, ...],
                 parsed_prices: tuple[Decimal, ...]):
        self.trade_date = trade_date
        self.ohlc = {"raw": dict(zip(_NH_OHLC_FIELDS, raw_prices)),
                     "normalized": dict(zip(_NH_OHLC_FIELDS, parsed_prices))}
        # Public market prices only, not the response, request, headers, or tokens.
        def values(prices):
            return ",".join(f"{key}={str(value)[:48]}" for key, value in zip(_NH_OHLC_FIELDS, prices))
        super().__init__(f"{symbol} {trade_date}: inconsistent OHLC "
                         f"(NH values: {values(raw_prices)}; quantized: {values(parsed_prices)})")


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
        query = {
            "iem_cd": symbol,
            "end_dt": end.strftime("%Y%m%d"),
            "count": str(int(count)),
            "maxavg": "0",
            "gubun": NH_GUBUN_DAY,
            "xtick": "0001",
            "today_cls": "0",
            "market_cls": "1",
        }
        initial, invalid = self._read_bars(symbol, query)
        if not invalid:
            return sorted(initial.values(), key=lambda bar: bar.trade_date)

        # Re-read the SAME regular-session request once. Never synthesize a candle,
        # change sessions/adjustments, or use another date or provider as a substitute.
        first_error = min(invalid.values(), key=lambda exc: exc.trade_date)
        self._sleep(1.0)
        try:
            refreshed, still_invalid = self._read_bars(symbol, query)
        except DataIntegrityError as exc:
            raise DataIntegrityError(f"{first_error}; regular-session refetch failed: {exc}") from None
        if still_invalid:
            second_error = min(still_invalid.values(), key=lambda exc: exc.trade_date)
            raise DataIntegrityError(f"{first_error}; still invalid after refetch: {second_error}")
        if refreshed.keys() != (initial.keys() | invalid.keys()):
            raise DataIntegrityError(f"{first_error}; refetch changed date coverage")
        if any(refreshed[td] != bar for td, bar in initial.items()):
            raise DataIntegrityError(f"{first_error}; refetch revised an originally valid bar")
        return sorted(refreshed.values(), key=lambda bar: bar.trade_date)

    def _read_bars(self, symbol: str, query: dict) -> tuple[dict[date, Bar], dict[date, _NHInconsistentOHLC]]:
        data = self._request(NH_PERIOD_PATH, query.copy())
        rows = data.get("Output_1") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            raise DataIntegrityError(f"NH period: no Output_1 for {symbol}")
        bars: dict[date, Bar] = {}
        invalid: dict[date, _NHInconsistentOHLC] = {}
        for row in rows:
            try:
                bar = self.parse_row(symbol, row)
            except _NHInconsistentOHLC as exc:
                if exc.trade_date in bars or exc.trade_date in invalid:
                    raise DataIntegrityError(f"{symbol}: duplicate NH bar for {exc.trade_date}") from None
                invalid[exc.trade_date] = exc
            else:
                if bar.trade_date in bars or bar.trade_date in invalid:
                    raise DataIntegrityError(f"{symbol}: duplicate NH bar for {bar.trade_date}")
                bars[bar.trade_date] = bar
        return bars, invalid

    @staticmethod
    def parse_row(symbol: str, r: dict) -> Bar:
        try:
            td = datetime.strptime(str(r["trade_date"]), "%Y%m%d").date()
            raw_prices = tuple(D(r[k]) for k in _NH_OHLC_FIELDS)
            parsed_prices = tuple(price.quantize(PRICE_Q) for price in raw_prices)
            bar = Bar(symbol, td, *parsed_prices,
                      int(D(r["movolume"])), "nh_plug", raw=dict(r))
        except (KeyError, ValueError, TypeError, ArithmeticError, LabError) as exc:
            raise DataIntegrityError(f"NH period: malformed row for {symbol} ({type(exc).__name__})") from None
        # Compare before rounding as well, so precision cannot hide an invalid range.
        if not _coherent_ohlc(*raw_prices) or not _coherent_ohlc(*parsed_prices):
            raise _NHInconsistentOHLC(symbol, td, raw_prices, parsed_prices)
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
