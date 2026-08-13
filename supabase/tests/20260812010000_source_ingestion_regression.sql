-- Disposable local-Supabase regression plan for
-- 20260812010000_source_ingestion_spine.sql.
--
-- Apply the migration only to a disposable/local production-equivalent schema,
-- then run:
--   psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/20260812010000_source_ingestion_regression.sql
-- Never point DISPOSABLE_DATABASE_URL at production. All fixtures roll back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS NOT TRUE THEN RAISE EXCEPTION 'assertion failed: %', message; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_failure(statement text, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  RAISE EXCEPTION 'expected failure: %', message;
END;
$$;

-- RLS is not a substitute for table-level privilege boundaries. Keep the Data
-- API contract exact and make future public tables opt in deliberately.
SELECT pg_temp.assert_true(
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) = 'INSERT,SELECT,UPDATE'
   FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated'
     AND table_schema = 'public'
     AND table_name = 'evidence_sources'),
  'evidence sources must expose only select, insert, and update'
);
SELECT pg_temp.assert_true(
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) = 'INSERT,SELECT,UPDATE'
   FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated'
     AND table_schema = 'public'
     AND table_name = 'source_accounts'),
  'source accounts must expose only select, insert, and update'
);
SELECT pg_temp.assert_true(
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) = 'INSERT,SELECT,UPDATE'
   FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated'
     AND table_schema = 'public'
     AND table_name = 'ingestion_runs'),
  'ingestion runs must expose only select, insert, and update'
);
SELECT pg_temp.assert_true(
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) = 'INSERT,SELECT'
   FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated'
     AND table_schema = 'public'
     AND table_name = 'source_events'),
  'immutable source events must expose only select and insert'
);
SELECT pg_temp.assert_true(
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) = 'DELETE,INSERT,SELECT'
   FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated'
     AND table_schema = 'public'
     AND table_name = 'trade_source_events'),
  'trade/source linkage must expose only select, insert, and delete'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_schema = 'public'
      AND table_name IN (
        'evidence_sources', 'source_accounts', 'ingestion_runs',
        'source_events', 'trade_source_events'
      )
  ),
  'anonymous callers must have no ingestion-table privileges'
);

CREATE TABLE public._ingestion_default_privilege_probe (id bigint);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'public._ingestion_default_privilege_probe', 'SELECT')
    AND NOT has_table_privilege('anon', 'public._ingestion_default_privilege_probe', 'SELECT'),
  'future public tables must opt into Data API privileges explicitly'
);
DROP TABLE public._ingestion_default_privilege_probe;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ingestion-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ingestion-b@example.invalid', '', now(), '{}', '{}', now(), now());

