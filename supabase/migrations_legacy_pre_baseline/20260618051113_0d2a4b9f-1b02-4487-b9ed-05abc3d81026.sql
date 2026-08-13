
-- TRADES: add structured P&L + private notes + per-user trade number
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS risk_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS reward_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS pnl_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS private_notes text,
  ADD COLUMN IF NOT EXISTS trade_number integer;

-- Per-user sequential trade numbers via trigger (safer than a global sequence)
CREATE OR REPLACE FUNCTION public.assign_trade_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.trade_number IS NULL THEN
    SELECT COALESCE(MAX(trade_number), 0) + 1
      INTO NEW.trade_number
      FROM public.trades
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trades_assign_number ON public.trades;
CREATE TRIGGER trg_trades_assign_number
  BEFORE INSERT ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.assign_trade_number();

-- Backfill existing trades with stable per-user numbers ordered by date
WITH numbered AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY trade_date, created_at) AS n
  FROM public.trades
  WHERE trade_number IS NULL
)
UPDATE public.trades t
   SET trade_number = numbered.n
  FROM numbered
 WHERE t.id = numbered.id;

CREATE INDEX IF NOT EXISTS idx_trades_user_number
  ON public.trades(user_id, trade_number DESC);

-- TRADING_ACCOUNTS: widen allowed account types, add optional fields
ALTER TABLE public.trading_accounts
  DROP CONSTRAINT IF EXISTS trading_accounts_account_type_check;
ALTER TABLE public.trading_accounts
  ADD CONSTRAINT trading_accounts_account_type_check
  CHECK (account_type = ANY (ARRAY['personal','funded','demo','live','challenge','backtest']));

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS max_trades_per_day integer,
  ADD COLUMN IF NOT EXISTS current_balance numeric(20,2);

-- NOTEBOOK_ENTRIES: typed notes (Setup / Lesson / Review / General)
ALTER TABLE public.notebook_entries
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'general';

ALTER TABLE public.notebook_entries
  DROP CONSTRAINT IF EXISTS notebook_entries_note_type_check;
ALTER TABLE public.notebook_entries
  ADD CONSTRAINT notebook_entries_note_type_check
  CHECK (note_type = ANY (ARRAY['setup','lesson','review','general']));
