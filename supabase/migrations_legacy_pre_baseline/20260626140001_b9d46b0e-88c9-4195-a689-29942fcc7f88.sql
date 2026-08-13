CREATE TYPE public.app_role AS ENUM ('admin','member');
CREATE TYPE public.market_type AS ENUM ('forex','crypto','stocks','indices','futures','commodities','other');
CREATE TYPE public.trade_direction AS ENUM ('long','short');
CREATE TYPE public.trade_result AS ENUM ('win','loss','breakeven');
CREATE TYPE public.trade_grade AS ENUM ('A+','A','B+','B','C','D');
CREATE TYPE public.trading_session AS ENUM ('asia','london','new_york','overlap','custom');
CREATE TYPE public.screenshot_kind AS ENUM ('before','after');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  community_access boolean NOT NULL DEFAULT false,
  edge_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_self" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invites_created_by ON public.invites(created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites_select_own" ON public.invites FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "invites_insert_own" ON public.invites FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "invites_update_own" ON public.invites FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "invites_delete_own" ON public.invites FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE TABLE public.trading_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'personal' CHECK (account_type = ANY (ARRAY['personal','funded','demo','live','challenge','backtest'])),
  starting_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC(20,2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  broker TEXT,
  challenge_provider TEXT,
  challenge_phase TEXT,
  max_risk_per_trade_pct numeric(6,3),
  daily_loss_limit_pct numeric(6,3),
  weekly_loss_limit_pct numeric(6,3),
  monthly_loss_limit_pct numeric(6,3),
  max_open_positions integer,
  max_correlated_positions integer,
  max_trades_per_day integer,
  news_trading_allowed boolean NOT NULL DEFAULT true,
  weekend_holding_allowed boolean NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_accounts TO authenticated;
GRANT ALL ON public.trading_accounts TO service_role;
ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own accounts" ON public.trading_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own accounts" ON public.trading_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own accounts" ON public.trading_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own accounts" ON public.trading_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE UNIQUE INDEX trading_accounts_one_active_per_user ON public.trading_accounts(user_id) WHERE is_active;
CREATE INDEX trading_accounts_user_idx ON public.trading_accounts(user_id);
CREATE TRIGGER trading_accounts_set_updated_at BEFORE UPDATE ON public.trading_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL,
  market public.market_type NOT NULL,
  instrument TEXT NOT NULL,
  trade_date DATE NOT NULL,
  trade_time TIME,
  direction public.trade_direction NOT NULL,
  entry_price NUMERIC(20,8),
  stop_loss NUMERIC(20,8),
  take_profit NUMERIC(20,8),
  exit_price NUMERIC(20,8),
  account_size NUMERIC(20,2),
  risk_percentage NUMERIC(8,4),
  position_size NUMERIC(20,8),
  planned_rr TEXT,
  achieved_rr NUMERIC(8,2),
  result public.trade_result,
  grade public.trade_grade,
  session TEXT,
  killzone TEXT,
  in_killzone BOOLEAN,
  reasoning TEXT,
  lessons_learned TEXT,
  mistakes_made TEXT,
  notes TEXT,
  private_notes TEXT,
  emotion_before TEXT,
  emotion_during TEXT,
  emotion_after TEXT,
  emotion_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  mistake_tags TEXT[] NOT NULL DEFAULT '{}',
  categories TEXT[] NOT NULL DEFAULT '{}',
  subcategories TEXT[] NOT NULL DEFAULT '{}',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  is_paper BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open','closed')),
  live_price NUMERIC,
  floating_pnl NUMERIC,
  risk_amount NUMERIC(20,2),
  reward_amount NUMERIC(20,2),
  pnl_amount NUMERIC(20,2),
  trade_number INTEGER,
  closed_reason TEXT CHECK (closed_reason IS NULL OR closed_reason IN ('tp','sl','manual')),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trades_user_date ON public.trades(user_id, trade_date DESC);
CREATE INDEX idx_trades_shared ON public.trades(is_shared) WHERE is_shared = true;
CREATE INDEX trades_user_paper_status_idx ON public.trades (user_id, is_paper, status);
CREATE INDEX trades_account_idx ON public.trades(account_id);
CREATE INDEX idx_trades_user_number ON public.trades(user_id, trade_number DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades_select_own" ON public.trades FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "trades_insert_own" ON public.trades FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "trades_update_own" ON public.trades FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "trades_delete_own" ON public.trades FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_trades_updated_at BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assign_trade_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.trade_number IS NULL THEN
    SELECT COALESCE(MAX(trade_number), 0) + 1 INTO NEW.trade_number
      FROM public.trades WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_trade_number() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_trades_assign_number BEFORE INSERT ON public.trades FOR EACH ROW EXECUTE FUNCTION public.assign_trade_number();

CREATE TABLE public.trade_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  kind public.screenshot_kind NOT NULL DEFAULT 'before',
  caption TEXT,
  annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_screenshots_trade ON public.trade_screenshots(trade_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_screenshots TO authenticated;
GRANT ALL ON public.trade_screenshots TO service_role;
ALTER TABLE public.trade_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "screenshots_select_own" ON public.trade_screenshots FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "screenshots_insert_own" ON public.trade_screenshots FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "screenshots_update_own" ON public.trade_screenshots FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "screenshots_delete_own" ON public.trade_screenshots FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.sticky_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'default',
  pinned BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sticky_notes TO authenticated;
GRANT ALL ON public.sticky_notes TO service_role;
ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own notes" ON public.sticky_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_sticky_notes_updated_at BEFORE UPDATE ON public.sticky_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.notebook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type = ANY (ARRAY['setup','lesson','review','general'])),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notebook_user ON public.notebook_entries(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_entries TO authenticated;
GRANT ALL ON public.notebook_entries TO service_role;
ALTER TABLE public.notebook_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notebook_select_own" ON public.notebook_entries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notebook_insert_own" ON public.notebook_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "notebook_update_own" ON public.notebook_entries FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notebook_delete_own" ON public.notebook_entries FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER notebook_set_updated_at BEFORE UPDATE ON public.notebook_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.trading_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  starting_balance NUMERIC(18, 2),
  account_type TEXT CHECK (account_type IN ('personal', 'funded', 'demo')),
  default_risk_pct NUMERIC(6, 3),
  max_trades_per_day INTEGER,
  max_daily_loss NUMERIC(18, 2),
  max_daily_profit NUMERIC(18, 2),
  primary_market TEXT CHECK (primary_market IN ('forex', 'crypto', 'indices', 'gold', 'stocks')),
  primary_session TEXT CHECK (primary_session IN ('london', 'new_york', 'asian', 'multiple')),
  require_screenshot BOOLEAN NOT NULL DEFAULT false,
  require_setup_selection BOOLEAN NOT NULL DEFAULT false,
  require_post_trade_reflection BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_preferences TO authenticated;
GRANT ALL ON public.trading_preferences TO service_role;
ALTER TABLE public.trading_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own trading preferences" ON public.trading_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own trading preferences" ON public.trading_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own trading preferences" ON public.trading_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own trading preferences" ON public.trading_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_trading_preferences BEFORE UPDATE ON public.trading_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.account_guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  stop_after_consecutive_losses integer,
  stop_after_daily_loss boolean NOT NULL DEFAULT false,
  cooldown_minutes_after_loss integer,
  require_trade_plan boolean NOT NULL DEFAULT false,
  require_screenshot boolean NOT NULL DEFAULT false,
  require_post_trade_review boolean NOT NULL DEFAULT false,
  lock_after_emotional_violations integer,
  daily_loss_reminder boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_guardrails TO authenticated;
GRANT ALL ON public.account_guardrails TO service_role;
ALTER TABLE public.account_guardrails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own guardrails" ON public.account_guardrails FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own guardrails" ON public.account_guardrails FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own guardrails" ON public.account_guardrails FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own guardrails" ON public.account_guardrails FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER account_guardrails_set_updated_at BEFORE UPDATE ON public.account_guardrails FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.generate_edge_id()
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
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
    IF attempts > 25 THEN RAISE EXCEPTION 'Failed to allocate edge_id'; END IF;
  END LOOP;
  RETURN candidate;
END $$;

ALTER TABLE public.profiles ALTER COLUMN edge_id SET DEFAULT public.generate_edge_id();
CREATE UNIQUE INDEX profiles_edge_id_key ON public.profiles(edge_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE TABLE public.community_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_groups TO authenticated;
GRANT ALL ON public.community_groups TO service_role;

CREATE TABLE public.community_group_members (
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_group_members TO authenticated;
GRANT ALL ON public.community_group_members TO service_role;
CREATE INDEX cgm_user_idx ON public.community_group_members(user_id);

CREATE TABLE public.community_group_invitations (
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
CREATE UNIQUE INDEX cgi_pending_unique ON public.community_group_invitations(group_id, invitee_id) WHERE status = 'pending';
CREATE INDEX cgi_invitee_idx ON public.community_group_invitations(invitee_id);

CREATE TABLE public.community_trade_comments (
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
CREATE INDEX ctc_trade_group_idx ON public.community_trade_comments(trade_id, group_id, created_at);

CREATE TABLE public.community_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('invite_received','invite_accepted','trade_shared','comment_added')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_notifications TO authenticated;
GRANT ALL ON public.community_notifications TO service_role;
CREATE INDEX cn_user_idx ON public.community_notifications(user_id, created_at DESC);

CREATE TRIGGER cgroups_set_updated_at BEFORE UPDATE ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ctc_set_updated_at BEFORE UPDATE ON public.community_trade_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_trade_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select_owner_or_member" ON public.community_groups
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.community_group_members m
    WHERE m.group_id = community_groups.id AND m.user_id = auth.uid()
  ));
CREATE POLICY "groups_insert_self_owner" ON public.community_groups
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "groups_update_owner" ON public.community_groups
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "groups_delete_owner" ON public.community_groups
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "cgm_select_self" ON public.community_group_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "cgm_delete_self_or_owner" ON public.community_group_members
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_groups g WHERE g.id = community_group_members.group_id AND g.owner_id = auth.uid())
  );

CREATE POLICY "cgi_select_party" ON public.community_group_invitations
  FOR SELECT TO authenticated USING (inviter_id = auth.uid() OR invitee_id = auth.uid());
CREATE POLICY "cgi_update_invitee_or_inviter" ON public.community_group_invitations
  FOR UPDATE TO authenticated USING (invitee_id = auth.uid() OR inviter_id = auth.uid())
  WITH CHECK (invitee_id = auth.uid() OR inviter_id = auth.uid());

CREATE POLICY "ctc_select_group_member" ON public.community_trade_comments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.community_group_members m WHERE m.group_id = community_trade_comments.group_id AND m.user_id = auth.uid())
  );
CREATE POLICY "ctc_insert_group_member_self" ON public.community_trade_comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.community_group_members m WHERE m.group_id = community_trade_comments.group_id AND m.user_id = auth.uid())
  );
CREATE POLICY "ctc_update_own" ON public.community_trade_comments
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ctc_delete_own_or_group_owner" ON public.community_trade_comments
  FOR DELETE TO authenticated USING (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.community_groups g WHERE g.id = community_trade_comments.group_id AND g.owner_id = auth.uid())
  );

CREATE POLICY "cn_select_own" ON public.community_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "cn_update_own" ON public.community_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "cn_delete_own" ON public.community_notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
