-- AI Invest Lab — core schema
-- 원칙: 판단(ai_decisions)과 체결(trades)을 분리, 원장(ledger_entries)으로 현금·수량을 재구성 가능,
--       확정 기록은 트리거로 수정·삭제 차단, 중복 실행은 UNIQUE 제약으로 차단.
-- 금액: 현금 numeric(20,2) (센트), 가격 numeric(18,4).

create extension if not exists pgcrypto;

-- ───────────────────────── 참가자·모델
create table ai_models (
  id            text primary key check (id ~ '^[a-z0-9_]+$'),
  display_name  text not null,
  color         text not null default '#888888',
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

create table model_versions (
  id                  bigserial primary key,
  ai_model_id         text not null references ai_models(id),
  openrouter_model_id text not null check (openrouter_model_id !~ '^~'), -- 자동교체 별칭 금지
  effective_from      timestamptz not null default now(),
  effective_to        timestamptz,
  changed_by          text not null,
  reason              text not null,
  check (effective_to is null or effective_to > effective_from)
);
create unique index model_versions_one_active on model_versions(ai_model_id) where effective_to is null;

-- ───────────────────────── 실험
create table experiments (
  id                 bigserial primary key,
  name               text not null unique,
  mode               text not null check (mode in ('live','demo')),
  start_session      date not null,
  initial_cash       numeric(20,2) not null default 100000 check (initial_cash > 0),
  max_position_weight numeric(6,4) not null default 0.20 check (max_position_weight > 0 and max_position_weight <= 1),
  fee_bps            numeric(8,3) not null default 0 check (fee_bps >= 0),
  slippage_bps       numeric(8,3) not null default 5 check (slippage_bps >= 0),
  monthly_budget_usd numeric(10,2) not null default 10 check (monthly_budget_usd >= 0),
  status             text not null default 'running' check (status in ('running','paused','stopped')),
  created_at         timestamptz not null default now()
);

-- ───────────────────────── 종목·시세
create table stock_universe (
  id            bigserial primary key,
  symbol        text not null check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,14}$'),
  name          text not null,
  sector        text,
  role          text not null default 'investable' check (role in ('investable','benchmark')),
  added_at      timestamptz not null default now(),
  removed_at    timestamptz,
  changed_by    text not null default 'system',
  change_reason text not null default 'initial universe'
);
-- 종목 변경은 행을 닫고(removed_at) 새 행을 추가 → 변경 이력 보존
create unique index stock_universe_active on stock_universe(symbol) where removed_at is null;

create table market_sessions (
  session_date   date primary key,
  open_at        timestamptz not null,
  close_at       timestamptz not null,
  is_early_close boolean not null default false,
  check (close_at > open_at)
);

create table stock_prices (
  symbol      text not null,
  trade_date  date not null,
  open        numeric(18,4) not null check (open  > 0),
  high        numeric(18,4) not null check (high  > 0),
  low         numeric(18,4) not null check (low   > 0),
  close       numeric(18,4) not null check (close > 0),
  volume      bigint not null check (volume >= 0),
  source      text not null check (source in ('nh_plug','demo')),
  fetched_at  timestamptz not null,
  raw         jsonb,
  primary key (symbol, trade_date, source),
  check (low <= least(open, close) and high >= greatest(open, close))
);

create table corporate_actions (
  id          bigserial primary key,
  symbol      text not null,
  kind        text not null check (kind in ('split','cash_dividend','delisting')),
  ex_date     date not null,
  ratio       numeric(18,8),   -- split: 신주/구주 (4:1 분할 = 4)
  amount      numeric(18,4),   -- dividend: 주당 현금, delisting: 청산가
  source      text not null,
  note        text,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  unique (symbol, kind, ex_date),
  check (kind <> 'split' or (ratio is not null and ratio > 0)),
  check (kind = 'split' or (amount is not null and amount >= 0))
);

-- ───────────────────────── 스냅샷·회차·판단
create table market_snapshots (
  id            bigserial primary key,
  snapshot_hash text not null unique check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  data_as_of    date not null,           -- 포함된 마지막 확정 거래일
  cutoff_at     timestamptz not null,    -- 이 시각 이전에 수집된 데이터만 포함
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);

create table experiment_rounds (
  id             bigserial primary key,
  experiment_id  bigint not null references experiments(id),
  session_date   date not null,           -- 모의 체결 세션(이 날 시가)
  decision_at    timestamptz not null,
  data_as_of     date not null,
  snapshot_id    bigint references market_snapshots(id),
  status         text not null default 'created'
                 check (status in ('created','deciding','decided','settled','aborted','skipped')),
  abort_reason   text,
  created_at     timestamptz not null default now(),
  settled_at     timestamptz,
  unique (experiment_id, session_date),
  check (data_as_of < session_date)
);

create table ai_decisions (
  id                 bigserial primary key,
  round_id           bigint not null references experiment_rounds(id),
  ai_model_id        text not null references ai_models(id),
  model_version_id   bigint not null references model_versions(id),
  requested_model    text not null,
  returned_model     text,
  prompt_hash        text not null,
  market_hash        text not null,
  request_payload    jsonb not null,
  raw_response       text,
  parsed             jsonb,
  status             text not null default 'pending' check (status in ('pending','valid','invalid','error')),
  error              text,
  input_tokens       int,
  output_tokens      int,
  cost_usd           numeric(12,6),
  latency_ms         int,
  created_at         timestamptz not null default now(),
  completed_at       timestamptz,
  unique (round_id, ai_model_id)
);

