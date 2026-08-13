-- Canonical source-ingestion spine for objective execution evidence.
--
-- This migration is intentionally additive. It does not backfill, reinterpret,
-- or update existing Manual, legacy, or Paper trades. Source evidence remains
-- separate from canonical journal trades and trader-authored enrichment.

BEGIN;

-- Composite ownership keys let foreign keys prove that an optional EdgeScope
-- account mapping belongs to the same user.
CREATE UNIQUE INDEX IF NOT EXISTS trading_accounts_id_user_key
  ON public.trading_accounts(id, user_id);

-- A source identifies the origin class and, where meaningful, the provider.
-- provider_key is deliberately open text: adding a provider must not require a
-- product-wide enum migration.
CREATE TABLE public.evidence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind text NOT NULL
    CHECK (source_kind IN ('manual', 'file_import', 'connected')),
  provider_key text,
  display_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_sources_display_name_length
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT evidence_sources_provider_key_length
    CHECK (provider_key IS NULL OR char_length(provider_key) BETWEEN 1 AND 100),
  CONSTRAINT evidence_sources_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX evidence_sources_user_kind_provider_key
  ON public.evidence_sources(user_id, source_kind, provider_key)
  WHERE provider_key IS NOT NULL;
CREATE UNIQUE INDEX evidence_sources_user_kind_without_provider_key
  ON public.evidence_sources(user_id, source_kind)
  WHERE provider_key IS NULL;
CREATE UNIQUE INDEX evidence_sources_id_user_key
  ON public.evidence_sources(id, user_id);
CREATE INDEX evidence_sources_user_created_idx
  ON public.evidence_sources(user_id, created_at DESC);

