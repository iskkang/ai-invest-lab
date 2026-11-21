"""DB 없이 검증 가능한 단위 테스트: 캘린더, 지표, NH 어댑터, 응답 검증, 금액 계산."""
from datetime import date
from decimal import Decimal

import pytest

from ail import indicators, market_calendar as mc
from ail.common import DataIntegrityError, fee_amount, sha256, slipped_price
from ail.decision import InvalidDecision, strict_json, validate
from ail.sources import ALLOWED_NH_PATHS, NH_PERIOD_PATH, NHQuoteSource


# ── 캘린더: 휴장·조기폐장·서머타임
def test_holidays_and_early_close():
    assert not mc.is_session(date(2026, 11, 26))          # Thanksgiving
    assert mc.is_session(date(2026, 11, 27))
    _, close, early = mc.session_times(date(2026, 11, 27))
    assert early and close.astimezone(mc.NY).hour == 13    # 13:00 ET 조기폐장
    assert not mc.is_session(date(2026, 12, 25))
    assert mc.previous_session(date(2026, 11, 27)) == date(2026, 11, 25)
    assert mc.next_session(date(2026, 11, 25)) == date(2026, 11, 27)


def test_dst_decision_time_in_utc():
    summer = mc.decision_time(date(2026, 7, 15)).astimezone(mc.UTC)
    winter = mc.decision_time(date(2026, 12, 15)).astimezone(mc.UTC)
    assert (summer.hour, summer.minute) == (12, 30)        # EDT = UTC-4
    assert (winter.hour, winter.minute) == (13, 30)        # EST = UTC-5
    o_s, _, _ = mc.session_times(date(2026, 7, 15))
    o_w, _, _ = mc.session_times(date(2026, 12, 15))
    assert o_s.hour == 13 and o_w.hour == 14                # 09:30 ET


# ── 지표
def test_indicators_known_values():
    closes = [float(x) for x in range(1, 31)]
    assert indicators.sma(closes, 20) == pytest.approx(20.5)
    assert indicators.rsi(closes, 14) == 100.0              # 상승만
    assert indicators.sma(closes, 50) is None               # 표본 부족은 None
    assert indicators.max_drawdown([100, 120, 90, 130]) == pytest.approx(-0.25)
    line, sig, hist = indicators.macd([float(x) for x in range(1, 60)])
    assert line > 0 and hist == pytest.approx(line - sig)
    assert indicators.volume_change([10] * 20 + [20], 20) == pytest.approx(1.0)
    flat = indicators.compute([100.0] * 30, [100.0] * 30, [100.0] * 30, [1.0] * 30)
    assert flat["ret_1d"] == 0.0 and str(flat["ret_1d"]) == "0.0"   # -0.0 금지(해시 안정성)


# ── NH 어댑터: 시세 전용, 해외 일봉 코드
def test_nh_adapter_is_quote_only_and_uses_overseas_day_code():
    calls = []

    def fake_call(path, body):
        calls.append((path, body))
        return {"rsp_cd": "00000", "rsp_msg": "정상", "Output_1": [
            {"trade_date": "20261120", "open_prc": 101.5, "high": 103.0, "low": 100.0, "close_prc": 102.25, "movolume": 12345},
            {"trade_date": "20261119", "open_prc": 100.0, "high": 102.0, "low": 99.0, "close_prc": 101.0, "movolume": 10000},
        ]}

    src = NHQuoteSource(call=fake_call)
    bars = src.daily_bars("AAPL", date(2026, 11, 20), 2)
    assert [b.trade_date for b in bars] == [date(2026, 11, 19), date(2026, 11, 20)]   # 오름차순 정렬
    assert bars[1].close == Decimal("102.2500")
    path, body = calls[0]
    assert path == NH_PERIOD_PATH and body["gubun"] == "3" and body["market_cls"] == "1"
    assert ALLOWED_NH_PATHS == {NH_PERIOD_PATH}
    with pytest.raises(PermissionError):
        src._request("/gbstock/trading/v1/orderBuy", {})


def test_nh_adapter_rejects_bad_rows():
    src = NHQuoteSource(call=lambda p, b: {"rsp_msg": "조회 불가"})
    with pytest.raises(DataIntegrityError):
        src.daily_bars("AAPL", date(2026, 11, 20), 2)
    bad = NHQuoteSource(call=lambda p, b: {"Output_1": [
        {"trade_date": "20261120", "open_prc": 105, "high": 103, "low": 100, "close_prc": 102, "movolume": 1}]})
    with pytest.raises(DataIntegrityError):
        bad.daily_bars("AAPL", date(2026, 11, 20), 1)


