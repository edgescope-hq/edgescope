CREATE TABLE IF NOT EXISTS public.community_trade_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id, group_id)
);

GRANT SELECT, INSERT, DELETE ON public.community_trade_shares TO authenticated;
GRANT ALL ON public.community_trade_shares TO service_role;

ALTER TABLE public.community_trade_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_shares_select" ON public.community_trade_shares;
CREATE POLICY "trade_shares_select" ON public.community_trade_shares FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.community_group_members m
    WHERE m.group_id = community_trade_shares.group_id AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "trade_shares_insert" ON public.community_trade_shares;
CREATE POLICY "trade_shares_insert" ON public.community_trade_shares FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = trade_id AND t.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.community_group_members m
    WHERE m.group_id = group_id AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "trade_shares_delete" ON public.community_trade_shares;
CREATE POLICY "trade_shares_delete" ON public.community_trade_shares FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
);
