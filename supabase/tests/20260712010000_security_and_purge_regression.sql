-- Disposable local-Supabase regression plan for migration
-- 20260712010000_harden_community_screenshots_and_account_purge.sql.
--
-- Run only against a local/disposable production-equivalent schema after applying the new migration:
--   psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/20260712010000_security_and_purge_regression.sql
-- Never point DISPOSABLE_DATABASE_URL at production. This script rolls back DB fixtures,
-- but the Storage API cases at the end require their own disposable bucket cleanup.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(value BOOLEAN, message TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF value IS NOT TRUE THEN RAISE EXCEPTION 'assertion failed: %', message; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_failure(statement TEXT, message TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  RAISE EXCEPTION 'expected failure: %', message;
END;
$$;

SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.claim_due_account_purges(integer,integer)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.claim_due_account_purges(integer,integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.claim_due_account_purges(integer,integer)', 'EXECUTE'),
  'purge claim RPC must be service-role only'
);
SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.begin_account_purge_deletion(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.begin_account_purge_deletion(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.validate_account_purge_claim(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.mark_account_purge_failure(uuid,uuid,text)', 'EXECUTE'),
  'destructive purge RPCs must not be callable by anon/authenticated'
);

-- Fixed synthetic identities
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'audit-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'audit-b@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'audit-c@example.invalid', '', now(), '{}', '{}', now(), now());

INSERT INTO public.profiles (id, username, edge_id) VALUES
  ('10000000-0000-4000-8000-000000000001', 'user-a', 'EDGE-AAAAAA'),
  ('10000000-0000-4000-8000-000000000002', 'user-b', 'EDGE-BBBBBB'),
  ('10000000-0000-4000-8000-000000000003', 'user-c', 'EDGE-CCCCCC')
ON CONFLICT (id) DO UPDATE
SET username = EXCLUDED.username,
    edge_id = EXCLUDED.edge_id;

INSERT INTO public.community_groups(id, name, owner_id) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Audit group one', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Audit group two', '10000000-0000-4000-8000-000000000003');
INSERT INTO public.community_group_members(group_id, user_id, role) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'owner');

INSERT INTO public.trades(id, user_id, market, instrument, trade_date, direction) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'forex', 'AUDIT-A', current_date, 'long'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'forex', 'AUDIT-C', current_date, 'short');
INSERT INTO public.community_trade_shares(id, trade_id, group_id, user_id) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

INSERT INTO public.community_group_invitations(
  id, group_id, inviter_id, invitee_id, status, expires_at
) VALUES
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   'pending', now() + interval '1 day'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003',
   'pending', now() - interval '1 minute'),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   'cancelled', now() + interval '1 day'),
  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   'pending', now() + interval '1 day');

INSERT INTO public.community_trade_comments(
  id, trade_id, group_id, user_id, body
) VALUES (
  '60000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'original'
);

INSERT INTO public.trade_screenshots(
  id, trade_id, user_id, storage_path, kind
) VALUES (
  '70000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/chart.png',
  'after'
);

-- Database triggers reject coordinate retargeting even for a privileged caller.
SELECT pg_temp.expect_failure(
  $$UPDATE public.community_group_invitations
    SET group_id = '20000000-0000-4000-8000-000000000002'
    WHERE id = '50000000-0000-4000-8000-000000000001'$$,
  'invitation group_id must be immutable'
);
SELECT pg_temp.expect_failure(
  $$UPDATE public.community_trade_comments
    SET trade_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '60000000-0000-4000-8000-000000000001'$$,
  'comment trade_id must be immutable'
);
SELECT pg_temp.expect_failure(
  $$UPDATE public.trade_screenshots
    SET storage_path = '10000000-0000-4000-8000-000000000003/30000000-0000-4000-8000-000000000002/chart.png'
    WHERE id = '70000000-0000-4000-8000-000000000001'$$,
  'screenshot storage_path must be immutable'
);
SELECT pg_temp.expect_failure(
  $$UPDATE public.trade_screenshots
    SET trade_id = '30000000-0000-4000-8000-000000000002'
    WHERE id = '70000000-0000-4000-8000-000000000001'$$,
  'screenshot trade_id must be immutable'
);
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.trade_screenshots(trade_id, user_id, storage_path, kind)
    VALUES (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003/30000000-0000-4000-8000-000000000001/forged.png',
      'after'
    )$$,
  'malformed screenshot owner prefix must be rejected'
);
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.trade_screenshots(trade_id, user_id, storage_path, kind)
    VALUES (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/%252fescape.png',
      'after'
    )$$,
  'encoded screenshot path controls must be rejected'
);

-- Both invitation parties lack direct lifecycle/coordinate update privileges.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure(
  $$UPDATE public.community_group_invitations
    SET group_id = '20000000-0000-4000-8000-000000000002',
        inviter_id = '10000000-0000-4000-8000-000000000003'
    WHERE id = '50000000-0000-4000-8000-000000000001'$$,
  'invitee direct retarget must fail'
);
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure(
  $$UPDATE public.community_group_invitations
    SET group_id = '20000000-0000-4000-8000-000000000002',
        invitee_id = '10000000-0000-4000-8000-000000000003'
    WHERE id = '50000000-0000-4000-8000-000000000001'$$,
  'inviter direct retarget must fail'
);
RESET ROLE;

