
-- Expand trading_accounts with per-account risk rule fields (all nullable, no destructive change)
ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS max_risk_per_trade_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS daily_loss_limit_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS weekly_loss_limit_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS monthly_loss_limit_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS max_open_positions integer,
  ADD COLUMN IF NOT EXISTS max_correlated_positions integer,
  ADD COLUMN IF NOT EXISTS news_trading_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekend_holding_allowed boolean NOT NULL DEFAULT true;

-- Per-account guardrails (1-to-1 with trading_accounts)
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

CREATE POLICY "Users select own guardrails"
  ON public.account_guardrails FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own guardrails"
  ON public.account_guardrails FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own guardrails"
  ON public.account_guardrails FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own guardrails"
  ON public.account_guardrails FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER account_guardrails_set_updated_at
  BEFORE UPDATE ON public.account_guardrails
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