-- A source account is the durable external/source identity. Its optional
-- EdgeScope account mapping can change without changing the source identity or
-- rewriting canonical trades.
CREATE TABLE public.source_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  external_account_id text,
  display_name text,
  edgescope_account_id uuid,
  source_currency text,
  source_timezone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_accounts_source_owner_fkey
    FOREIGN KEY (source_id, user_id)
    REFERENCES public.evidence_sources(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT source_accounts_edgescope_account_owner_fkey
    FOREIGN KEY (edgescope_account_id, user_id)
    REFERENCES public.trading_accounts(id, user_id)
    ON DELETE SET NULL (edgescope_account_id),
  CONSTRAINT source_accounts_external_id_length
    CHECK (external_account_id IS NULL OR char_length(external_account_id) BETWEEN 1 AND 500),
  CONSTRAINT source_accounts_display_name_length
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT source_accounts_currency_length
    CHECK (source_currency IS NULL OR char_length(source_currency) BETWEEN 1 AND 32),
  CONSTRAINT source_accounts_timezone_length
    CHECK (source_timezone IS NULL OR char_length(source_timezone) BETWEEN 1 AND 100),
  CONSTRAINT source_accounts_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX source_accounts_source_external_id_key
  ON public.source_accounts(source_id, external_account_id)
  WHERE external_account_id IS NOT NULL;
CREATE UNIQUE INDEX source_accounts_id_user_key
  ON public.source_accounts(id, user_id);
CREATE UNIQUE INDEX source_accounts_id_user_source_key
  ON public.source_accounts(id, user_id, source_id);
CREATE INDEX source_accounts_user_source_idx
  ON public.source_accounts(user_id, source_id, created_at DESC);
CREATE INDEX source_accounts_edgescope_account_idx
  ON public.source_accounts(user_id, edgescope_account_id)
  WHERE edgescope_account_id IS NOT NULL;

-- A run is one auditable import/sync batch. Counts and coverage remain nullable
-- until a real adapter can establish them; there is no workflow engine here.
CREATE TABLE public.ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  source_account_id uuid,
  external_run_id text,
  original_filename text,
  source_reference text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
  source_record_count integer CHECK (source_record_count IS NULL OR source_record_count >= 0),
  accepted_event_count integer CHECK (accepted_event_count IS NULL OR accepted_event_count >= 0),
  rejected_record_count integer CHECK (rejected_record_count IS NULL OR rejected_record_count >= 0),
  coverage_started_at timestamptz,
  coverage_ended_at timestamptz,
  status_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingestion_runs_source_owner_fkey
    FOREIGN KEY (source_id, user_id)
    REFERENCES public.evidence_sources(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT ingestion_runs_source_account_owner_fkey
    FOREIGN KEY (source_account_id, user_id, source_id)
    REFERENCES public.source_accounts(id, user_id, source_id)
    ON DELETE RESTRICT,
  CONSTRAINT ingestion_runs_external_id_length
    CHECK (external_run_id IS NULL OR char_length(external_run_id) BETWEEN 1 AND 500),
  CONSTRAINT ingestion_runs_filename_length
    CHECK (original_filename IS NULL OR char_length(original_filename) BETWEEN 1 AND 500),
  CONSTRAINT ingestion_runs_source_reference_length
    CHECK (source_reference IS NULL OR char_length(source_reference) BETWEEN 1 AND 2000),
  CONSTRAINT ingestion_runs_coverage_range
    CHECK (coverage_ended_at IS NULL OR coverage_started_at IS NULL OR coverage_ended_at >= coverage_started_at),
  CONSTRAINT ingestion_runs_completion_shape
    CHECK (
      (status IN ('pending', 'processing') AND completed_at IS NULL)
      OR (status IN ('completed', 'partial', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    ),
  CONSTRAINT ingestion_runs_counts_shape
    CHECK (
      source_record_count IS NULL
      OR accepted_event_count IS NULL
      OR rejected_record_count IS NULL
      OR accepted_event_count + rejected_record_count <= source_record_count
    ),
  CONSTRAINT ingestion_runs_status_metadata_object
    CHECK (jsonb_typeof(status_metadata) = 'object'),
  CONSTRAINT ingestion_runs_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX ingestion_runs_account_external_run_key
  ON public.ingestion_runs(source_account_id, external_run_id)
  WHERE source_account_id IS NOT NULL AND external_run_id IS NOT NULL;
CREATE UNIQUE INDEX ingestion_runs_source_external_run_key
  ON public.ingestion_runs(source_id, external_run_id)
  WHERE source_account_id IS NULL AND external_run_id IS NOT NULL;
CREATE UNIQUE INDEX ingestion_runs_id_user_source_key
  ON public.ingestion_runs(id, user_id, source_id);
CREATE INDEX ingestion_runs_user_created_idx
  ON public.ingestion_runs(user_id, created_at DESC);
CREATE INDEX ingestion_runs_source_account_created_idx
  ON public.ingestion_runs(source_account_id, created_at DESC)
  WHERE source_account_id IS NOT NULL;

-- One row is one objective source event, not one journal trade. Normalized cost
-- components are signed contributions to net P&L: negative values reduce it and
-- positive values increase it. A future adapter is responsible for normalizing
-- provider-specific sign conventions. Missing values remain NULL.
CREATE TABLE public.source_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  source_account_id uuid,
  ingestion_run_id uuid NOT NULL,
  external_id_kind text,
  external_event_id text,
  external_deal_id text,
  external_order_id text,
  external_position_id text,
  external_transaction_id text,
  event_kind text NOT NULL
    CHECK (event_kind IN (
      'fill', 'partial_entry', 'partial_exit', 'commission', 'fee', 'swap',
      'correction', 'transaction', 'other'
    )),
  source_event_type text,
  source_symbol text,
  normalized_instrument text,
  source_side text,
  normalized_side text CHECK (normalized_side IS NULL OR normalized_side IN ('buy', 'sell')),
  quantity numeric(28,10) CHECK (quantity IS NULL OR quantity >= 0),
  price numeric(28,10),
  source_timestamp text,
  occurred_at timestamptz,
  source_timezone text,
  source_utc_offset_minutes smallint
    CHECK (
      source_utc_offset_minutes IS NULL
      OR source_utc_offset_minutes BETWEEN -840 AND 840
    ),
  source_currency text,
  gross_pnl numeric(28,8),
  commission numeric(28,8),
  fees numeric(28,8),
  swap numeric(28,8),
  other_costs numeric(28,8),
  net_pnl numeric(28,8),
  raw_payload jsonb NOT NULL,
  normalization_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_events_source_owner_fkey
    FOREIGN KEY (source_id, user_id)
    REFERENCES public.evidence_sources(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT source_events_source_account_owner_fkey
    FOREIGN KEY (source_account_id, user_id, source_id)
    REFERENCES public.source_accounts(id, user_id, source_id)
    ON DELETE RESTRICT,
  CONSTRAINT source_events_run_owner_fkey
    FOREIGN KEY (ingestion_run_id, user_id, source_id)
    REFERENCES public.ingestion_runs(id, user_id, source_id)
    ON DELETE RESTRICT,
  CONSTRAINT source_events_external_identity_shape
    CHECK (
      (external_id_kind IS NULL AND external_event_id IS NULL)
      OR (external_id_kind IS NOT NULL AND external_event_id IS NOT NULL)
    ),
  CONSTRAINT source_events_external_id_kind_length
    CHECK (external_id_kind IS NULL OR char_length(external_id_kind) BETWEEN 1 AND 100),
  CONSTRAINT source_events_external_event_id_length
    CHECK (external_event_id IS NULL OR char_length(external_event_id) BETWEEN 1 AND 500),
  CONSTRAINT source_events_source_timestamp_length
    CHECK (source_timestamp IS NULL OR char_length(source_timestamp) BETWEEN 1 AND 500),
  CONSTRAINT source_events_timezone_length
    CHECK (source_timezone IS NULL OR char_length(source_timezone) BETWEEN 1 AND 100),
  CONSTRAINT source_events_currency_length
    CHECK (source_currency IS NULL OR char_length(source_currency) BETWEEN 1 AND 32),
  CONSTRAINT source_events_raw_payload_object
    CHECK (jsonb_typeof(raw_payload) = 'object'),
  CONSTRAINT source_events_normalization_metadata_object
    CHECK (jsonb_typeof(normalization_metadata) = 'object')
);

-- Source-provided stable IDs are definitive only inside their real source
-- scope. Rows without such an ID deliberately receive no heuristic uniqueness.
CREATE UNIQUE INDEX source_events_account_external_identity_key
  ON public.source_events(source_account_id, external_id_kind, external_event_id)
  WHERE source_account_id IS NOT NULL AND external_event_id IS NOT NULL;
CREATE UNIQUE INDEX source_events_source_external_identity_key
  ON public.source_events(source_id, external_id_kind, external_event_id)
  WHERE source_account_id IS NULL AND external_event_id IS NOT NULL;
CREATE UNIQUE INDEX source_events_id_user_key
  ON public.source_events(id, user_id);
CREATE INDEX source_events_run_idx
  ON public.source_events(user_id, ingestion_run_id, created_at);
CREATE INDEX source_events_account_time_idx
  ON public.source_events(user_id, source_account_id, occurred_at)
  WHERE source_account_id IS NOT NULL;

-- Linkage is separate so matching/reconciliation never updates source facts or
-- trader-authored journal content. An event belongs to at most one canonical
-- trade, while a trade may collect any number of events.
CREATE TABLE public.trade_source_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_id, source_event_id),
  CONSTRAINT trade_source_events_event_key UNIQUE (source_event_id),
  CONSTRAINT trade_source_events_trade_owner_fkey
    FOREIGN KEY (trade_id, user_id)
    REFERENCES public.trades(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT trade_source_events_event_owner_fkey
    FOREIGN KEY (source_event_id, user_id)
    REFERENCES public.source_events(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX trade_source_events_user_trade_idx
  ON public.trade_source_events(user_id, trade_id, linked_at);

COMMENT ON TABLE public.evidence_sources IS
  'User-owned factual origin identities for Manual, file-import, or connected evidence.';
COMMENT ON TABLE public.source_accounts IS
  'Source account identities optionally mapped to EdgeScope trading accounts without changing either identity.';
COMMENT ON TABLE public.ingestion_runs IS
  'Auditable import/sync batch identity and known coverage; no row is itself a journal trade.';
COMMENT ON TABLE public.source_events IS
  'Immutable objective source events. No Playbook intent, Category, review, psychology, or focus evidence belongs here.';
COMMENT ON TABLE public.trade_source_events IS
  'Re-linkable lineage between immutable source events and canonical journal trades.';
COMMENT ON COLUMN public.source_events.raw_payload IS
  'Immutable source-supplied row/object used for audit and later reprocessing; adapters must exclude credentials and secrets.';
COMMENT ON COLUMN public.source_events.normalization_metadata IS
  'Adapter/mapping provenance for normalized fields; the original source values remain in raw_payload and source_* columns.';
COMMENT ON COLUMN public.source_events.net_pnl IS
  'Normalized signed net P&L when known. Never implies or supplies canonical trade Risk.';

-- Source event facts are append-only. A correction is another source event;
-- journal linkage is changed in trade_source_events instead.
CREATE FUNCTION public.prevent_source_event_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Source event evidence is immutable; append a correction event instead';
END;
$$;

CREATE TRIGGER trg_source_events_immutable
  BEFORE UPDATE ON public.source_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_source_event_update();

-- Durable identity coordinates cannot be retargeted, while display/mapping
-- metadata and run completion facts may be maintained.
CREATE FUNCTION public.prevent_evidence_source_retargeting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.provider_key IS DISTINCT FROM OLD.provider_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Evidence source identity cannot be retargeted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prevent_source_account_retargeting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.external_account_id IS DISTINCT FROM OLD.external_account_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Source account identity cannot be retargeted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prevent_ingestion_run_retargeting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.source_account_id IS DISTINCT FROM OLD.source_account_id
     OR NEW.external_run_id IS DISTINCT FROM OLD.external_run_id
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Ingestion run identity cannot be retargeted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_evidence_sources_identity
  BEFORE UPDATE ON public.evidence_sources
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_source_retargeting();
CREATE TRIGGER trg_source_accounts_identity
  BEFORE UPDATE ON public.source_accounts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_source_account_retargeting();
CREATE TRIGGER trg_ingestion_runs_identity
  BEFORE UPDATE ON public.ingestion_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ingestion_run_retargeting();

CREATE TRIGGER trg_evidence_sources_updated_at
  BEFORE UPDATE ON public.evidence_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_source_accounts_updated_at
  BEFORE UPDATE ON public.source_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ingestion_runs_updated_at
  BEFORE UPDATE ON public.ingestion_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_source_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY evidence_sources_select_own
  ON public.evidence_sources FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY evidence_sources_insert_own
  ON public.evidence_sources FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY evidence_sources_update_own
  ON public.evidence_sources FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY source_accounts_select_own
  ON public.source_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY source_accounts_insert_own
  ON public.source_accounts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evidence_sources source
      WHERE source.id = source_accounts.source_id AND source.user_id = auth.uid()
    )
    AND (
      edgescope_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.trading_accounts account
        WHERE account.id = source_accounts.edgescope_account_id
          AND account.user_id = auth.uid()
      )
    )
  );
CREATE POLICY source_accounts_update_own
  ON public.source_accounts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evidence_sources source
      WHERE source.id = source_accounts.source_id AND source.user_id = auth.uid()
    )
    AND (
      edgescope_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.trading_accounts account
        WHERE account.id = source_accounts.edgescope_account_id
          AND account.user_id = auth.uid()
      )
    )
  );

