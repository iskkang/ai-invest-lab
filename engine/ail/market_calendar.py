"""미국 거래소(NYSE) 거래일·시간. 휴장일·조기폐장·서머타임은 exchange_calendars(XNYS)로 처리."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

import exchange_calendars as xc
import pandas as pd

NY = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")


@lru_cache(maxsize=1)
def _cal():
    return xc.get_calendar("XNYS")


def is_session(d: date) -> bool:
    return bool(_cal().is_session(pd.Timestamp(d)))


def previous_session(d: date) -> date:
    """d 이전(엄격)의 마지막 거래일."""
    ts = _cal().date_to_session(pd.Timestamp(d), direction="previous")
    if ts.date() >= d:
        ts = _cal().previous_session(ts)
    return ts.date()


def next_session(d: date) -> date:
    """d 이후(엄격)의 첫 거래일."""
    ts = _cal().date_to_session(pd.Timestamp(d), direction="next")
    if ts.date() <= d:
        ts = _cal().next_session(ts)
    return ts.date()


def sessions_between(start: date, end: date) -> list[date]:
    """start..end (양끝 포함) 거래일."""
    if end < start:
        return []
    return [s.date() for s in _cal().sessions_in_range(pd.Timestamp(start), pd.Timestamp(end))]


def session_times(d: date) -> tuple[datetime, datetime, bool]:
    """(개장 UTC, 폐장 UTC, 조기폐장 여부)."""
    cal = _cal()
    ts = pd.Timestamp(d)
    if not cal.is_session(ts):
        raise ValueError(f"{d} is not an NYSE session")
    open_ = cal.session_open(ts).to_pydatetime().astimezone(UTC)
    close = cal.session_close(ts).to_pydatetime().astimezone(UTC)
    early = close.astimezone(NY).time() < time(16, 0)
    return open_, close, early


def ny_time(d: date, hhmm: str) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime(d.year, d.month, d.day, h, m, tzinfo=NY)


def decision_time(d: date) -> datetime:
    """권장 판단 시각: 미국 동부 08:30."""
    return ny_time(d, "08:30")


def ny_today(now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(NY).date()


def after_close(d: date, now: datetime, buffer_minutes: int = 60) -> bool:
    """폐장 후 데이터가 확정되었다고 보는 시각(폐장+버퍼)이 지났는지."""
    _, close, _ = session_times(d)
    return now >= close + timedelta(minutes=buffer_minutes)


def latest_settleable_session(now: datetime) -> date:
    """Latest actual NYSE session past the engine's closing-data buffer."""
    today = ny_today(now)
    if is_session(today) and after_close(today, now):
        return today
    return previous_session(today)
