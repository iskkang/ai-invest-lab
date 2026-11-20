"""기술적 지표 — 저장된 확정 일봉으로 서버에서 직접 계산. 데이터가 부족하면 None."""
from __future__ import annotations

import math
from typing import Sequence


def _r(x, nd=4):
    # +0.0: round(-0.00001) == -0.0 는 jsonb 저장 시 0 이 되어 해시가 달라진다
    return None if x is None or not math.isfinite(x) else round(x, nd) + 0.0


def sma(values: Sequence[float], n: int):
    return sum(values[-n:]) / n if len(values) >= n else None


def ema_series(values: Sequence[float], n: int) -> list[float]:
    if len(values) < n:
        return []
    k = 2 / (n + 1)
    out = [sum(values[:n]) / n]
    for v in values[n:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def ema(values: Sequence[float], n: int):
    s = ema_series(values, n)
    return s[-1] if s else None


def rsi(values: Sequence[float], n: int = 14):
    """Wilder RSI."""
    if len(values) < n + 1:
        return None
    gains, losses = [], []
    for a, b in zip(values[:-1], values[1:]):
        ch = b - a
        gains.append(max(ch, 0.0))
        losses.append(max(-ch, 0.0))
    avg_g = sum(gains[:n]) / n
    avg_l = sum(losses[:n]) / n
    for g, l in zip(gains[n:], losses[n:]):
        avg_g = (avg_g * (n - 1) + g) / n
        avg_l = (avg_l * (n - 1) + l) / n
    if avg_l == 0:
        return 100.0 if avg_g > 0 else 50.0
    return 100 - 100 / (1 + avg_g / avg_l)


def macd(values: Sequence[float], fast=12, slow=26, signal=9):
    if len(values) < slow + signal:
        return None, None, None
    ef = ema_series(values, fast)
    es = ema_series(values, slow)
    ef = ef[len(ef) - len(es):]
    line = [a - b for a, b in zip(ef, es)]
    sig = ema_series(line, signal)
    return line[-1], sig[-1], line[-1] - sig[-1]


def returns(values: Sequence[float]) -> list[float]:
    return [b / a - 1 for a, b in zip(values[:-1], values[1:]) if a]


def volatility(values: Sequence[float], n: int = 20, annualize: bool = True):
    r = returns(values)[-n:]
    if len(r) < n:
        return None
    m = sum(r) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in r) / (n - 1))
    return sd * math.sqrt(252) if annualize else sd


def max_drawdown(values: Sequence[float]):
    if len(values) < 2:
        return None
    peak, mdd = values[0], 0.0
    for v in values:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    return mdd


def momentum(values: Sequence[float], n: int):
    return values[-1] / values[-1 - n] - 1 if len(values) > n else None


def volume_change(volumes: Sequence[float], n: int = 20):
    """마지막 거래량 / 직전 n일 평균 - 1."""
    if len(volumes) < n + 1:
        return None
    base = sum(volumes[-n - 1:-1]) / n
    return volumes[-1] / base - 1 if base else None


def compute(closes: Sequence[float], highs: Sequence[float], lows: Sequence[float], volumes: Sequence[float]) -> dict:
    m_line, m_sig, m_hist = macd(closes)
    window = closes[-252:]
    return {
        "last_close": _r(closes[-1]),
        "prev_close": _r(closes[-2]) if len(closes) > 1 else None,
        "ret_1d": _r(momentum(closes, 1)),
        "ret_5d": _r(momentum(closes, 5)),
        "ret_20d": _r(momentum(closes, 20)),
        "ret_60d": _r(momentum(closes, 60)),
        "sma20": _r(sma(closes, 20)),
        "sma50": _r(sma(closes, 50)),
        "sma200": _r(sma(closes, 200)),
        "ema12": _r(ema(closes, 12)),
        "ema26": _r(ema(closes, 26)),
        "rsi14": _r(rsi(closes, 14), 2),
        "macd": _r(m_line),
        "macd_signal": _r(m_sig),
        "macd_hist": _r(m_hist),
        "volatility_20d_ann": _r(volatility(closes, 20)),
        "max_drawdown_252d": _r(max_drawdown(window)),
        "volume_change_20d": _r(volume_change(volumes, 20)),
        "high_252d": _r(max(highs[-252:])),
        "low_252d": _r(min(lows[-252:])),
        "last_volume": int(volumes[-1]),
        "bars_available": len(closes),
    }