CREATE POLICY ingestion_runs_select_own
  ON public.ingestion_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY ingestion_runs_insert_own
  ON public.ingestion_runs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evidence_sources source
      WHERE source.id = ingestion_runs.source_id AND source.user_id = auth.uid()
    )
    AND (
      source_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.source_accounts account
        WHERE account.id = ingestion_runs.source_account_id
          AND account.source_id = ingestion_runs.source_id
          AND account.user_id = auth.uid()
      )
    )
  );
CREATE POLICY ingestion_runs_update_own
  ON public.ingestion_runs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evidence_sources source
      WHERE source.id = ingestion_runs.source_id AND source.user_id = auth.uid()
    )
    AND (
      source_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.source_accounts account
        WHERE account.id = ingestion_runs.source_account_id
          AND account.source_id = ingestion_runs.source_id
          AND account.user_id = auth.uid()
      )
    )
  );

CREATE POLICY source_events_select_own
  ON public.source_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY source_events_insert_own
  ON public.source_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ingestion_runs run
      WHERE run.id = source_events.ingestion_run_id
        AND run.source_id = source_events.source_id
        AND run.user_id = auth.uid()
        AND (
          run.source_account_id IS NULL
          OR run.source_account_id = source_events.source_account_id
        )
    )
    AND (
      source_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.source_accounts account
        WHERE account.id = source_events.source_account_id
          AND account.source_id = source_events.source_id
          AND account.user_id = auth.uid()
      )
    )
  );