-- ───────────────────────── 계좌·주문·체결·원장
create table portfolio_accounts (
  id              bigserial primary key,
  experiment_id   bigint not null references experiments(id),
  kind            text not null check (kind in ('ai','benchmark')),
  ai_model_id     text references ai_models(id),
  benchmark_code  text check (benchmark_code in ('SPY_BUY_HOLD','EQUAL_WEIGHT','CASH')),
  name            text not null,
  initial_cash    numeric(20,2) not null,
  created_at      timestamptz not null default now(),
  check ((kind = 'ai' and ai_model_id is not null and benchmark_code is null)
      or (kind = 'benchmark' and benchmark_code is not null and ai_model_id is null)),
  unique (experiment_id, ai_model_id),
  unique (experiment_id, benchmark_code)
);

-- 원장에서 파생되는 현재 상태(재계산 가능). 정본은 ledger_entries.
create table holdings (
  account_id  bigint not null references portfolio_accounts(id),
  symbol      text not null,
  quantity    bigint not null check (quantity > 0),
  avg_cost    numeric(18,6) not null check (avg_cost >= 0),
  updated_at  timestamptz not null default now(),
  primary key (account_id, symbol)
);

create table orders (
  id            bigserial primary key,
  round_id      bigint references experiment_rounds(id),   -- 벤치마크 주문은 null
  account_id    bigint not null references portfolio_accounts(id),
  decision_id   bigint references ai_decisions(id),
  session_date  date not null,                             -- 이 세션 시가로 체결
  symbol        text not null,
  side          text not null check (side in ('BUY','SELL')),
  quantity      bigint not null check (quantity > 0 and quantity <= 10000000),
  status        text not null default 'PENDING' check (status in ('PENDING','FILLED','REJECTED','EXPIRED')),
  reject_reason text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (account_id, session_date, symbol),
  check (status = 'PENDING' or resolved_at is not null),
  check (status not in ('REJECTED','EXPIRED') or reject_reason is not null)
);

create table trades (
  id              bigserial primary key,
  order_id        bigint not null unique references orders(id),
  account_id      bigint not null references portfolio_accounts(id),
  symbol          text not null,
  side            text not null check (side in ('BUY','SELL')),
  quantity        bigint not null check (quantity > 0),
  ref_open_price  numeric(18,4) not null,   -- 세션 시가(원자료)
  price           numeric(18,4) not null,   -- 슬리피지 반영 체결가
  gross           numeric(20,2) not null,
  fee             numeric(20,2) not null check (fee >= 0),
  net_cash        numeric(20,2) not null,   -- 현금 변동(매수 음수)
  realized_pnl    numeric(20,2),            -- 매도만
  trade_date      date not null,
  executed_at     timestamptz not null,     -- 정규장 개장 시각
  created_at      timestamptz not null default now()
);

create table ledger_entries (
  id             bigserial primary key,
  account_id     bigint not null references portfolio_accounts(id),
  entry_type     text not null check (entry_type in ('initial','trade','dividend','split','cash_in_lieu','delisting')),
  ref_type       text not null,
  ref_id         text not null,
  symbol         text not null default '',
  cash_delta     numeric(20,2) not null default 0,
  qty_delta      bigint not null default 0,
  effective_date date not null,
  created_at     timestamptz not null default now(),
  unique (account_id, entry_type, ref_type, ref_id, symbol)
);

-- ───────────────────────── 평가·통계
create table portfolio_snapshots (
  account_id     bigint not null references portfolio_accounts(id),
  session_date   date not null,
  cash           numeric(20,2) not null,
  holdings_value numeric(20,2) not null,
  equity         numeric(20,2) not null,
  daily_return   numeric(14,10),
  cum_return     numeric(14,10) not null,
  holdings       jsonb not null,
  stale_marks    text[] not null default '{}',
  created_at     timestamptz not null default now(),
  primary key (account_id, session_date)
);

create table benchmark_snapshots (
  account_id     bigint not null references portfolio_accounts(id),
  benchmark_code text not null,
  session_date   date not null,
  cash           numeric(20,2) not null,
  holdings_value numeric(20,2) not null,
  equity         numeric(20,2) not null,
  daily_return   numeric(14,10),
  cum_return     numeric(14,10) not null,
  holdings       jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  primary key (account_id, session_date)
);

create table performance_stats (
  account_id  bigint not null references portfolio_accounts(id),
  as_of       date not null,
  stats       jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (account_id, as_of)
);

-- ───────────────────────── 운영 (관리자 전용)
create table api_usage (
  id                 bigserial primary key,
  decision_id        bigint references ai_decisions(id),
  ai_model_id        text not null,
  model              text not null,
  status             text not null,
  input_tokens       int,
  output_tokens      int,
  estimated_cost_usd numeric(12,6),
  cost_usd           numeric(12,6),
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now()
);

create table job_runs (
  id          bigserial primary key,
  job_name    text not null,
  run_key     text not null,
  status      text not null check (status in ('running','succeeded','failed','skipped')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  detail      jsonb not null default '{}'
);
-- 같은 작업·같은 키로 '실행 중' 또는 '성공'은 하나만
create unique index job_runs_once on job_runs(job_name, run_key) where status in ('running','succeeded');

create table audit_logs (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      text not null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb not null default '{}'
);

create index on stock_prices(trade_date);
create index on orders(account_id, status);
create index on trades(account_id, trade_date);
create index on trades(symbol);
create index on ai_decisions(round_id);
create index on ledger_entries(account_id, effective_date);
create index on api_usage(created_at);
