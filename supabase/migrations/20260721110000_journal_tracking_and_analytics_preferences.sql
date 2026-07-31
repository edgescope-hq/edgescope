-- Prompt 2B: optional journal tracking stays on the existing owned trade row.
-- JSON configuration keeps placement and Analytics presentation preferences together
-- without creating a user-editable form-builder schema.

ALTER TABLE public.trading_preferences
  ADD COLUMN IF NOT EXISTS journal_tracking jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analytics_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_require_entry_model boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_require_market_condition boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_require_entry_timeframe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_require_news_involvement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_require_exit_reason boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_require_trade_management boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_require_custom_tags boolean NOT NULL DEFAULT false;

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS entry_model text,
  ADD COLUMN IF NOT EXISTS market_condition text,
  ADD COLUMN IF NOT EXISTS entry_timeframe text,
  ADD COLUMN IF NOT EXISTS news_involvement text,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS trade_management text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_tags text[] NOT NULL DEFAULT '{}';

-- Existing row ownership policies on trades and trading_preferences apply to these
-- columns; no policy or historical trade data is changed.
