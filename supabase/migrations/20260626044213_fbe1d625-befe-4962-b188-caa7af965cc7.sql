
-- ============ EdgeScope public handle ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS edge_id TEXT;

CREATE OR REPLACE FUNCTION public.generate_edge_id()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i INT;
  attempts INT := 0;
BEGIN
  LOOP
    candidate := 'EDGE-';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE edge_id = candidate);
    attempts := attempts + 1;
    IF attempts > 25 THEN
      RAISE EXCEPTION 'Failed to allocate edge_id';
    END IF;
  END LOOP;
  RETURN candidate;
END
$$;

-- Backfill existing profiles
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE edge_id IS NULL LOOP
    UPDATE public.profiles SET edge_id = public.generate_edge_id() WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN edge_id SET NOT NULL,
  ALTER COLUMN edge_id SET DEFAULT public.generate_edge_id();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_edge_id_key ON public.profiles(edge_id);

-- Update handle_new_user to assign edge_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uname TEXT;
  is_first BOOLEAN;
  eid TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '_' || substr(NEW.id::text, 1, 6);
  END IF;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
  eid := public.generate_edge_id();
  INSERT INTO public.profiles (id, username, display_name, community_access, edge_id)
  VALUES (NEW.id, uname, COALESCE(NEW.raw_user_meta_data->>'display_name', uname), is_first, eid);
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = NEW.id;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;
  RETURN NEW;
END $$;

-- ============ Groups ============
CREATE TABLE IF NOT EXISTS public.community_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_groups TO authenticated;
GRANT ALL ON public.community_groups TO service_role;

CREATE TABLE IF NOT EXISTS public.community_group_members (
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_group_members TO authenticated;
GRANT ALL ON public.community_group_members TO service_role;
CREATE INDEX IF NOT EXISTS cgm_user_idx ON public.community_group_members(user_id);

-- Security-definer membership check
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_groups WHERE id = _group_id AND owner_id = _user_id
  )
$$;

-- ============ Invitations ============
CREATE TABLE IF NOT EXISTS public.community_group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_group_invitations TO authenticated;
GRANT ALL ON public.community_group_invitations TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS cgi_pending_unique
  ON public.community_group_invitations(group_id, invitee_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS cgi_invitee_idx ON public.community_group_invitations(invitee_id);

-- ============ Comments ============
CREATE TABLE IF NOT EXISTS public.community_trade_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.community_trade_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_trade_comments TO authenticated;
GRANT ALL ON public.community_trade_comments TO service_role;
CREATE INDEX IF NOT EXISTS ctc_trade_group_idx ON public.community_trade_comments(trade_id, group_id, created_at);

-- ============ Notifications ============
CREATE TABLE IF NOT EXISTS public.community_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('invite_received','invite_accepted','trade_shared','comment_added')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_notifications TO authenticated;
GRANT ALL ON public.community_notifications TO service_role;
CREATE INDEX IF NOT EXISTS cn_user_idx ON public.community_notifications(user_id, created_at DESC);

-- ============ Triggers for updated_at ============
CREATE TRIGGER cgroups_set_updated_at BEFORE UPDATE ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ctc_set_updated_at BEFORE UPDATE ON public.community_trade_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Enable RLS ============
ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_trade_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

-- ============ Policies ============

-- Groups: members can view; owner can update/delete; any auth user can create (as owner)
CREATE POLICY "groups_select_members" ON public.community_groups
  FOR SELECT TO authenticated
  USING (public.is_group_member(id, auth.uid()));

CREATE POLICY "groups_insert_self_owner" ON public.community_groups
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "groups_update_owner" ON public.community_groups
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "groups_delete_owner" ON public.community_groups
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Members: visible to members of same group; owner inserts (via accept flow uses service role); members can leave (delete own row); owner can remove others
CREATE POLICY "cgm_select_members" ON public.community_group_members
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "cgm_delete_self_or_owner" ON public.community_group_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_group_owner(group_id, auth.uid()));

-- Invitations: inviter & invitee visible; invitee responds; inviter cancels
CREATE POLICY "cgi_select_party" ON public.community_group_invitations
  FOR SELECT TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

CREATE POLICY "cgi_update_invitee_or_inviter" ON public.community_group_invitations
  FOR UPDATE TO authenticated
  USING (invitee_id = auth.uid() OR inviter_id = auth.uid())
  WITH CHECK (invitee_id = auth.uid() OR inviter_id = auth.uid());

-- Comments: members of group can read; users can write own; edit/delete own
CREATE POLICY "ctc_select_group_member" ON public.community_trade_comments
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "ctc_insert_group_member_self" ON public.community_trade_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id, auth.uid()));

CREATE POLICY "ctc_update_own" ON public.community_trade_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ctc_delete_own_or_owner" ON public.community_trade_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_group_owner(group_id, auth.uid()));

-- Notifications: user owns
CREATE POLICY "cn_select_own" ON public.community_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "cn_update_own" ON public.community_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "cn_delete_own" ON public.community_notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
