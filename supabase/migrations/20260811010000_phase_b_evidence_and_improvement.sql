-- Phase B: trustworthy evidence semantics, trader-owned standards, and one
-- prospective improvement lifecycle. All changes are additive. Existing trade
-- category arrays, achieved R values, notebook entries, and sticky notes remain
-- untouched so historical meaning can still be recovered exactly.

BEGIN;

-- A primary Category is an observational classification. The legacy categories
-- array is retained verbatim (including extra historical values).
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS primary_category text,
  ADD COLUMN IF NOT EXISTS setup_intent_version_id uuid,
  ADD COLUMN IF NOT EXISTS setup_intent_provenance text,
  ADD COLUMN IF NOT EXISTS setup_intent_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_adherence text,
  ADD COLUMN IF NOT EXISTS setup_adherence_recorded_at timestamptz;

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_setup_intent_provenance_check,
  ADD CONSTRAINT trades_setup_intent_provenance_check
    CHECK (
      setup_intent_provenance IS NULL
      OR setup_intent_provenance IN ('capture', 'retrospective_review')
    ),
  DROP CONSTRAINT IF EXISTS trades_setup_adherence_check,
  ADD CONSTRAINT trades_setup_adherence_check
    CHECK (
      setup_adherence IS NULL
      OR setup_adherence IN ('followed', 'deviated', 'unassessable')
    ),
  DROP CONSTRAINT IF EXISTS trades_setup_intent_shape_check,
  ADD CONSTRAINT trades_setup_intent_shape_check
    CHECK (
      (
        setup_intent_version_id IS NULL
        AND setup_intent_provenance IS NULL
        AND setup_intent_recorded_at IS NULL
        AND setup_adherence IS NULL
        AND setup_adherence_recorded_at IS NULL
      )
      OR (
        setup_intent_version_id IS NOT NULL
        AND setup_intent_provenance IS NOT NULL
        AND setup_intent_recorded_at IS NOT NULL
        AND (
          (setup_adherence IS NULL AND setup_adherence_recorded_at IS NULL)
          OR (setup_adherence IS NOT NULL AND setup_adherence_recorded_at IS NOT NULL)
        )
      )
    );

COMMENT ON COLUMN public.trades.primary_category IS
  'Trader-selected observational primary category. Legacy categories[] is preserved unchanged.';
COMMENT ON COLUMN public.trades.setup_intent_provenance IS
  'How the trader recorded optional Playbook setup intent; never inferred from Category.';
COMMENT ON COLUMN public.trades.setup_adherence IS
  'Optional trader assessment for a trade with explicit setup intent; P/L never determines it.';

-- Deliberately adopted standards are snapshots, separate from editable ordinary
-- notebook material. A stable standard can receive prospective versions without
-- rewriting the version referenced by a historical trade.
CREATE TABLE IF NOT EXISTS public.playbook_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_entry_id uuid REFERENCES public.notebook_entries(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playbook_standards_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT playbook_standards_user_source_key UNIQUE (user_id, source_entry_id)
);

