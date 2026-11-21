-- Counts per model inference, stored with existing private API usage records.
-- No changes to simulation outcomes, decisions, RLS, model versions or grants.
-- 0 or 1 per decision: the engine never re-asks for a bad model response.
alter table public.api_usage
  add column if not exists invalid_response_count smallint not null default 0,
  add column if not exists retry_count smallint not null default 0;

alter table public.api_usage
  add constraint api_usage_invalid_response_count_range
    check (invalid_response_count between 0 and 1),
  add constraint api_usage_retry_count_range
    check (retry_count between 0 and 1);

comment on column public.api_usage.invalid_response_count is
  '0 or 1 unusable model response (schema rejection or malformed provider payload); never retried after receipt';
comment on column public.api_usage.retry_count is
  'Number of pre-response transient transport/429/5xx re-sends (max one); excludes bad-response re-asks';
