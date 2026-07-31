-- Prompt 2A: persisted, per-user Detailed Review requirements and durable completion.
-- Existing RLS policies already restrict both tables to their owning authenticated user.

ALTER TABLE public.trading_preferences
  ADD COLUMN IF NOT EXISTS review_require_screenshot boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_require_reasoning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_require_category boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_require_grade boolean NOT NULL DEFAULT false;

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS review_completed_at timestamptz;

-- Preserve the current guided definition of historical Reviewed trades: valid core/R
-- data plus any one stored screenshot and nonblank reasoning. New requirements never
-- retroactively change this durable state.
UPDATE public.trades AS trade
SET review_completed_at = COALESCE(trade.updated_at, trade.created_at, now())
WHERE trade.review_completed_at IS NULL
  AND btrim(COALESCE(trade.instrument, '')) <> ''
  AND trade.direction IN ('long', 'short')
  AND trade.result IN ('win', 'loss', 'breakeven')
  AND trade.risk_amount > 0
  AND COALESCE(trade.pnl_amount, trade.reward_amount) IS NOT NULL
  AND btrim(COALESCE(trade.reasoning, '')) <> ''
  AND EXISTS (
    SELECT 1
    FROM public.trade_screenshots AS screenshot
    WHERE screenshot.trade_id = trade.id
      AND screenshot.user_id = trade.user_id
  );
