
-- Drop policies that referenced the helpers
DROP POLICY IF EXISTS "groups_select_members" ON public.community_groups;
DROP POLICY IF EXISTS "cgm_select_members" ON public.community_group_members;
DROP POLICY IF EXISTS "cgm_delete_self_or_owner" ON public.community_group_members;
DROP POLICY IF EXISTS "ctc_select_group_member" ON public.community_trade_comments;
DROP POLICY IF EXISTS "ctc_insert_group_member_self" ON public.community_trade_comments;
DROP POLICY IF EXISTS "ctc_delete_own_or_owner" ON public.community_trade_comments;

DROP FUNCTION IF EXISTS public.is_group_member(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_group_owner(UUID, UUID);

-- Groups: a user can view groups they own OR where they have a membership row
CREATE POLICY "groups_select_owner_or_member" ON public.community_groups
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_group_members m
      WHERE m.group_id = community_groups.id AND m.user_id = auth.uid()
    )
  );

-- Members: each user only sees their OWN membership rows directly.
-- The app fetches the full member list via a server function that first
-- verifies the caller is a member, then bypasses RLS with service role.
CREATE POLICY "cgm_select_self" ON public.community_group_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Delete: a user can leave (own row), and the group owner can remove anyone.
CREATE POLICY "cgm_delete_self_or_owner" ON public.community_group_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_groups g
      WHERE g.id = community_group_members.group_id AND g.owner_id = auth.uid()
    )
  );

-- Comments: viewable to anyone who has a membership row in the comment's group
CREATE POLICY "ctc_select_group_member" ON public.community_trade_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_group_members m
      WHERE m.group_id = community_trade_comments.group_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "ctc_insert_group_member_self" ON public.community_trade_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_group_members m
      WHERE m.group_id = community_trade_comments.group_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "ctc_delete_own_or_group_owner" ON public.community_trade_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_groups g
      WHERE g.id = community_trade_comments.group_id AND g.owner_id = auth.uid()
    )
  );
