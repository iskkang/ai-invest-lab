"""ail — AI Invest Lab 엔진 CLI.

  ail migrate                       로컬/테스트 DB 에 마이그레이션 적용 (운영은 supabase db push)
  ail run-daily                     08:30 ET 판단 작업 (스케줄러용)
  ail run-settle                    폐장 후 체결·평가 작업 (스케줄러용)
  ail verify                        읽기 전용 재검증
  ail costs                         API 비용 요약
  ail set-model gpt openai/gpt-4.1-mini --reason "..."
  ail pause|resume --reason "..."
  ail universe-add SYM "Name" "Sector" --reason "..."   /  ail universe-remove SYM --reason "..."
  # These queue an audited change for the next official round (not immediately).
  ail corporate-action NVDA split 2026-09-14 --ratio 4 --source "IR 공시 URL"
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone

from . import admin, export, market_calendar as mc
from .common import to_jsonable
from .config import Settings
from .db import apply_migrations, connect
from .decision_receipt import decision_receipt
from .pipeline import run_daily, run_settle


def _source_provider(settings: Settings):
    if settings.is_demo:
        from .llm import DemoProvider
        from .sources import DemoSource
        return DemoSource(), DemoProvider()
    from .llm import OpenRouterProvider
    from .sources import NHQuoteSource
    return NHQuoteSource(), OpenRouterProvider()


def _print(obj):
    print(json.dumps(to_jsonable(obj), ensure_ascii=False, indent=2))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ail")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate")
    sub.add_parser("run-daily")
    sub.add_parser("run-settle")
    sub.add_parser("verify")
    sub.add_parser("costs")
    e = sub.add_parser("export")
    e.add_argument("path")
    m = sub.add_parser("set-model")
    m.add_argument("ai_id")
    m.add_argument("model")
    m.add_argument("--reason", required=True)
    for name in ("pause", "resume"):
        sub.add_parser(name).add_argument("--reason", required=True)
    ua = sub.add_parser("universe-add")
    ua.add_argument("symbol"); ua.add_argument("name"); ua.add_argument("sector")
    ua.add_argument("--reason", required=True)
    ur = sub.add_parser("universe-remove")
    ur.add_argument("symbol"); ur.add_argument("--reason", required=True)
    ca = sub.add_parser("corporate-action")
    ca.add_argument("symbol"); ca.add_argument("kind", choices=["split", "cash_dividend", "delisting"])
    ca.add_argument("ex_date"); ca.add_argument("--ratio"); ca.add_argument("--amount")
    ca.add_argument("--source", required=True); ca.add_argument("--note", default="")
    ca.add_argument("--price-source", choices=["nh_plug", "demo"], default="nh_plug")
    args = ap.parse_args(argv)

    settings = Settings()
    actor = os.environ.get("AIL_ACTOR", os.environ.get("GITHUB_ACTOR", "cli"))
    settings.validate()
    conn = connect(settings.database_url)
    now = datetime.now(timezone.utc)
    session = mc.ny_today(now) if args.cmd == "run-daily" else None
    expected = os.environ.get("AIL_EXPECTED_SESSION", "")
    if session is not None and expected and expected != session.isoformat():
        _print({"status": "skipped", "reason": "dispatch session does not match New York date",
                "session": session.isoformat(), "official_round": {"verified": False}})
        return 1
    source_name = "demo" if settings.is_demo else "nh_plug"

    if args.cmd == "migrate":
        _print({"applied": apply_migrations(conn)})
    elif args.cmd == "run-daily":
        src, prov = _source_provider(settings)
        result = run_daily(conn, settings, src, prov, now)
        if not mc.is_session(session):
            _print({**result, "official_round": {"session": session.isoformat(),
                                               "verified": False, "round_status": "market_closed"}})
            return 0
        receipt = decision_receipt(conn, settings, session)
        _print({**result, "official_round": receipt})
        return 0 if receipt["verified"] else 1
    elif args.cmd == "run-settle":
        src, _ = _source_provider(settings)
        _print(run_settle(conn, settings, src, now))
    elif args.cmd == "verify":
        problems = admin.verify(conn, settings.experiment_name, source_name)
        _print({"problems": problems})
        return 1 if problems else 0
    elif args.cmd == "costs":
        _print(admin.cost_report(conn, now))
    elif args.cmd == "export":
        print(export.write(conn, settings.experiment_name, source_name, args.path))
    elif args.cmd == "set-model":
        admin.set_model(conn, args.ai_id, args.model, actor, args.reason)
        print("ok — .env/Secrets 의 AIL_MODEL_* 도 같은 값으로 바꾸세요")
    elif args.cmd in ("pause", "resume"):
        admin.set_status(conn, settings.experiment_name, "paused" if args.cmd == "pause" else "running", actor, args.reason)
    elif args.cmd == "universe-add":
        _print({"scheduled": to_jsonable(admin.universe_add(conn, args.symbol, args.name, args.sector, actor, args.reason, settings.experiment_name, now))})
    elif args.cmd == "universe-remove":
        _print({"scheduled": to_jsonable(admin.universe_remove(conn, args.symbol, actor, args.reason, settings.experiment_name, now))})
    elif args.cmd == "corporate-action":
        admin.add_corporate_action(conn, args.symbol, args.kind, date.fromisoformat(args.ex_date), args.ratio,
                                   args.amount, args.source, args.note, actor, args.price_source)
    return 0


if __name__ == "__main__":
    sys.exit(main())
