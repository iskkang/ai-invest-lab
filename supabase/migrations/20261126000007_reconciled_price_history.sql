-- Keep original provider records and all economic references immutable.
-- A separate dataset makes independently reconciled values explicit.
ALTER TABLE stock_prices DROP CONSTRAINT stock_prices_source_check;
ALTER TABLE stock_prices ADD CONSTRAINT stock_prices_source_check
  CHECK (source IN ('nh_plug', 'demo', 'reconciled_live_v1'));
ALTER TABLE stock_prices ADD COLUMN provider text
  CHECK (provider IS NULL OR provider IN ('nh_plug', 'nasdaq_historical', 'demo'));
ALTER TABLE stock_prices ADD CONSTRAINT stock_prices_reconciled_provider_check
  CHECK (source <> 'reconciled_live_v1' OR
         (provider IS NOT NULL AND provider IN ('nh_plug', 'nasdaq_historical')));
-- NULL on an original row means its existing source is also its provider.
-- No original row is updated, including its fetched_at and raw evidence.
INSERT INTO stock_prices
  (symbol, trade_date, open, high, low, close, volume, source, fetched_at, raw, provider)
SELECT symbol, trade_date, open, high, low, close, volume, 'reconciled_live_v1', fetched_at,
       jsonb_build_object('provider', 'nh_plug', 'kind', 'legacy_canonical_copy',
                          'original_source', source, 'original_fetched_at', fetched_at,
                          'provider_raw', raw), 'nh_plug'
  FROM stock_prices WHERE source = 'nh_plug';

ALTER TABLE corporate_actions DROP CONSTRAINT corporate_actions_price_source_check;
ALTER TABLE corporate_actions ADD CONSTRAINT corporate_actions_price_source_check
  CHECK (price_source IN ('nh_plug', 'demo', 'reconciled_live_v1'));
INSERT INTO corporate_actions
  (symbol, kind, ex_date, ratio, amount, source, note, created_by, created_at, price_source)
SELECT symbol, kind, ex_date, ratio, amount, source,
       concat_ws(E'\n', note, 'Copied unchanged from nh_plug into reconciled_live_v1.'),
       'migration:reconciled_live_v1', created_at, 'reconciled_live_v1'
  FROM corporate_actions WHERE price_source = 'nh_plug';

-- Complete observed histories are analytical inputs, never replacement trade prices.
-- Repeated A -> B -> A content is three observations, not a globally deduplicated blob.
CREATE TABLE price_history_batches (
  id bigserial PRIMARY KEY,
  dataset text NOT NULL CHECK (dataset IN ('nh_plug', 'demo', 'reconciled_live_v1')),
  symbol text NOT NULL,
  through_date date NOT NULL,
  first_date date NOT NULL CHECK (first_date <= through_date),
  provider text NOT NULL CHECK (provider IN ('nh_plug', 'nasdaq_historical', 'demo')),
  basis text NOT NULL CHECK (length(basis) BETWEEN 1 AND 120),
  volume_unit text NOT NULL CHECK (length(volume_unit) BETWEEN 1 AND 120),
  observed_at timestamptz NOT NULL,
  bar_count integer NOT NULL CHECK (bar_count > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'array'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_array_length(payload) = bar_count)
);
CREATE INDEX price_history_batches_asof_idx
  ON price_history_batches(dataset, symbol, observed_at DESC, id DESC);
CREATE TRIGGER price_history_batches_immutable BEFORE UPDATE OR DELETE ON price_history_batches
  FOR EACH ROW EXECUTE FUNCTION ail_forbid_change();
ALTER TABLE price_history_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON price_history_batches FROM PUBLIC, anon, authenticated;
CREATE POLICY price_history_batches_engine_all ON price_history_batches
  FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE VIEW price_history_current WITH (security_invoker = true) AS
SELECT b.symbol, b.dataset AS source, (p.value->>'trade_date')::date AS trade_date,
       (p.value->>'open')::numeric AS open, (p.value->>'high')::numeric AS high,
       (p.value->>'low')::numeric AS low, (p.value->>'close')::numeric AS close,
       (p.value->>'volume')::bigint AS volume, b.observed_at AS fetched_at,
       b.provider, b.basis, b.volume_unit
  FROM (SELECT DISTINCT ON (dataset, symbol) * FROM price_history_batches
        ORDER BY dataset, symbol, observed_at DESC, id DESC) b
 CROSS JOIN LATERAL jsonb_array_elements(b.payload) p(value);
REVOKE ALL ON price_history_current FROM PUBLIC, anon, authenticated;
GRANT SELECT ON price_history_current TO CURRENT_USER;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON price_history_batches, price_history_current TO service_role;
  END IF;
END $$;