def test_nh_retry_only_transient_errors():
    class E(Exception):
        def __init__(self, c): self.category = c
    attempts = []

    def flaky(path, body):
        attempts.append(1)
        if len(attempts) < 3:
            raise E("rate_limit")
        return {"Output_1": []}

    NHQuoteSource(call=flaky, sleep=lambda s: None).daily_bars("AAPL", date(2026, 11, 20), 1)
    assert len(attempts) == 3
    with pytest.raises(DataIntegrityError):
        NHQuoteSource(call=lambda p, b: (_ for _ in ()).throw(E("auth")), sleep=lambda s: None) \
            .daily_bars("AAPL", date(2026, 11, 20), 1)


# ── 금액
def test_costs_round_against_participant():
    assert slipped_price(Decimal("100"), "BUY", 5) == Decimal("100.0500")
    assert slipped_price(Decimal("100"), "SELL", 5) == Decimal("99.9500")
    assert fee_amount(Decimal("1000.01"), 1) == Decimal("0.11")      # 0.100001 → 올림


# ── 응답 검증
CTX = {"participant_id": "gpt", "data_as_of": "2026-11-20",
       "investable": {"AAPL": Decimal("100"), "MSFT": Decimal("200")},
       "cash": Decimal("100000"), "holdings": {"AAPL": 10}, "max_weight": Decimal("0.2"),
       "fee_bps": Decimal("0"), "slippage_bps": Decimal("5")}


def _doc(actions, **over):
    import json
    d = {"participant_id": "gpt", "decision_at": "x", "data_as_of": "2026-11-20", "summary": "s",
         "actions": [{"symbol": s, "action": a, "quantity": q, "reason": "r", "risks": [], "indicators_used": [],
                      "expected_return_pct": None, "confidence": None} for s, a, q in actions]}
    d.update(over)
    return json.dumps(d)


@pytest.mark.parametrize("text,msg", [
    ("not json", "JSON parse"),
    ('{"a":1,"a":2}', "duplicate JSON key"),
    (_doc([("TSLA", "BUY", 1)]), "unknown"),
    (_doc([("AAPL", "BUY", 1), ("AAPL", "SELL", 1)]), "duplicate symbol"),
    (_doc([("AAPL", "BUY", 0)]), "abnormal quantity"),
    (_doc([("AAPL", "BUY", 5_000_000)]), "abnormal quantity"),
    (_doc([("AAPL", "HOLD", 3)]), "HOLD"),
    (_doc([], data_as_of="2026-11-21"), "data_as_of"),
    (_doc([], participant_id="claude"), "participant_id"),
    (_doc([("AAPL", "BUY", 1.5)]), "schema"),
])
def test_invalid_responses_are_rejected(text, msg):
    with pytest.raises(InvalidDecision, match=msg):
        validate(text, CTX)


def test_economic_violations_become_order_rejections():
    v = validate(_doc([("AAPL", "SELL", 11), ("MSFT", "BUY", 102)]), CTX)
    by = {o.symbol: o for o in v.orders}
    assert by["AAPL"].status == "REJECTED" and "SELL_EXCEEDS" in by["AAPL"].reject_reason
    assert by["MSFT"].status == "REJECTED" and "MAX_WEIGHT" in by["MSFT"].reject_reason   # 20,400/101,000 > 20% (정확히 20%는 허용)
    ok = validate(_doc([("MSFT", "BUY", 99)]), CTX)
    assert ok.orders[0].status == "PENDING"
    poor = validate(_doc([("MSFT", "BUY", 99)]), {**CTX, "cash": Decimal("1000")})
    assert poor.orders[0].reject_reason == "INSUFFICIENT_CASH_ESTIMATE"


def test_code_fence_only_normalization():
    assert strict_json('```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(InvalidDecision):
        strict_json('Here you go: {"a": 1}')


def test_hash_is_order_independent():
    assert sha256({"b": 1, "a": [1, 2]}) == sha256({"a": [1, 2], "b": 1})


def test_portable_output_schema_keeps_required_structure_and_strips_provider_incompatible_limits():
    from ail.decision import DECISION_SCHEMA
    from ail.llm import portable_output_schema, PORTABLE_SCHEMA_OMIT
    import json

    wire = portable_output_schema(DECISION_SCHEMA)
    original = json.dumps(DECISION_SCHEMA, sort_keys=True)
    assert "maxItems" in original and "maxLength" in original
    encoded = json.dumps(wire, sort_keys=True)
    for keyword in PORTABLE_SCHEMA_OMIT:
        assert '"' + keyword + '"' not in encoded
    assert wire["additionalProperties"] is False
    assert wire["required"] == DECISION_SCHEMA["required"]
    assert wire["properties"]["actions"]["items"]["required"] == DECISION_SCHEMA["properties"]["actions"]["items"]["required"]
    # Server-side full schema remains unchanged for strict response validation.
    assert DECISION_SCHEMA["properties"]["actions"]["maxItems"] == 31
