BEGIN;

-- Invitation coordinates are immutable and lifecycle transitions are operation-specific.
ALTER TABLE public.community_group_invitations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.community_group_invitations
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

ALTER TABLE public.community_group_invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '30 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_community_invitation_coordinates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW.id, NEW.group_id, NEW.inviter_id, NEW.invitee_id, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.group_id, OLD.inviter_id, OLD.invitee_id, OLD.created_at, OLD.expires_at)
  THEN
    RAISE EXCEPTION 'Invitation authorization coordinates are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cgi_enforce_coordinates ON public.community_group_invitations;
CREATE TRIGGER cgi_enforce_coordinates
  BEFORE UPDATE ON public.community_group_invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_community_invitation_coordinates();

DROP POLICY IF EXISTS "cgi_update_invitee_or_inviter" ON public.community_group_invitations;
REVOKE INSERT, UPDATE, DELETE ON public.community_group_invitations FROM anon, authenticated;
GRANT SELECT ON public.community_group_invitations TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_community_group_invitation(
  p_invitation_id UUID,
  p_accept BOOLEAN
)
RETURNS TABLE(group_id UUID, inviter_id UUID, invitation_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invitation public.community_group_invitations%ROWTYPE;
  v_group_owner UUID;
  v_status TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.community_group_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invitation.invitee_id <> v_caller THEN
    RAISE EXCEPTION 'Not your invitation' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending' USING ERRCODE = 'P0001';
  END IF;
  IF v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id
  INTO v_group_owner
  FROM public.community_groups
  WHERE id = v_invitation.group_id;

  IF v_group_owner IS NULL OR v_group_owner <> v_invitation.inviter_id THEN
    RAISE EXCEPTION 'Invitation is not authorized for this group' USING ERRCODE = '42501';
  END IF;

  v_status := CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END;

  UPDATE public.community_group_invitations
  SET status = v_status, responded_at = now()
  WHERE id = v_invitation.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is no longer pending' USING ERRCODE = 'P0001';
  END IF;

  IF p_accept THEN
    INSERT INTO public.community_group_members(group_id, user_id, role)
    VALUES (v_invitation.group_id, v_caller, 'member')
    ON CONFLICT ON CONSTRAINT community_group_members_pkey DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_invitation.group_id, v_invitation.inviter_id, v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_community_group_invitation(p_invitation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invitation public.community_group_invitations%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.community_group_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invitation.inviter_id <> v_caller OR NOT EXISTS (
    SELECT 1
    FROM public.community_groups g
    WHERE g.id = v_invitation.group_id
      AND g.owner_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Not authorized to cancel this invitation' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.community_group_invitations
  SET status = 'cancelled', responded_at = now()
  WHERE id = v_invitation.id
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_community_invitation_coordinates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_community_group_invitation(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_community_group_invitation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_community_group_invitation(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_community_group_invitation(UUID) TO authenticated;

-- Comment authors may change content, never the thread coordinates.
CREATE OR REPLACE FUNCTION public.enforce_community_comment_coordinates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.user_id, NEW.group_id, NEW.trade_id, NEW.parent_id, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.user_id, OLD.group_id, OLD.trade_id, OLD.parent_id, OLD.created_at)
    THEN
      RAISE EXCEPTION 'Comment thread coordinates are immutable'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.community_trade_shares s
      WHERE s.trade_id = NEW.trade_id
        AND s.group_id = NEW.group_id
    ) THEN
      RAISE EXCEPTION 'Trade is not shared to this group'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.community_trade_comments parent
      WHERE parent.id = NEW.parent_id
        AND parent.group_id = NEW.group_id
        AND parent.trade_id = NEW.trade_id
    ) THEN
      RAISE EXCEPTION 'Parent comment does not belong to this thread'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ctc_enforce_coordinates ON public.community_trade_comments;
CREATE TRIGGER ctc_enforce_coordinates
  BEFORE INSERT OR UPDATE ON public.community_trade_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_community_comment_coordinates();

DROP POLICY IF EXISTS "ctc_insert_group_member_self" ON public.community_trade_comments;
CREATE POLICY "ctc_insert_group_member_self" ON public.community_trade_comments
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_group_members m
    WHERE m.group_id = community_trade_comments.group_id
      AND m.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.community_trade_shares s
    WHERE s.trade_id = community_trade_comments.trade_id
      AND s.group_id = community_trade_comments.group_id
  )
);

