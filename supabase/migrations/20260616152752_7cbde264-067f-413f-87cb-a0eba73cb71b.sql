
-- 1. Accounts table
CREATE TABLE public.trading_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'personal' CHECK (account_type IN ('personal','funded','demo')),
  starting_balance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  broker TEXT,
  challenge_provider TEXT,
  challenge_phase TEXT,
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

-- One active account per user
CREATE UNIQUE INDEX trading_accounts_one_active_per_user ON public.trading_accounts(user_id) WHERE is_active;
CREATE INDEX trading_accounts_user_idx ON public.trading_accounts(user_id);

CREATE TRIGGER trading_accounts_set_updated_at BEFORE UPDATE ON public.trading_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Trades.account_id
ALTER TABLE public.trades ADD COLUMN account_id UUID REFERENCES public.trading_accounts(id) ON DELETE SET NULL;
CREATE INDEX trades_account_idx ON public.trades(account_id);

-- 3. Backfill: create a default account for any user with existing trades or prefs
DO $$
DECLARE
  u RECORD;
  acct_id UUID;
  start_bal NUMERIC;
  acct_type TEXT;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM public.trades
      UNION
      SELECT user_id FROM public.trading_preferences WHERE starting_balance IS NOT NULL
    ) s
  LOOP
    SELECT starting_balance, account_type INTO start_bal, acct_type
      FROM public.trading_preferences WHERE user_id = u.user_id;
    INSERT INTO public.trading_accounts (user_id, name, account_type, starting_balance, is_active)
    VALUES (
      u.user_id,
      'Default Account',
      COALESCE(acct_type, 'personal'),
      COALESCE(start_bal, 0),
      true
    )
    RETURNING id INTO acct_id;

    UPDATE public.trades SET account_id = acct_id WHERE user_id = u.user_id AND account_id IS NULL;
  END LOOP;
END $$;