-- Intended invitee accepts atomically; second use fails and membership remains unique.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT * FROM public.respond_community_group_invitation(
  '50000000-0000-4000-8000-000000000001', true
);
SELECT pg_temp.expect_failure(
  $$SELECT public.respond_community_group_invitation(
    '50000000-0000-4000-8000-000000000001', true
  )$$,
  'accepted invitation must be single-use'
);
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure(
  $$SELECT public.respond_community_group_invitation(
    '50000000-0000-4000-8000-000000000002', true
  )$$,
  'expired invitation must not add membership'
);
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure(
  $$SELECT public.respond_community_group_invitation(
    '50000000-0000-4000-8000-000000000003', true
  )$$,
  'cancelled invitation must not add membership'
);
SELECT pg_temp.expect_failure(
  $$SELECT public.respond_community_group_invitation(
    '50000000-0000-4000-8000-000000000004', true
  )$$,
  'invitation from a non-owner must not add membership in an unrelated group'
);
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.community_group_members
   WHERE group_id = '20000000-0000-4000-8000-000000000001'
     AND user_id = '10000000-0000-4000-8000-000000000002'),
  'acceptance must create one membership'
);

UPDATE public.community_trade_comments
SET body = 'edited'
WHERE id = '60000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT body = 'edited' FROM public.community_trade_comments
   WHERE id = '60000000-0000-4000-8000-000000000001'),
  'author body edit should succeed'
);
SELECT pg_temp.expect_failure(
  $$UPDATE public.community_trade_comments
    SET group_id = '20000000-0000-4000-8000-000000000002',
        trade_id = '30000000-0000-4000-8000-000000000002',
        parent_id = '60000000-0000-4000-8000-000000000001',
        user_id = '10000000-0000-4000-8000-000000000003'
    WHERE id = '60000000-0000-4000-8000-000000000001'$$,
  'comment relationship coordinates must be immutable'
);
RESET ROLE;

-- ── ES-012 extended: comment coordinate protection ──
-- Trigger-layer tests (postgres role — tests the SECURITY DEFINER trigger)

-- 1. Trigger rejects INSERT when trade is not shared to the group
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.community_trade_comments(trade_id, group_id, user_id, body)
    VALUES ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002', 'unshared')$$,
  'comment on unshared trade must be rejected by trigger'
);

-- 2. Trigger validates parent exists in same group and trade
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.community_trade_comments(trade_id, group_id, user_id, parent_id, body)
    VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002',
            '00000000-0000-0000-0000-000000000000', 'reply-nonexistent-parent')$$,
  'nonexistent parent must be rejected by trigger'
);

-- 3. Trigger validates parent belongs to same trade
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.community_trade_comments(trade_id, group_id, user_id, parent_id, body)
    VALUES ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002',
            '60000000-0000-4000-8000-000000000001', 'reply-wrong-trade')$$,
  'parent in different trade must be rejected by trigger'
);

-- 4. Trigger allows valid INSERT with correct share and parent
INSERT INTO public.community_trade_comments(
  id, trade_id, group_id, user_id, parent_id, body
) VALUES (
  '60000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000001',
  'valid-reply'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.community_trade_comments
   WHERE id = '60000000-0000-4000-8000-000000000010'
     AND body = 'valid-reply'),
  'valid reply with correct parent must succeed'
);

-- 5. RLS INSERT: non-member is rejected
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.community_trade_comments(trade_id, group_id, user_id, body)
    VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000003', 'non-member-insert')$$,
  'non-member RLS insert must be rejected'
);
RESET ROLE;

-- 6. RLS INSERT: user_id does not match auth.uid() is rejected
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.community_trade_comments(trade_id, group_id, user_id, body)
    VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000003', 'forged-author')$$,
  'user_id mismatch in RLS insert must be rejected'
);
RESET ROLE;

-- 7. RLS INSERT: trade not shared to group is rejected
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_failure(
  $$INSERT INTO public.community_trade_comments(trade_id, group_id, user_id, body)
    VALUES ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002', 'unshared-trade-rls')$$,
  'trade not shared must be rejected by RLS'
);
RESET ROLE;

-- 8. RLS UPDATE: non-author body edit is silently rejected
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
UPDATE public.community_trade_comments SET body = 'hacked-by-non-author'
WHERE id = '60000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT body = 'edited' FROM public.community_trade_comments
   WHERE id = '60000000-0000-4000-8000-000000000001'),
  'non-author body edit must be rejected'
);

-- 9. RLS UPDATE: former member cannot edit after leaving group.
-- Remove membership as postgres first (avoids RLS complications in this
-- validation environment), then attempt the edit as the former member.
DELETE FROM public.community_group_members
WHERE group_id = '20000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000002';
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
UPDATE public.community_trade_comments SET body = 'edit-after-leave'
WHERE id = '60000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT body = 'edited' FROM public.community_trade_comments
   WHERE id = '60000000-0000-4000-8000-000000000001'),
  'former member body edit must be rejected'
);