INSERT INTO public.trading_accounts (id, user_id, name) VALUES
  ('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Journal A'),
  ('12000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'Journal B');

INSERT INTO public.trades (
  id, user_id, account_id, market, instrument, trade_date, direction,
  reasoning, primary_category, is_paper
) VALUES
  ('13000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000001', 'forex', 'EURUSD', current_date, 'long',
   'Trader-authored reason', 'Breakout', false),
  ('13000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000001', 'forex', 'GBPUSD', current_date, 'short',
   'Paper reason', 'Reversal', true),
  ('13000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002', 'forex', 'USDJPY', current_date, 'short',
   'Other user reason', 'Trend', false);

INSERT INTO public.evidence_sources (
  id, user_id, source_kind, provider_key, display_name
) VALUES
  ('14000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   'file_import', 'broker_csv', 'Broker CSV'),
  ('14000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001',
   'file_import', 'other_csv', 'Other CSV'),
  ('14000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002',
   'file_import', 'broker_csv', 'Broker CSV');

INSERT INTO public.source_accounts (
  id, user_id, source_id, external_account_id, display_name,
  edgescope_account_id, source_currency, source_timezone
) VALUES
  ('15000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', 'account-42', 'Broker 42',
   '12000000-0000-4000-8000-000000000001', 'USD', 'Etc/UTC'),
  ('15000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000002', 'account-42', 'Other provider 42',
   '12000000-0000-4000-8000-000000000001', 'USD', 'Etc/UTC'),
  ('15000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002',
   '14000000-0000-4000-8000-000000000003', 'account-42', 'Other user 42',
   '12000000-0000-4000-8000-000000000002', 'USD', 'Etc/UTC');

-- The same external account ID is legitimate for another provider/user scope.
SELECT pg_temp.assert_true(
  (SELECT count(*) = 3 FROM public.source_accounts WHERE external_account_id = 'account-42'),
  'external account IDs must be scoped by source rather than globally unique'
);

INSERT INTO public.ingestion_runs (
  id, user_id, source_id, source_account_id, external_run_id, original_filename,
  coverage_started_at, coverage_ended_at
) VALUES
  ('16000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001',
   'run-1', 'history.csv', now() - interval '1 day', now()),
  ('16000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000002',
   'run-1', 'other.csv', now() - interval '1 day', now()),
  ('16000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002',
   '14000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000003',
   'run-1', 'history.csv', now() - interval '1 day', now());

INSERT INTO public.source_events (
  id, user_id, source_id, source_account_id, ingestion_run_id,
  external_id_kind, external_event_id, event_kind,
  source_symbol, normalized_instrument, source_timestamp, occurred_at,
  source_timezone, source_utc_offset_minutes, source_currency,
  quantity, price, gross_pnl, commission, fees, swap, other_costs, net_pnl,
  raw_payload, normalization_metadata
) VALUES
  ('17000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001',
   '16000000-0000-4000-8000-000000000001', 'deal', 'deal-1', 'partial_entry',
   'EURUSD.r', 'EURUSD', '2026-08-12 10:00:00 +05:30', '2026-08-12 04:30:00+00',
   'Asia/Calcutta', 330, 'USD', 0.5, 1.1, NULL, -2, 0, 0, 0, NULL,
   '{"Deal":"deal-1","Symbol":"EURUSD.r","Commission":"-2"}',
   '{"adapter":"csv","mapping_version":1}'),
  ('17000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001',
   '16000000-0000-4000-8000-000000000001', 'deal', 'deal-2', 'partial_exit',
   'EURUSD.r', 'EURUSD', '2026-08-12 11:00:00 +05:30', '2026-08-12 05:30:00+00',
   'Asia/Calcutta', 330, 'USD', 0.5, 1.2, 102, -2, -1, 0, 0, 99,
   '{"Deal":"deal-2","Symbol":"EURUSD.r","Profit":"102"}',
   '{"adapter":"csv","mapping_version":1}'),
  -- Same provider event ID in a genuinely different source-account scope.
  ('17000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000002',
   '16000000-0000-4000-8000-000000000002', 'deal', 'deal-1', 'fill',
   'GBPUSD', 'GBPUSD', '2026-08-12T10:00:00Z', '2026-08-12 10:00:00+00',
   'Etc/UTC', 0, 'USD', 1, 1.3, NULL, NULL, NULL, NULL, NULL, NULL,
   '{"deal":"deal-1"}', '{"adapter":"csv"}'),
  ('17000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000002',
   '14000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000003',
   '16000000-0000-4000-8000-000000000003', 'deal', 'deal-1', 'fill',
   'USDJPY', 'USDJPY', '2026-08-12T10:00:00Z', '2026-08-12 10:00:00+00',
   'Etc/UTC', 0, 'USD', 1, 145, NULL, NULL, NULL, NULL, NULL, NULL,
   '{"deal":"deal-1"}', '{"adapter":"csv"}');

SELECT pg_temp.expect_failure(
  $$INSERT INTO public.source_events (
      user_id, source_id, source_account_id, ingestion_run_id,
      external_id_kind, external_event_id, event_kind, raw_payload
    ) VALUES (
      '11000000-0000-4000-8000-000000000001',
      '14000000-0000-4000-8000-000000000001',
      '15000000-0000-4000-8000-000000000001',
      '16000000-0000-4000-8000-000000000001',
      'deal', 'deal-1', 'fill', '{}'
    )$$,
  'a source-provided event ID must deduplicate inside the same account and namespace'
);

INSERT INTO public.trade_source_events (user_id, trade_id, source_event_id) VALUES
  ('11000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001',
   '17000000-0000-4000-8000-000000000001'),
  ('11000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001',
   '17000000-0000-4000-8000-000000000002'),
  ('11000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002',
   '17000000-0000-4000-8000-000000000003');

SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.trade_source_events
   WHERE trade_id = '13000000-0000-4000-8000-000000000001'),
  'one canonical journal trade must accept multiple source events'
);
SELECT pg_temp.assert_true(
  (SELECT reasoning = 'Trader-authored reason' AND primary_category = 'Breakout'
   FROM public.trades WHERE id = '13000000-0000-4000-8000-000000000001'),
  'linking source evidence must not populate or overwrite trader enrichment'
);
SELECT pg_temp.assert_true(
  (SELECT is_paper AND reasoning = 'Paper reason'
   FROM public.trades WHERE id = '13000000-0000-4000-8000-000000000002'),
  'linking evidence must not remove Paper quarantine or rewrite its context'
);
SELECT pg_temp.assert_true(
  (SELECT raw_payload->>'Commission' = '-2'
     AND source_symbol = 'EURUSD.r'
     AND normalized_instrument = 'EURUSD'
     AND source_timestamp = '2026-08-12 10:00:00 +05:30'
   FROM public.source_events WHERE id = '17000000-0000-4000-8000-000000000001'),
  'raw, symbol, and timestamp source values must survive normalization'
);
SELECT pg_temp.expect_failure(
  $$UPDATE public.source_events
    SET raw_payload = '{"Deal":"rewritten"}'
    WHERE id = '17000000-0000-4000-8000-000000000001'$$,
  'raw source evidence must be immutable'
);
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.trade_source_events (user_id, trade_id, source_event_id) VALUES (
      '11000000-0000-4000-8000-000000000001',
      '13000000-0000-4000-8000-000000000001',
      '17000000-0000-4000-8000-000000000004'
    )$$,
  'a source event owned by another user must not link to this user trade'
);