CREATE POLICY trade_source_events_select_own
  ON public.trade_source_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY trade_source_events_insert_own
  ON public.trade_source_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trades trade
      WHERE trade.id = trade_source_events.trade_id AND trade.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.source_events event
      WHERE event.id = trade_source_events.source_event_id
        AND event.user_id = auth.uid()
    )
  );
CREATE POLICY trade_source_events_delete_own
  ON public.trade_source_events FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.evidence_sources FROM anon;
REVOKE ALL ON public.source_accounts FROM anon;
REVOKE ALL ON public.ingestion_runs FROM anon;
REVOKE ALL ON public.source_events FROM anon;
REVOKE ALL ON public.trade_source_events FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.evidence_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.source_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ingestion_runs TO authenticated;
GRANT SELECT, INSERT ON public.source_events TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.trade_source_events TO authenticated;

GRANT ALL ON public.evidence_sources TO service_role;
GRANT ALL ON public.source_accounts TO service_role;
GRANT ALL ON public.ingestion_runs TO service_role;
GRANT ALL ON public.source_events TO service_role;
GRANT ALL ON public.trade_source_events TO service_role;

-- No UPDATE touches public.trades, and no lineage row is manufactured for
-- historical records. Manual, legacy, and Paper evidence retain their exact
-- existing semantics until a future explicit matching workflow links events.

COMMIT;
