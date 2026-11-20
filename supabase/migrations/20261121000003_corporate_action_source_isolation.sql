-- P0: Corporate actions must use the SAME price source as their experiment.
-- This migration preserves immutable historical rows and backfills the precise
-- DEMO marker used by the old bootstrap; it does NOT rewrite ledger/trades.
ALTER TABLE corporate_actions
  ADD COLUMN price_source text NOT NULL DEFAULT 'nh_plug'
  CHECK (price_source IN ('nh_plug', 'demo'));

-- Historical demo actions were previously mixed with real actions in a global
-- (symbol, kind, ex_date) namespace. Correct only their source classification.
-- The immutable trigger is disabled inside this migration transaction only.
ALTER TABLE corporate_actions DISABLE TRIGGER corporate_actions_immutable;
UPDATE corporate_actions
   SET price_source = 'demo'
 WHERE source = 'DEMO (synthetic)';
ALTER TABLE corporate_actions ENABLE TRIGGER corporate_actions_immutable;

ALTER TABLE corporate_actions
  DROP CONSTRAINT corporate_actions_symbol_kind_ex_date_key;
ALTER TABLE corporate_actions
  ADD CONSTRAINT corporate_actions_symbol_kind_ex_date_price_source_key
  UNIQUE (symbol, kind, ex_date, price_source);
CREATE INDEX corporate_actions_price_source_ex_date_idx
    ON corporate_actions (price_source, ex_date, symbol);

-- A previously settled, cross-contaminated ledger is intentionally NOT edited:
-- it is immutable evidence. Bootstrap rejects such experiments until audited.
