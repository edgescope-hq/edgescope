-- Quick Capture intentionally permits partial journal records. Performance
-- eligibility is derived in application code; incomplete rows remain private
-- to their owner under the existing trades RLS policies.
ALTER TABLE public.trades
  ALTER COLUMN instrument DROP NOT NULL,
  ALTER COLUMN direction DROP NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scope_discovery_seen_ids text[] NOT NULL DEFAULT '{}';
