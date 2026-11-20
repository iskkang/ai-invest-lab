-- 무결성(사후 수정 차단) + RLS(공개 조회 / 관리자 전용 분리)

-- ───────────────────────── 불변 테이블: UPDATE/DELETE 금지
create or replace function ail_forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'immutable record: % on % is not allowed', tg_op, tg_table_name
    using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array['trades','ledger_entries','market_snapshots','audit_logs','stock_prices','corporate_actions']
  loop
    execute format('create trigger %I_immutable before update or delete on %I
                    for each row execute function ail_forbid_change()', t, t);
  end loop;
end $$;

-- ai_decisions: pending → (valid|invalid|error) 한 번만. 요청 원본·해시는 절대 불변. 삭제 금지.
create or replace function ail_guard_decision() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable record: decisions cannot be deleted' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' then
    raise exception 'immutable record: decision % already finalized', old.id using errcode = 'P0001';
  end if;
  if new.request_payload is distinct from old.request_payload
     or new.prompt_hash is distinct from old.prompt_hash
     or new.market_hash is distinct from old.market_hash
     or new.round_id <> old.round_id or new.ai_model_id <> old.ai_model_id
     or new.model_version_id <> old.model_version_id
     or new.requested_model <> old.requested_model then
    raise exception 'immutable record: decision request fields' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger ai_decisions_guard before update or delete on ai_decisions
  for each row execute function ail_guard_decision();

-- orders: PENDING 에서 한 번만 종결. 주문 내용 불변. 삭제 금지.
create or replace function ail_guard_order() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable record: orders cannot be deleted' using errcode = 'P0001';
  end if;
  if old.status <> 'PENDING' then
    raise exception 'immutable record: order % already %', old.id, old.status using errcode = 'P0001';
  end if;
  if (new.round_id, new.account_id, new.session_date, new.symbol, new.side, new.quantity, new.decision_id)
     is distinct from (old.round_id, old.account_id, old.session_date, old.symbol, old.side, old.quantity, old.decision_id) then
    raise exception 'immutable record: order content' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger orders_guard before update or delete on orders
  for each row execute function ail_guard_order();

-- experiment_rounds: 스냅샷은 한 번 지정되면 불변, 종결 상태는 되돌릴 수 없음, 삭제 금지
create or replace function ail_guard_round() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable record: rounds cannot be deleted' using errcode = 'P0001';
  end if;
  if old.snapshot_id is not null and new.snapshot_id is distinct from old.snapshot_id then
    raise exception 'immutable record: round snapshot' using errcode = 'P0001';
  end if;
  if old.status in ('settled','aborted','skipped') and new.status <> old.status then
    raise exception 'immutable record: round % is final', old.id using errcode = 'P0001';
  end if;
  if (new.session_date, new.data_as_of, new.experiment_id, new.decision_at)
     is distinct from (old.session_date, old.data_as_of, old.experiment_id, old.decision_at) then
    raise exception 'immutable record: round identity' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger experiment_rounds_guard before update or delete on experiment_rounds
  for each row execute function ail_guard_round();

-- ───────────────────────── RLS
-- 엔진은 서버 측 DB 연결(소유자 권한)로만 쓴다. anon/authenticated 에는 쓰기 정책을 만들지 않는다.
do $$
declare t text;
begin
  foreach t in array array[
    'ai_models','model_versions','experiments','stock_universe','market_sessions','stock_prices',
    'corporate_actions','market_snapshots','experiment_rounds','ai_decisions','portfolio_accounts',
    'holdings','orders','trades','ledger_entries','portfolio_snapshots','benchmark_snapshots',
    'performance_stats','api_usage','job_runs','audit_logs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- Security hardening for private AI Invest Lab experiments.
-- An HTTP Basic gate on Vercel is NOT an authorization boundary for Supabase Data API.
-- Until a server-only, scoped read layer is implemented, no anon/authenticated
-- role may SELECT ledger, decisions, holdings, prices, or other experiment data.
-- RLS and revoked grants are intentionally enforced on all experiment tables.
-- Public read policies are deliberately NOT created here.

-- 서버 엔진 역할(Supabase 의 service_role)은 RLS 우회. 소유자 연결도 FORCE RLS 대상이므로 엔진 전용 정책 부여.
do $$
declare t text;
begin
  foreach t in array array[
    'ai_models','model_versions','experiments','stock_universe','market_sessions','stock_prices',
    'corporate_actions','market_snapshots','experiment_rounds','ai_decisions','portfolio_accounts',
    'holdings','orders','trades','ledger_entries','portfolio_snapshots','benchmark_snapshots',
    'performance_stats','api_usage','job_runs','audit_logs']
  loop
    execute format('create policy %I on %I for all to current_user using (true) with check (true)',
                   t || '_engine_all', t);
  end loop;
end $$;