-- The objective evidence table has no subjective journal columns.
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'source_events'
      AND column_name IN (
        'primary_category', 'categories', 'setup_intent_version_id', 'setup_adherence',
        'reasoning', 'emotion_before', 'emotion_during', 'emotion_after', 'grade',
        'mistake_tags', 'review_completed_at'
      )
  ),
  'source events must not contain subjective/trader-enrichment fields'
);

-- RLS isolates every user-owned layer.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.source_accounts),
  'source-account RLS must expose only the current user rows'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.ingestion_runs),
  'ingestion-run RLS must expose only the current user rows'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 3 FROM public.source_events),
  'source-event RLS must expose only the current user rows'
);
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.ingestion_runs (user_id, source_id, status)
    VALUES (
      '11000000-0000-4000-8000-000000000001',
      '14000000-0000-4000-8000-000000000003',
      'pending'
    )$$,
  'a user cannot create a batch against another user source'
);
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.source_events (
      user_id, source_id, source_account_id, ingestion_run_id, event_kind, raw_payload
    ) VALUES (
      '11000000-0000-4000-8000-000000000001',
      '14000000-0000-4000-8000-000000000003',
      '15000000-0000-4000-8000-000000000003',
      '16000000-0000-4000-8000-000000000003',
      'fill', '{}'
    )$$,
  'a user cannot create an event against another user batch/account'
);
RESET ROLE;

-- Evidence dependencies are restrictive, while deleting an individual event
-- cannot cascade into the canonical trade or its enrichment.
SELECT pg_temp.expect_failure(
  $$DELETE FROM public.ingestion_runs
    WHERE id = '16000000-0000-4000-8000-000000000001'$$,
  'a run containing source events cannot be casually deleted'
);
SELECT pg_temp.expect_failure(
  $$DELETE FROM public.source_accounts
    WHERE id = '15000000-0000-4000-8000-000000000001'$$,
  'a source account containing source events cannot be casually deleted'
);
DELETE FROM public.source_events
WHERE id = '17000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(
  (SELECT reasoning = 'Trader-authored reason' AND primary_category = 'Breakout'
   FROM public.trades WHERE id = '13000000-0000-4000-8000-000000000001'),
  'deleting source evidence must not cascade-delete the journal trade or enrichment'
);

ROLLBACK;
