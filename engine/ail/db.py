"""PostgreSQL(Supabase) 접근. 엔진은 서버 측 연결로만 쓴다."""
from __future__ import annotations

import contextlib
import hashlib
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .common import canonical, to_jsonable

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"


def connect(url: str) -> psycopg.Connection:
    return psycopg.connect(url, row_factory=dict_row, autocommit=True)


def jsonb(value) -> Jsonb:
    return Jsonb(to_jsonable(value), dumps=canonical)


def apply_migrations(conn: psycopg.Connection) -> list[str]:
    """로컬·테스트용 마이그레이션 적용기. 운영 Supabase 는 `supabase db push` 사용."""
    conn.execute("create table if not exists _ail_migrations(name text primary key, applied_at timestamptz default now())")
    done = {r["name"] for r in conn.execute("select name from _ail_migrations").fetchall()}
    applied = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.name in done:
            continue
        with conn.transaction():
            conn.execute(path.read_text(encoding="utf-8"))
            conn.execute("insert into _ail_migrations(name) values (%s)", (path.name,))
        applied.append(path.name)
    return applied


def _lock_key(name: str) -> int:
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big", signed=True)


@contextlib.contextmanager
def advisory_lock(conn: psycopg.Connection, name: str):
    """동일 작업 동시 실행 차단(세션 단위 advisory lock)."""
    key = _lock_key(name)
    got = conn.execute("select pg_try_advisory_lock(%s) as ok", (key,)).fetchone()["ok"]
    if not got:
        raise RuntimeError(f"another process holds lock '{name}'")
    try:
        yield
    finally:
        conn.execute("select pg_advisory_unlock(%s)", (key,))


def audit(conn: psycopg.Connection, actor: str, action: str, entity: str, entity_id=None, detail=None) -> None:
    conn.execute(
        "insert into audit_logs(actor, action, entity, entity_id, detail) values (%s,%s,%s,%s,%s)",
        (actor, action, entity, None if entity_id is None else str(entity_id), jsonb(detail or {})),
    )