CREATE TABLE IF NOT EXISTS public.playbook_standard_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid NOT NULL REFERENCES public.playbook_standards(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playbook_standard_versions_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT playbook_standard_versions_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT playbook_standard_versions_number_key UNIQUE (standard_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS playbook_standard_versions_one_current
  ON public.playbook_standard_versions(standard_id)
  WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS playbook_standards_user_status_idx
  ON public.playbook_standards(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS playbook_standard_versions_user_effective_idx
  ON public.playbook_standard_versions(user_id, effective_from DESC);

-- Composite ownership keys let foreign keys prove that a referenced notebook
-- entry, standard version, focus, or trade belongs to the same user. The
-- single-column foreign keys above still define the intended delete behavior.
CREATE UNIQUE INDEX IF NOT EXISTS notebook_entries_id_user_key
  ON public.notebook_entries(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS playbook_standards_id_user_key
  ON public.playbook_standards(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS playbook_standard_versions_id_user_key
  ON public.playbook_standard_versions(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS trades_id_user_key
  ON public.trades(id, user_id);

ALTER TABLE public.playbook_standards
  ADD CONSTRAINT playbook_standards_source_owner_fkey
    FOREIGN KEY (source_entry_id, user_id)
    REFERENCES public.notebook_entries(id, user_id);
ALTER TABLE public.playbook_standard_versions
  ADD CONSTRAINT playbook_standard_versions_standard_owner_fkey
    FOREIGN KEY (standard_id, user_id)
    REFERENCES public.playbook_standards(id, user_id);

ALTER TABLE public.playbook_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_standard_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playbook_standards_select_own"
  ON public.playbook_standards FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "playbook_standards_insert_own"
  ON public.playbook_standards FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      source_entry_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.notebook_entries entry
        WHERE entry.id = source_entry_id AND entry.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "playbook_standards_update_own"
  ON public.playbook_standards FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      source_entry_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.notebook_entries entry
        WHERE entry.id = source_entry_id AND entry.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "playbook_standard_versions_select_own"
  ON public.playbook_standard_versions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "playbook_standard_versions_insert_own"
  ON public.playbook_standard_versions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.playbook_standards s
      WHERE s.id = standard_id AND s.user_id = auth.uid()
    )
  );
CREATE POLICY "playbook_standard_versions_update_own"
  ON public.playbook_standard_versions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.playbook_standards s
      WHERE s.id = standard_id AND s.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.playbook_standards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.playbook_standard_versions TO authenticated;
GRANT ALL ON public.playbook_standards TO service_role;
GRANT ALL ON public.playbook_standard_versions TO service_role;

DROP TRIGGER IF EXISTS trg_playbook_standards_updated_at ON public.playbook_standards;
CREATE TRIGGER trg_playbook_standards_updated_at
  BEFORE UPDATE ON public.playbook_standards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_playbook_version_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.effective_to IS NOT NULL THEN
      RAISE EXCEPTION 'A new Playbook standard version must begin as the current version';
    END IF;
    -- The database, rather than a browser-provided timestamp, establishes when
    -- a standard starts governing future captures.
    NEW.effective_from := now();
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.standard_id IS DISTINCT FROM OLD.standard_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Playbook standard version snapshots are immutable';
  END IF;

  IF OLD.effective_to IS NOT NULL AND NEW.effective_to IS NOT NULL
     AND NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
    RAISE EXCEPTION 'A closed Playbook standard version cannot be rewritten';
  END IF;

  IF OLD.effective_to IS NOT NULL AND NEW.effective_to IS NULL
     AND EXISTS (
       SELECT 1
       FROM public.playbook_standard_versions newer
       WHERE newer.standard_id = OLD.standard_id
         AND newer.version_number > OLD.version_number
     ) THEN
    RAISE EXCEPTION 'A superseded Playbook standard version cannot be reopened';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_playbook_standard_versions_snapshot
  ON public.playbook_standard_versions;
CREATE TRIGGER trg_playbook_standard_versions_snapshot
  BEFORE INSERT OR UPDATE ON public.playbook_standard_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_playbook_version_snapshot();

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_setup_intent_version_id_fkey,
  ADD CONSTRAINT trades_setup_intent_version_id_fkey
    FOREIGN KEY (setup_intent_version_id)
    REFERENCES public.playbook_standard_versions(id)
    ON DELETE RESTRICT;

ALTER TABLE public.trades
  ADD CONSTRAINT trades_setup_intent_version_owner_fkey
    FOREIGN KEY (setup_intent_version_id, user_id)
    REFERENCES public.playbook_standard_versions(id, user_id);

CREATE INDEX IF NOT EXISTS trades_setup_intent_version_idx
  ON public.trades(user_id, setup_intent_version_id)
  WHERE setup_intent_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_setup_capture_reclassification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.setup_intent_provenance = 'capture'
     AND (
       NEW.setup_intent_version_id IS DISTINCT FROM OLD.setup_intent_version_id
       OR OLD.setup_intent_provenance IS DISTINCT FROM 'capture'
     ) THEN
    RAISE EXCEPTION 'Existing trades cannot be reclassified as capture-time setup intent';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trades_prevent_setup_capture_reclassification ON public.trades;
CREATE TRIGGER trg_trades_prevent_setup_capture_reclassification
  BEFORE UPDATE OF setup_intent_version_id, setup_intent_provenance ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.prevent_setup_capture_reclassification();

-- Scope owns a single active, trader-approved behavioral focus. Historical
-- source evidence may ground it, but only later linked occurrences assess it.
CREATE TABLE IF NOT EXISTS public.improvement_focuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin IN ('scope', 'trader')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'closed', 'stopped')),
  behavior text NOT NULL,
  trigger_situation text NOT NULL,
  intended_behavior text NOT NULL,
  grounding text NOT NULL,
  relevant_evidence_definition text NOT NULL,
  source_discovery_id text,
  source_trade_ids uuid[] NOT NULL DEFAULT '{}',
  standard_version_id uuid REFERENCES public.playbook_standard_versions(id) ON DELETE RESTRICT,
  activated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  resolution text CHECK (
    resolution IS NULL
    OR resolution IN ('improved', 'unresolved', 'unsupported', 'no_longer_applicable')
  ),
  closure_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT improvement_focuses_behavior_length CHECK (char_length(behavior) BETWEEN 1 AND 500),
  CONSTRAINT improvement_focuses_trigger_length CHECK (char_length(trigger_situation) BETWEEN 1 AND 500),
  CONSTRAINT improvement_focuses_intended_length CHECK (char_length(intended_behavior) BETWEEN 1 AND 500),
  CONSTRAINT improvement_focuses_grounding_length CHECK (char_length(grounding) BETWEEN 1 AND 2000),
  CONSTRAINT improvement_focuses_evidence_length CHECK (char_length(relevant_evidence_definition) BETWEEN 1 AND 1000),
  CONSTRAINT improvement_focuses_closure_state CHECK (
    (state = 'active' AND closed_at IS NULL AND resolution IS NULL)
    OR (state = 'closed' AND closed_at IS NOT NULL AND resolution IS NOT NULL)
    OR (state = 'stopped' AND closed_at IS NOT NULL AND resolution IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS improvement_focuses_one_active_per_user
  ON public.improvement_focuses(user_id)
  WHERE state = 'active';
CREATE INDEX IF NOT EXISTS improvement_focuses_user_history_idx
  ON public.improvement_focuses(user_id, activated_at DESC);

CREATE TABLE IF NOT EXISTS public.improvement_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  focus_id uuid NOT NULL REFERENCES public.improvement_focuses(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  assessment text NOT NULL CHECK (assessment IN ('followed', 'deviated', 'unassessable')),
  assessment_provenance text NOT NULL DEFAULT 'trader'
    CHECK (assessment_provenance IN ('trader', 'deterministic')),
  note text,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT improvement_occurrences_focus_trade_key UNIQUE (focus_id, trade_id),
  CONSTRAINT improvement_occurrences_note_length CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE INDEX IF NOT EXISTS improvement_occurrences_user_focus_idx
  ON public.improvement_occurrences(user_id, focus_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS improvement_occurrences_trade_idx
  ON public.improvement_occurrences(user_id, trade_id);
CREATE UNIQUE INDEX IF NOT EXISTS improvement_focuses_id_user_key
  ON public.improvement_focuses(id, user_id);

ALTER TABLE public.improvement_focuses
  ADD CONSTRAINT improvement_focuses_standard_owner_fkey
    FOREIGN KEY (standard_version_id, user_id)
    REFERENCES public.playbook_standard_versions(id, user_id);
ALTER TABLE public.improvement_occurrences
  ADD CONSTRAINT improvement_occurrences_focus_owner_fkey
    FOREIGN KEY (focus_id, user_id)
    REFERENCES public.improvement_focuses(id, user_id),
  ADD CONSTRAINT improvement_occurrences_trade_owner_fkey
    FOREIGN KEY (trade_id, user_id)
    REFERENCES public.trades(id, user_id);

ALTER TABLE public.improvement_focuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "improvement_focuses_select_own"
  ON public.improvement_focuses FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "improvement_focuses_insert_own"
  ON public.improvement_focuses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      standard_version_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.playbook_standard_versions version
        WHERE version.id = standard_version_id AND version.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "improvement_focuses_update_own"
  ON public.improvement_focuses FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      standard_version_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.playbook_standard_versions version
        WHERE version.id = standard_version_id AND version.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "improvement_occurrences_select_own"
  ON public.improvement_occurrences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "improvement_occurrences_insert_own"
  ON public.improvement_occurrences FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND assessment_provenance = 'trader'
    AND EXISTS (
      SELECT 1 FROM public.improvement_focuses f
      WHERE f.id = focus_id AND f.user_id = auth.uid() AND f.state = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.trades t
      WHERE t.id = trade_id AND t.user_id = auth.uid() AND t.is_paper = false
    )
  );
CREATE POLICY "improvement_occurrences_update_own"
  ON public.improvement_occurrences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND assessment_provenance = 'trader'
    AND EXISTS (
      SELECT 1 FROM public.improvement_focuses f
      WHERE f.id = focus_id AND f.user_id = auth.uid() AND f.state = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.trades t
      WHERE t.id = trade_id AND t.user_id = auth.uid() AND t.is_paper = false
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.improvement_focuses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.improvement_occurrences TO authenticated;
GRANT ALL ON public.improvement_focuses TO service_role;
GRANT ALL ON public.improvement_occurrences TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_improvement_focus_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'active' OR NEW.closed_at IS NOT NULL
       OR NEW.resolution IS NOT NULL OR NEW.closure_note IS NOT NULL THEN
      RAISE EXCEPTION 'A new improvement focus must begin active and unresolved';
    END IF;
    -- Activation is a server-established boundary. Client clocks and backdated
    -- payloads cannot make historical trades count as prospective evidence.
    NEW.activated_at := now();
    NEW.created_at := now();
  ELSE
    IF OLD.state <> 'active' THEN
      RAISE EXCEPTION 'Closed improvement focus history is immutable';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.behavior IS DISTINCT FROM OLD.behavior
       OR NEW.trigger_situation IS DISTINCT FROM OLD.trigger_situation
       OR NEW.intended_behavior IS DISTINCT FROM OLD.intended_behavior
       OR NEW.grounding IS DISTINCT FROM OLD.grounding
       OR NEW.relevant_evidence_definition IS DISTINCT FROM OLD.relevant_evidence_definition
       OR NEW.source_discovery_id IS DISTINCT FROM OLD.source_discovery_id
       OR NEW.source_trade_ids IS DISTINCT FROM OLD.source_trade_ids
       OR NEW.standard_version_id IS DISTINCT FROM OLD.standard_version_id
       OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'An activated improvement focus definition cannot be rewritten';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.source_trade_ids) AS source(source_trade_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.trades trade
      WHERE trade.id = source.source_trade_id
        AND trade.user_id = NEW.user_id
        AND trade.is_paper = false
    )
  ) THEN
    RAISE EXCEPTION 'Improvement focus source evidence must be owned real trades';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_prospective_improvement_occurrence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  focus_activation timestamptz;
  focus_state text;
  trade_created_at timestamptz;
  journal_date date;
  paper_trade boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.focus_id IS DISTINCT FROM OLD.focus_id
       OR NEW.trade_id IS DISTINCT FROM OLD.trade_id
       OR NEW.assessment_provenance IS DISTINCT FROM OLD.assessment_provenance
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'An improvement occurrence cannot be reassigned or backdated';
    END IF;
  END IF;
  NEW.assessed_at := now();

  SELECT focus.activated_at, focus.state
  INTO focus_activation, focus_state
  FROM public.improvement_focuses focus
  WHERE focus.id = NEW.focus_id AND focus.user_id = NEW.user_id;

  SELECT trade.created_at, trade.trade_date::date, trade.is_paper
  INTO trade_created_at, journal_date, paper_trade
  FROM public.trades trade
  WHERE trade.id = NEW.trade_id AND trade.user_id = NEW.user_id;

  IF focus_activation IS NULL OR trade_created_at IS NULL THEN
    RAISE EXCEPTION 'Improvement occurrence ownership could not be established';
  END IF;
  IF focus_state <> 'active' THEN
    RAISE EXCEPTION 'Only an active improvement focus can receive assessments';
  END IF;
  IF paper_trade OR trade_created_at < focus_activation
     OR journal_date < (focus_activation AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Only future real-trade occurrences can assess this focus';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_improvement_focuses_integrity ON public.improvement_focuses;
CREATE TRIGGER trg_improvement_focuses_integrity
  BEFORE INSERT OR UPDATE ON public.improvement_focuses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_improvement_focus_integrity();
DROP TRIGGER IF EXISTS trg_improvement_occurrences_prospective ON public.improvement_occurrences;
CREATE TRIGGER trg_improvement_occurrences_prospective
  BEFORE INSERT OR UPDATE ON public.improvement_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.enforce_prospective_improvement_occurrence();

DROP TRIGGER IF EXISTS trg_improvement_focuses_updated_at ON public.improvement_focuses;
CREATE TRIGGER trg_improvement_focuses_updated_at
  BEFORE UPDATE ON public.improvement_focuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_improvement_occurrences_updated_at ON public.improvement_occurrences;
CREATE TRIGGER trg_improvement_occurrences_updated_at
  BEFORE UPDATE ON public.improvement_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bridge the retired sticky-note product into Playbook as ordinary material.
-- The original row remains, so color/pin/archive/kind metadata is not lost and
-- repeatable migration replay cannot duplicate content.
ALTER TABLE public.notebook_entries
  ADD COLUMN IF NOT EXISTS legacy_sticky_note_id uuid
    REFERENCES public.sticky_notes(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notebook_entries_legacy_sticky_note_key
  ON public.notebook_entries(legacy_sticky_note_id)
  WHERE legacy_sticky_note_id IS NOT NULL;

INSERT INTO public.notebook_entries (
  user_id,
  title,
  content,
  tags,
  note_type,
  created_at,
  updated_at,
  legacy_sticky_note_id
)
SELECT
  note.user_id,
  note.title,
  note.content,
  ARRAY['legacy-note']::text[],
  'general',
  note.created_at,
  note.updated_at,
  note.id
FROM public.sticky_notes note
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notebook_entries entry
  WHERE entry.legacy_sticky_note_id = note.id
);

-- The legacy global guardrail is copied prospectively to the existing default
-- trade account only when that account has no account-specific value. The old
-- preference column is retained as legacy evidence and is no longer consumed by
-- the application, avoiding a destructive reinterpretation.
UPDATE public.trading_accounts
SET is_active = false
WHERE status = 'archived' AND is_active = true;

ALTER TABLE public.trading_accounts
  DROP CONSTRAINT IF EXISTS trading_accounts_default_must_be_available_check,
  ADD CONSTRAINT trading_accounts_default_must_be_available_check
    CHECK (NOT is_active OR status = 'active');

UPDATE public.trading_accounts account
SET max_trades_per_day = preference.max_trades_per_day
FROM public.trading_preferences preference
WHERE account.user_id = preference.user_id
  AND account.is_active = true
  AND account.status = 'active'
  AND account.max_trades_per_day IS NULL
  AND preference.max_trades_per_day IS NOT NULL;

COMMENT ON COLUMN public.trading_preferences.max_trades_per_day IS
  'Legacy global value retained for portability; account guardrails now use trading_accounts.max_trades_per_day.';
COMMENT ON COLUMN public.trading_accounts.is_active IS
  'Default trade account for new captures. This is distinct from the per-device Account View filter.';

COMMIT;