DROP POLICY IF EXISTS "ctc_update_own" ON public.community_trade_comments;
CREATE POLICY "ctc_update_own" ON public.community_trade_comments
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_group_members m
    WHERE m.group_id = community_trade_comments.group_id
      AND m.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.community_trade_shares s
    WHERE s.trade_id = community_trade_comments.trade_id
      AND s.group_id = community_trade_comments.group_id
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_group_members m
    WHERE m.group_id = community_trade_comments.group_id
      AND m.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.community_trade_shares s
    WHERE s.trade_id = community_trade_comments.trade_id
      AND s.group_id = community_trade_comments.group_id
  )
);

REVOKE UPDATE ON public.community_trade_comments FROM anon;
REVOKE ALL ON FUNCTION public.enforce_community_comment_coordinates() FROM PUBLIC, anon, authenticated;

-- Durable purge state. A valid claim is the start of irreversible deletion work.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_purge_state TEXT NOT NULL DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS deletion_purge_claim_token UUID,
  ADD COLUMN IF NOT EXISTS deletion_purge_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_purge_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deletion_purge_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_purge_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_purge_last_error_code TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_deletion_purge_state_check,
  ADD CONSTRAINT profiles_deletion_purge_state_check
    CHECK (deletion_purge_state IN ('unclaimed', 'processing', 'deleting', 'retryable_failure')),
  DROP CONSTRAINT IF EXISTS profiles_deletion_purge_attempt_count_check,
  ADD CONSTRAINT profiles_deletion_purge_attempt_count_check
    CHECK (deletion_purge_attempt_count >= 0),
  DROP CONSTRAINT IF EXISTS profiles_deletion_purge_error_code_check,
  ADD CONSTRAINT profiles_deletion_purge_error_code_check
    CHECK (deletion_purge_last_error_code IS NULL OR length(deletion_purge_last_error_code) <= 64);

CREATE INDEX IF NOT EXISTS profiles_deletion_purge_due_idx
  ON public.profiles (deletion_purge_next_attempt_at, deletion_scheduled_for)
  WHERE deletion_requested_at IS NOT NULL
    AND deletion_scheduled_for IS NOT NULL
    AND deletion_cancelled_at IS NULL;

CREATE OR REPLACE FUNCTION public.protect_profile_deletion_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND ROW(
       NEW.deletion_requested_at,
       NEW.deletion_scheduled_for,
       NEW.deletion_cancelled_at,
       NEW.deletion_purge_state,
       NEW.deletion_purge_claim_token,
       NEW.deletion_purge_claimed_at,
       NEW.deletion_purge_attempt_count,
       NEW.deletion_purge_last_attempt_at,
       NEW.deletion_purge_next_attempt_at,
       NEW.deletion_purge_last_error_code
     ) IS DISTINCT FROM ROW(
       OLD.deletion_requested_at,
       OLD.deletion_scheduled_for,
       OLD.deletion_cancelled_at,
       OLD.deletion_purge_state,
       OLD.deletion_purge_claim_token,
       OLD.deletion_purge_claimed_at,
       OLD.deletion_purge_attempt_count,
       OLD.deletion_purge_last_attempt_at,
       OLD.deletion_purge_next_attempt_at,
       OLD.deletion_purge_last_error_code
     )
  THEN
    RAISE EXCEPTION 'Use the account deletion operations to change deletion state'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_deletion_state ON public.profiles;
CREATE TRIGGER profiles_protect_deletion_state
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_deletion_state();

