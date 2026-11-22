-- Scheduled, auditable stock-universe changes. They never mutate live membership when requested.
create table if not exists universe_change_requests (
  id bigserial primary key,
  experiment_id bigint not null references experiments(id),
  action text not null check (action in ('add','remove')),
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,14}$'),
  name text,
  sector text,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  requested_by text not null,
  scheduled_at timestamptz not null default now(),
  effective_session date not null,
  status text not null default 'scheduled' check (status in ('scheduled','applied')),
  applied_at timestamptz,
  applied_round_id bigint references experiment_rounds(id),
  constraint universe_change_add_fields check (
    action='remove' or (name is not null and length(btrim(name))>0)
  ),
  constraint universe_change_apply_consistency check (
    (status='scheduled' and applied_at is null and applied_round_id is null)
    or (status='applied' and applied_at is not null and applied_round_id is not null)
  ),
  unique (experiment_id,effective_session,symbol)
);
create index if not exists universe_change_due_idx
  on universe_change_requests(experiment_id,effective_session,id) where status='scheduled';
create table if not exists universe_rebalance_runs (
  experiment_id bigint not null references experiments(id),
  session_date date not null,
  created_at timestamptz not null default now(),
  primary key(experiment_id, session_date)
);
-- Never expose mutations through the public Data API. Journal uses a restricted server-side projection.
alter table universe_change_requests enable row level security;
alter table universe_change_requests force row level security;
alter table universe_rebalance_runs enable row level security;
alter table universe_rebalance_runs force row level security;
revoke all on universe_change_requests,universe_rebalance_runs from anon,authenticated;
create policy universe_changes_engine_all on universe_change_requests
  for all to current_user using (true) with check (true);
create policy universe_rebalance_engine_all on universe_rebalance_runs
  for all to current_user using (true) with check (true);