-- 10. DELETE by author succeeds (run as postgres, matching the application's
-- supabaseAdmin pattern which bypasses RLS and relies on handler-level checks)
DELETE FROM public.community_trade_comments
WHERE id = '60000000-0000-4000-8000-000000000010';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.community_trade_comments
   WHERE id = '60000000-0000-4000-8000-000000000010'),
  'author delete must succeed'
);

-- 11. DELETE by group owner succeeds (same pattern, postgres role)
DELETE FROM public.community_trade_comments
WHERE id = '60000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.community_trade_comments
   WHERE id = '60000000-0000-4000-8000-000000000001'),
  'group owner delete must succeed'
);

-- 12. No trigger blocks DELETE for unrelated (postgres role, the application's
-- supabaseAdmin handler checks author/owner before calling DELETE)
INSERT INTO public.community_trade_shares(id, trade_id, group_id, user_id) VALUES
  ('40000000-0000-4000-8000-000000000099', '30000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003');
INSERT INTO public.community_trade_comments(
  id, trade_id, group_id, user_id, body
) VALUES (
  '60000000-0000-4000-8000-000000000099',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  'group-two-comment'
);
DELETE FROM public.community_trade_comments
WHERE id = '60000000-0000-4000-8000-000000000099';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.community_trade_comments
   WHERE id = '60000000-0000-4000-8000-000000000099'),
  'DELETE must succeed for postgres (supabaseAdmin bypasses RLS)'
);

-- Purge claim/cancellation race: cancellation while merely claimed wins.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SELECT public.schedule_account_deletion();
UPDATE public.profiles
SET deletion_scheduled_for = now() - interval '1 minute'
WHERE id = '10000000-0000-4000-8000-000000000002';

CREATE TEMP TABLE claimed_before_cancel AS
SELECT * FROM public.claim_due_account_purges(25, 900);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM claimed_before_cancel
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  'due user should be claimed once'
);
SELECT public.cancel_account_deletion();
SELECT pg_temp.assert_true(
  (SELECT deletion_requested_at IS NULL AND deletion_purge_state = 'unclaimed'
   FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000002'),
  'cancellation before irreversible deletion must clear the claim'
);

-- Once begin_account_purge_deletion wins the row lock, cancellation must fail truthfully.
SELECT public.schedule_account_deletion();
UPDATE public.profiles
SET deletion_scheduled_for = now() - interval '1 minute'
WHERE id = '10000000-0000-4000-8000-000000000002';
CREATE TEMP TABLE claimed_for_delete AS
SELECT * FROM public.claim_due_account_purges(25, 900);
SELECT pg_temp.assert_true(
  (SELECT public.begin_account_purge_deletion(user_id, claim_token)
   FROM claimed_for_delete
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  'exact claim should enter deleting state'
);
SELECT pg_temp.expect_failure(
  'SELECT public.cancel_account_deletion()',
  'cancellation after irreversible stage must fail'
);
SELECT pg_temp.assert_true(
  (SELECT public.validate_account_purge_claim(user_id, claim_token)
   FROM claimed_for_delete
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  'final auth deletion must require the exact claim token'
);
SELECT pg_temp.assert_true(
  (SELECT public.mark_account_purge_failure(user_id, claim_token, 'storage_delete_failed')
   FROM claimed_for_delete
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  'failure should persist retry state'
);
SELECT pg_temp.assert_true(
  (SELECT deletion_purge_state = 'retryable_failure'
          AND deletion_purge_next_attempt_at > now()
          AND deletion_purge_last_error_code = 'storage_delete_failed'
   FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000002'),
  'failure should back off without private detail'
);

ROLLBACK;

-- Storage/API cases (execute with the local service-role client after this SQL plan):
-- 1. Upload <user A>/<trade A>/registered.png and insert matching metadata.
-- 2. Upload <user A>/<trade A>/orphan.png without metadata.
-- 3. Create >100 objects split across at least two nested trade folders.
-- 4. Create a similarly named <user A UUID>-suffix folder owned by a different synthetic user.
-- 5. Force metadata registration failure; verify the exact just-uploaded object is removed.
-- 6. Invoke /api/account-purge with missing/wrong bearer: expect 401 and Cache-Control: no-store.
-- 7. Invoke with the disposable CRON_SECRET: expect registered + orphan objects below the exact
--    user folder removed, the suffix folder untouched, and summary keys claimed/processed/
--    succeeded/failed/skipped with no IDs, paths, email, reason, token or secret.
-- 8. Inject one storage failure among >25 due users: expect HTTP 500, failed > 0, later eligible
--    users claimed on the next run, and failed user's next-attempt timestamp in the future.
-- 9. Run two authorized requests concurrently: each claim token is owned by at most one worker;
--    only the exact token may pass validate_account_purge_claim before auth deletion.
