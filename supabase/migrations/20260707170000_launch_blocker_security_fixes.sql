ALTER TABLE public.community_trade_shares
ADD COLUMN IF NOT EXISTS include_reasoning BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false;

UPDATE public.profiles p
SET profile_completed = true
FROM auth.users u
WHERE p.id = u.id
  AND p.profile_completed = false
  AND (
    (
      p.display_name IS NOT NULL
      AND btrim(p.display_name) <> ''
      AND lower(btrim(p.display_name)) <> lower(split_part(u.email, '@', 1))
    )
    OR (
      p.username IS NOT NULL
      AND btrim(p.username) <> ''
      AND lower(btrim(p.username)) <> lower(split_part(u.email, '@', 1))
    )
  );

DROP POLICY IF EXISTS "trade_shares_insert" ON public.community_trade_shares;
CREATE POLICY "trade_shares_insert" ON public.community_trade_shares
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.trades t
    WHERE t.id = community_trade_shares.trade_id
      AND t.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.community_group_members m
    WHERE m.group_id = community_trade_shares.group_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "screenshots_insert_own" ON public.trade_screenshots;
CREATE POLICY "screenshots_insert_own" ON public.trade_screenshots
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND split_part(storage_path, '/', 1) = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.trades t
    WHERE t.id = trade_screenshots.trade_id
      AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "ctc_insert_group_member_self" ON public.community_trade_comments;
CREATE POLICY "ctc_insert_group_member_self" ON public.community_trade_comments
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.community_group_members m
    WHERE m.group_id = community_trade_comments.group_id
      AND m.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.community_trade_shares s
    WHERE s.trade_id = community_trade_comments.trade_id
      AND s.group_id = community_trade_comments.group_id
  )
);
