from datetime import datetime, timedelta

import pytest

from ail import intraday_preview as x
from ail.common import D, LabError, canonical
from ail.llm import LLMResult, ModelPrice


def z(t):
    return datetime.fromisoformat("2026-11-25T" + t + "+00:00")


class Clock:
    now = z("18:35:20")
    def __call__(self):
        return self.now
    def sleep(self, seconds):
        self.now += timedelta(seconds=seconds)


class Feed:
    def __init__(self, clock, gap=False):
        self.clock, self.gap = clock, gap
    def bars(self, sym, start, close):
        values = (D(100), D(101), D(99), D(100), 100)
        return {t: values for j in range(79) if (t := start + x.STEP * j) < close
                and t <= x.floor_bar(self.clock()) and not (self.gap and j == 7)}


class Models:
    def __init__(self, bad=False, action="BUY"):
        self.bad, self.action, self.packets = bad, action, []
    def prices(self, ids):
        return {m: ModelPrice(D(0), D(0)) for m in ids}
    def decide(self, model, packet, *_args, system_prompt=None):
        self.packets.append(packet)
        assert "first regular-session 15-minute bar" in system_prompt
        bad = self.bad and packet["participant_id"] == "claude"
        return LLMResult("ok", returned_model=model,
                         content=canonical(dict(participant_id=packet["participant_id"],
                                                data_as_of="stale" if bad else packet["data_as_of"],
                                                decision_at=packet["decision_at"], summary="Test",
                                                actions=[dict(symbol="SPY", action=self.action,
                                                              quantity=10 if self.action == "BUY" else 0,
                                                              reason="Synthetic fixture", risks=[],
                                                              indicators_used=[], expected_return_pct=None,
                                                              confidence=None)])))


def test_regular_windows_and_early_close_and_holiday():
    assert x.pick_cutoff(z("14:45:02"), "open")[2] == z("14:45:00")
    assert x.pick_cutoff(z("16:00:32"), "morning")
    assert x.pick_cutoff(z("19:00:32"), "afternoon")
    assert x.pick_cutoff(z("20:30:32"), "preclose")
    assert not x.pick_cutoff(z("19:05:00"), "afternoon")
    assert not x.pick_cutoff(z("19:00:00") + timedelta(days=1), "afternoon")
    assert not x.pick_cutoff(z("19:00:00") + timedelta(days=2), "afternoon")
    assert x.pick_cutoff(z("17:30:00") + timedelta(days=2), "preclose")


def test_no_partial_bars_or_missing_bars():
    c = Clock()
    r = x.run(Feed(c), "now", "probe", clock=c)
    assert r["model_calls"] == 0 and r["bars"] == 16 and r["bar_minutes"] == 15
    with pytest.raises(LabError, match="complete"):
        x.run(Feed(c, gap=True), "now", "probe", clock=c)


def test_same_snapshot_and_lock_before_exact_prospective_fill():
    c, m, journals = Clock(), Models(), []
    r = x.run(Feed(c), "now", "models", lambda: m, c, c.sleep, journals.append)
    assert len(m.packets) == len(r["decisions"]) == 4
    assert len({p["market_sha256"] for p in m.packets}) == 1
    assert r["status"] == "settled_simulation"
    assert r["fill_at"] == z("18:45:00") > r["locked_at"]
    assert c() > z("19:00:00") and journals[0]["status"] == "awaiting_future_fill_bar"
    r0 = r["decisions"][0]["fills"][0]
    assert r0 == dict(symbol="SPY", side="BUY", quantity=10, status="simulated", cost_usd=D("0.61"))


def test_one_invalid_blocks_all_fills_and_hold_is_distinct():
    c, invalid = Clock(), Models(bad=True)
    r = x.run(Feed(c), "now", "models", lambda: invalid, c, c.sleep)
    assert r["status"] == "incomplete_models_no_fills" and "fill_at" not in r
    r = x.run(Feed(c), "now", "models", lambda: Models(action="HOLD"), c, c.sleep)
    assert r["status"] == "all_hold" and "fill_at" not in r


def test_source_quote_only_parameters_and_filtering():
    calls = []
    def call(path, query):
        calls.append((path, query))
        return {"Output_1": [dict(trade_date="20261125", trade_time=t, open_prc=100,
                                   high=101, low=99, close_prc=100, movolume=25)
                              for t in ("093000", "092500", "160000", "243000")]}
    opening, closing, _ = x.mc.session_times(x.mc.ny_today(z("18:00:00")))
    got = x.NHIntradaySource(call=call).bars("SPY", opening, closing)
    assert list(got) == [opening]
    assert calls[0][0] == x.NH_PERIOD_PATH and calls[0][1]["gubun"] == "2"
    assert calls[0][1]["xtick"] == "0015" and calls[0][1]["market_cls"] == "1"


def test_nh_diagnostic_keeps_only_timestamps_and_detects_end_label_pattern():
    calls = []
    def call(path, query):
        calls.append((path, query))
        return {"Output_1": [
            dict(trade_date=query["end_dt"], trade_time=t, open_prc=123.4567,
                 high=124, low=123, close_prc=123.5, movolume=100)
            for t in ("094500", "100000", "101500")
        ]}
    source = x.NHIntradaySource(call=call)
    with pytest.raises(x.FeedGridError) as exc:
        x.run(source, "now", "probe", clock=lambda: z("15:15:20"))
    entry = exc.value.diagnostics[0]
    assert entry["missing_if_start"] == 1 and entry["missing_if_end"] == 0
    assert entry["first_missing_start_et"] == ["093000"]
    assert "123.4567" not in canonical(exc.value.diagnostics)
    assert all(q["today_cls"] == "1" for _, q in calls)

    calls.clear()
    result = x.run(source, "now", "probe", clock=lambda: z("21:15:00"))
    assert result["status"] == "historical_feed_diagnostic" and result["model_calls"] == 0
    assert all(q["today_cls"] == "0" and q["end_dt"] == "20261125" for _, q in calls)
    assert len(result["feed_diagnostics"]) == 4
    calls.clear()
    assert x.run(source, "now", "models", clock=lambda: z("21:15:00"))["status"].startswith("skipped_")
    assert not calls


def test_open_with_one_complete_bar_and_preclose_has_room_to_settle():
    c = Clock()
    c.now = z("14:45:20")
    o, close, cutoff = x.pick_cutoff(c(), "open")
    snap = x.market_snapshot(Feed(c), o, close, cutoff)
    assert snap["bar_count_per_symbol"] == 1
    assert all(row["return_last_30m_pct"] is None for row in snap["investable"])
    c.now = z("20:30:20")
    result = x.run(Feed(c), "preclose", "models", Models, c, c.sleep)
    assert result["status"] == "settled_simulation"
    assert result["fill_at"] == z("20:45:00") and c() > z("21:00:00")
