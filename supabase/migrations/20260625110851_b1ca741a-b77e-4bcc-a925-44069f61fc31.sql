-- Add in_killzone discipline boolean and emotion_tags array for emoji emotions.
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS in_killzone boolean,
  ADD COLUMN IF NOT EXISTS emotion_tags text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.trades.in_killzone IS 'Whether the trade was taken during the trader''s personal killzone (discipline checkbox).';
COMMENT ON COLUMN public.trades.emotion_tags IS 'Multi-select emoji-based emotion tags captured during trade review.';