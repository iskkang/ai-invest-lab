"""테스트는 실제 PostgreSQL 에서 실행한다(트리거·RLS·UNIQUE 를 그대로 검증하기 위함).

환경변수
  TEST_PG_ADMIN_URL  : DB 생성 권한이 있는 연결 (기본: postgresql://postgres@/postgres?host=/tmp/pg&port=54329)
  TEST_PG_ENGINE_URL : 엔진 역할 연결 템플릿, {db} 자리에 DB 이름 (기본: postgresql://engine@/{db}?host=/tmp/pg&port=54329)
  TEST_PG_ENGINE_ROLE: 테이블 소유자(엔진) 역할 이름 (기본 engine)
anon / authenticated 역할이 있어야 한다(Supabase 와 동일). 없으면 생성한다.
"""
from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import psycopg
import pytest

from ail import market_calendar as mc
from ail.config import Settings
from ail.db import apply_migrations, connect
from ail.llm import DemoProvider, LLMResult, ModelPrice
from ail.sources import DemoSource

ADMIN = os.environ.get("TEST_PG_ADMIN_URL", "postgresql://postgres@/postgres?host=/tmp/pg&port=54329")
ENGINE_ROLE = os.environ.get("TEST_PG_ENGINE_ROLE", "engine")
TEMPLATE = "ail_test_template"


def _admin():
    return psycopg.connect(ADMIN, autocommit=True)


ENGINE_URL = os.environ.get("TEST_PG_ENGINE_URL", "postgresql://engine@/{db}?host=/tmp/pg&port=54329")


def _db_url(name: str) -> str:
    return ENGINE_URL.replace("{db}", name)


@pytest.fixture(scope="session")
def template_db():
    with _admin() as a:
        for role in ("anon", "authenticated"):
            if not a.execute("select 1 from pg_roles where rolname=%s", (role,)).fetchone():
                a.execute(f"create role {role} nologin")
        if not a.execute("select 1 from pg_roles where rolname=%s", (ENGINE_ROLE,)).fetchone():
            a.execute(f"create role {ENGINE_ROLE} login")
        # Supabase 에서 postgres 역할은 anon/authenticated 의 멤버다 — RLS 테스트에서 set role 하기 위함
        a.execute(f"grant anon, authenticated to {ENGINE_ROLE}")
        a.execute(f"drop database if exists {TEMPLATE}")
        a.execute(f"create database {TEMPLATE} owner {ENGINE_ROLE}")
    with connect(_db_url(TEMPLATE)) as c:
        apply_migrations(c)
    yield TEMPLATE
    with _admin() as a:
        a.execute(f"drop database if exists {TEMPLATE}")


@pytest.fixture
def db(template_db):
    name = "ail_t_" + uuid.uuid4().hex[:10]
    with _admin() as a:
        a.execute(f"create database {name} template {template_db} owner {ENGINE_ROLE}")
    conn = connect(_db_url(name))
    yield conn
    conn.close()
    with _admin() as a:
        a.execute(f"drop database if exists {name} with (force)")


# 기준 날짜: 2026-11-16(월)~ — 11-26(목) 추수감사절 휴장, 11-27(금) 조기폐장
START = date(2026, 11, 16)


@pytest.fixture
def settings():
    s = Settings()
    s.mode = "demo"
    s.database_url = "unused"
    s.experiment_name = "test-" + uuid.uuid4().hex[:6]
    s.start_session = START.isoformat()
    s.history_bars = 260
    return s


def at(d: date, hhmm: str) -> datetime:
    return mc.ny_time(d, hhmm).astimezone(timezone.utc)


class ScriptedProvider(DemoProvider):
    """참가자별 응답을 지정할 수 있는 가짜 공급자. 지정 안 한 참가자는 DEMO 규칙."""

    def __init__(self, scripts=None):
        self.scripts = scripts or {}
        self.calls = []

    def decide(self, model, packet, max_output_tokens, timeout):
        self.calls.append((model, packet))
        fn = self.scripts.get(packet["participant_id"])
        if fn is None:
            return super().decide(model, packet, max_output_tokens, timeout)
        out = fn(packet)
        if isinstance(out, LLMResult):
            return out
        return LLMResult("ok", content=out, returned_model=model, input_tokens=100, output_tokens=50,
                         cost_usd=Decimal("0"), latency_ms=1)


def hold_all(packet):
    import json
    return json.dumps({"participant_id": packet["participant_id"], "decision_at": packet["decision_at"],
                       "data_as_of": packet["data_as_of"], "summary": "관망", "actions": []}, ensure_ascii=False)


def orders_json(packet, actions):
    import json
    return json.dumps({
        "participant_id": packet["participant_id"], "decision_at": packet["decision_at"],
        "data_as_of": packet["data_as_of"], "summary": "테스트",
        "actions": [{"symbol": s, "action": a, "quantity": q, "reason": "테스트", "risks": [],
                     "indicators_used": [], "expected_return_pct": None, "confidence": None} for s, a, q in actions],
    }, ensure_ascii=False)


@pytest.fixture
def source():
    return DemoSource()