CREATE OR REPLACE FUNCTION public.schedule_account_deletion()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_state TEXT;
  v_scheduled_for TIMESTAMPTZ := now() + INTERVAL '15 days';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT deletion_purge_state
  INTO v_state
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_state IN ('processing', 'deleting') THEN
    RAISE EXCEPTION 'Account deletion is already being processed' USING ERRCODE = '55000';
  END IF;

  UPDATE public.profiles
  SET deletion_requested_at = now(),
      deletion_scheduled_for = v_scheduled_for,
      deletion_cancelled_at = NULL,
      deletion_purge_state = 'unclaimed',
      deletion_purge_claim_token = NULL,
      deletion_purge_claimed_at = NULL,
      deletion_purge_attempt_count = 0,
      deletion_purge_last_attempt_at = NULL,
      deletion_purge_next_attempt_at = NULL,
      deletion_purge_last_error_code = NULL
  WHERE id = v_user_id;

  RETURN v_scheduled_for;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_state TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT deletion_purge_state
  INTO v_state
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_state = 'deleting' THEN
    RAISE EXCEPTION 'Permanent deletion is already being processed and can no longer be cancelled'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.profiles
  SET deletion_requested_at = NULL,
      deletion_scheduled_for = NULL,
      deletion_cancelled_at = now(),
      deletion_purge_state = 'unclaimed',
      deletion_purge_claim_token = NULL,
      deletion_purge_claimed_at = NULL,
      deletion_purge_attempt_count = 0,
      deletion_purge_last_attempt_at = NULL,
      deletion_purge_next_attempt_at = NULL,
      deletion_purge_last_error_code = NULL
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_account_purges(
  p_limit INTEGER DEFAULT 25,
  p_lease_seconds INTEGER DEFAULT 900
)
RETURNS TABLE(user_id UUID, claim_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.deletion_requested_at IS NOT NULL
      AND p.deletion_scheduled_for IS NOT NULL
      AND p.deletion_cancelled_at IS NULL
      AND p.deletion_scheduled_for <= now()
      AND (
        (
          p.deletion_purge_state IN ('unclaimed', 'retryable_failure')
          AND (p.deletion_purge_next_attempt_at IS NULL OR p.deletion_purge_next_attempt_at <= now())
        )
        OR (
          p.deletion_purge_state = 'processing'
          AND p.deletion_purge_claimed_at < now() - make_interval(secs => greatest(60, p_lease_seconds))
        )
        OR (
          p.deletion_purge_state = 'deleting'
          AND p.deletion_purge_claimed_at < now() - INTERVAL '24 hours'
        )
      )
    ORDER BY COALESCE(p.deletion_purge_next_attempt_at, p.deletion_scheduled_for),
             p.deletion_scheduled_for,
             p.id
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(p_limit, 1), 100)
  ), claimed AS (
    UPDATE public.profiles p
    SET deletion_purge_state = 'processing',
        deletion_purge_claim_token = gen_random_uuid(),
        deletion_purge_claimed_at = now(),
        deletion_purge_attempt_count = p.deletion_purge_attempt_count + 1,
        deletion_purge_last_attempt_at = now(),
        deletion_purge_next_attempt_at = NULL,
        deletion_purge_last_error_code = NULL
    FROM candidates c
    WHERE p.id = c.id
    RETURNING p.id, p.deletion_purge_claim_token
  )
  SELECT claimed.id, claimed.deletion_purge_claim_token
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_account_purge_deletion(
  p_user_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.profiles
  SET deletion_purge_state = 'deleting'
  WHERE id = p_user_id
    AND deletion_purge_state = 'processing'
    AND deletion_purge_claim_token = p_claim_token
    AND deletion_requested_at IS NOT NULL
    AND deletion_scheduled_for IS NOT NULL
    AND deletion_scheduled_for <= now()
    AND deletion_cancelled_at IS NULL;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_account_purge_claim(
  p_user_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.deletion_purge_state = 'deleting'
      AND p.deletion_purge_claim_token = p_claim_token
      AND p.deletion_requested_at IS NOT NULL
      AND p.deletion_scheduled_for IS NOT NULL
      AND p.deletion_scheduled_for <= now()
      AND p.deletion_cancelled_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_account_purge_failure(
  p_user_id UUID,
  p_claim_token UUID,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE public.profiles
  SET deletion_purge_state = 'retryable_failure',
      deletion_purge_claim_token = NULL,
      deletion_purge_claimed_at = NULL,
      deletion_purge_next_attempt_at = now() + make_interval(
        secs => least(
          86400,
          300 * power(2::numeric, least(greatest(deletion_purge_attempt_count - 1, 0), 8))::integer
        )
      ),
      deletion_purge_last_error_code = left(
        regexp_replace(lower(COALESCE(p_error_code, 'unknown')), '[^a-z0-9_:-]', '', 'g'),
        64
      )
  WHERE id = p_user_id
    AND deletion_purge_state IN ('processing', 'deleting')
    AND deletion_purge_claim_token = p_claim_token;

  v_updated := FOUND;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_deletion_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_account_deletion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

REVOKE ALL ON FUNCTION public.claim_due_account_purges(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_account_purge_deletion(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_account_purge_claim(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_account_purge_failure(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_account_purges(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_account_purge_deletion(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_account_purge_claim(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_account_purge_failure(UUID, UUID, TEXT) TO service_role;

-- Screenshot metadata is bound permanently to its owner, trade and storage object.
CREATE OR REPLACE FUNCTION public.enforce_trade_screenshot_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND ROW(NEW.id, NEW.user_id, NEW.trade_id, NEW.storage_path, NEW.created_at)
         IS DISTINCT FROM
         ROW(OLD.id, OLD.user_id, OLD.trade_id, OLD.storage_path, OLD.created_at)
  THEN
    RAISE EXCEPTION 'Screenshot authorization coordinates are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF split_part(NEW.storage_path, '/', 1) <> NEW.user_id::TEXT
     OR split_part(NEW.storage_path, '/', 2) <> NEW.trade_id::TEXT
     OR split_part(NEW.storage_path, '/', 3) = ''
     OR NEW.storage_path ~ '(^|/)\.{1,2}(/|$)'
     OR position(chr(92) IN NEW.storage_path) > 0
     OR lower(NEW.storage_path) ~ '%(25)*(2f|5c|2e)'
     OR NOT EXISTS (
       SELECT 1 FROM public.trades t
       WHERE t.id = NEW.trade_id
         AND t.user_id = NEW.user_id
     )
  THEN
    RAISE EXCEPTION 'Screenshot path does not match its owning trade'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trade_screenshots_enforce_integrity ON public.trade_screenshots;
CREATE TRIGGER trade_screenshots_enforce_integrity
  BEFORE INSERT OR UPDATE ON public.trade_screenshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trade_screenshot_integrity();

DROP POLICY IF EXISTS "screenshots_insert_own" ON public.trade_screenshots;
CREATE POLICY "screenshots_insert_own" ON public.trade_screenshots
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND split_part(storage_path, '/', 1) = auth.uid()::TEXT
  AND split_part(storage_path, '/', 2) = trade_id::TEXT
  AND EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = trade_screenshots.trade_id
      AND t.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deletion_purge_state NOT IN ('processing', 'deleting')
  )
);

DROP POLICY IF EXISTS "screenshots_update_own" ON public.trade_screenshots;
CREATE POLICY "screenshots_update_own" ON public.trade_screenshots
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = trade_screenshots.trade_id
      AND t.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND split_part(storage_path, '/', 1) = auth.uid()::TEXT
  AND split_part(storage_path, '/', 2) = trade_id::TEXT
  AND EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = trade_screenshots.trade_id
      AND t.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deletion_purge_state NOT IN ('processing', 'deleting')
  )
);

REVOKE UPDATE ON public.trade_screenshots FROM anon;
REVOKE ALL ON FUNCTION public.enforce_trade_screenshot_integrity() FROM PUBLIC, anon, authenticated;

-- Prevent new objects from racing a claimed purge. Existing owner-folder privacy remains unchanged.
DROP POLICY IF EXISTS "trade_screenshots_select_own" ON storage.objects;
DROP POLICY IF EXISTS "trade_screenshots_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "trade_screenshots_update_own" ON storage.objects;
DROP POLICY IF EXISTS "trade_screenshots_delete_own" ON storage.objects;

CREATE POLICY "trade_screenshots_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trade-screenshots'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

CREATE POLICY "trade_screenshots_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'trade-screenshots'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
  AND name !~ '(^|/)\.{1,2}(/|$)'
  AND position(chr(92) IN name) = 0
  AND lower(name) !~ '%(25)*(2f|5c|2e)'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deletion_purge_state NOT IN ('processing', 'deleting')
  )
);

CREATE POLICY "trade_screenshots_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'trade-screenshots'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'trade-screenshots'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
  AND name !~ '(^|/)\.{1,2}(/|$)'
  AND position(chr(92) IN name) = 0
  AND lower(name) !~ '%(25)*(2f|5c|2e)'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deletion_purge_state NOT IN ('processing', 'deleting')
  )
);

CREATE POLICY "trade_screenshots_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'trade-screenshots'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

COMMIT;
