CREATE TABLE IF NOT EXISTS public.community_trade_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES public.community_trade_shares(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('reviewed', 'good_execution', 'rule_break', 'useful_note', 'clean_setup')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(share_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_trade_reactions TO authenticated;
GRANT ALL ON public.community_trade_reactions TO service_role;

ALTER TABLE public.community_trade_reactions ENABLE ROW LEVEL SECURITY;

-- Select: member of the group that owns the share
CREATE POLICY "ctr_select_group_member" ON public.community_trade_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_group_members m
      JOIN public.community_trade_shares s ON s.group_id = m.group_id
      WHERE s.id = share_id
        AND m.user_id = auth.uid()
    )
  );

-- Insert: own reaction, must be member of group, share must exist
CREATE POLICY "ctr_insert_group_member_self" ON public.community_trade_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.community_group_members m
      JOIN public.community_trade_shares s ON s.group_id = m.group_id
      WHERE s.id = share_id
        AND m.user_id = auth.uid()
    )
  );

-- Update: only own reaction, must still be a member
CREATE POLICY "ctr_update_own" ON public.community_trade_reactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.community_group_members m
      JOIN public.community_trade_shares s ON s.group_id = m.group_id
      WHERE s.id = share_id
        AND m.user_id = auth.uid()
    )
  );

-- Delete: own reaction, or group owner
CREATE POLICY "ctr_delete_own_or_group_owner" ON public.community_trade_reactions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.community_groups g
      JOIN public.community_trade_shares s ON s.group_id = g.id
      WHERE s.id = share_id
        AND g.owner_id = auth.uid()
    )
  );

CREATE TRIGGER ctr_set_updated_at BEFORE UPDATE ON public.community_trade_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
