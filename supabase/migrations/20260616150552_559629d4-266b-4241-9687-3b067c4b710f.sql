
CREATE TABLE public.trading_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Account
  starting_balance NUMERIC(18, 2),
  account_type TEXT CHECK (account_type IN ('personal', 'funded', 'demo')),
  default_risk_pct NUMERIC(6, 3),

  -- Guardrails
  max_trades_per_day INTEGER,
  max_daily_loss NUMERIC(18, 2),
  max_daily_profit NUMERIC(18, 2),

  -- Trading profile
  primary_market TEXT CHECK (primary_market IN ('forex', 'crypto', 'indices', 'gold', 'stocks')),
  primary_session TEXT CHECK (primary_session IN ('london', 'new_york', 'asian', 'multiple')),

  -- Future toggles (placeholders, not enforced yet)
  require_screenshot BOOLEAN NOT NULL DEFAULT false,
  require_setup_selection BOOLEAN NOT NULL DEFAULT false,
  require_post_trade_reflection BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_preferences TO authenticated;
GRANT ALL ON public.trading_preferences TO service_role;

ALTER TABLE public.trading_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trading preferences"
  ON public.trading_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trading preferences"
  ON public.trading_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading preferences"
  ON public.trading_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trading preferences"
  ON public.trading_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_trading_preferences
  BEFORE UPDATE ON public.trading_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
