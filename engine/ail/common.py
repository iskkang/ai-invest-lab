"""공용 유틸: 금액 계산(Decimal), 정규 JSON, 해시."""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
PRICE_Q = Decimal("0.0001")


class LabError(Exception):
    """실험을 안전하게 중단해야 하는 오류."""


class DataIntegrityError(LabError):
    """시세 누락·충돌·분할 의심 등. 체결·판단을 진행하지 않는다."""


def D(value) -> Decimal:
    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, float):
        result = Decimal(repr(value))
    else:
        result = Decimal(str(value))
    if not result.is_finite():
        raise LabError(f"non-finite number: {value!r}")
    return result


def cents(value) -> Decimal:
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def fee_amount(gross, bps) -> Decimal:
    """수수료는 센트 단위 올림(참가자에게 불리한 쪽)."""
    return (D(gross) * D(bps) / Decimal(10000)).quantize(CENT, rounding=ROUND_CEILING)


def slipped_price(open_price, side: str, bps) -> Decimal:
    """슬리피지: 매수는 비싸게(올림), 매도는 싸게(내림)."""
    sign = 1 if side == "BUY" else -1
    raw = D(open_price) * (Decimal(1) + sign * D(bps) / Decimal(10000))
    return raw.quantize(PRICE_Q, rounding=ROUND_CEILING if side == "BUY" else ROUND_FLOOR)


def _default(o):
    if isinstance(o, Decimal):
        # 정규화: 지수 표기·후행 0 차이로 해시가 달라지지 않게 고정 소수 문자열
        return format(o.normalize(), "f") if o != 0 else "0"
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    raise TypeError(f"not serializable: {type(o)}")


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      allow_nan=False, default=_default)


def sha256(value) -> str:
    text = value if isinstance(value, str) else canonical(value)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def to_jsonable(value):
    return json.loads(canonical(value))
