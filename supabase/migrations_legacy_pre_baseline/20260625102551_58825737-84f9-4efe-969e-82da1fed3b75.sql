ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS max_risk_per_trade_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS daily_loss_limit_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS weekly_loss_limit_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS monthly_loss_limit_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS max_open_positions integer,
  ADD COLUMN IF NOT EXISTS max_correlated_positions integer,
  ADD COLUMN IF NOT EXISTS news_trading_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekend_holding_allowed boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.account_guardrails (
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

ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.account_guardrails ADD COLUMN IF NOT EXISTS daily_loss_reminder boolean NOT NULL DEFAULT true;
ALTER TABLE public.sticky_notes ADD COLUMN IF NOT EXISTS kind text;

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS risk_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS reward_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS pnl_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS private_notes text,
  ADD COLUMN IF NOT EXISTS trade_number integer;

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

DROP TRIGGER IF EXISTS trg_trades_assign_number ON public.trades;
CREATE TRIGGER trg_trades_assign_number BEFORE INSERT ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.assign_trade_number();

CREATE INDEX IF NOT EXISTS idx_trades_user_number ON public.trades(user_id, trade_number DESC);

ALTER TABLE public.trading_accounts DROP CONSTRAINT IF EXISTS trading_accounts_account_type_check;
ALTER TABLE public.trading_accounts ADD CONSTRAINT trading_accounts_account_type_check
  CHECK (account_type = ANY (ARRAY['personal','funded','demo','live','challenge','backtest']));

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS max_trades_per_day integer,
  ADD COLUMN IF NOT EXISTS current_balance numeric(20,2);

ALTER TABLE public.notebook_entries ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'general';
ALTER TABLE public.notebook_entries DROP CONSTRAINT IF EXISTS notebook_entries_note_type_check;
ALTER TABLE public.notebook_entries ADD CONSTRAINT notebook_entries_note_type_check
  CHECK (note_type = ANY (ARRAY['setup','lesson','review','general']));

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS killzone text;