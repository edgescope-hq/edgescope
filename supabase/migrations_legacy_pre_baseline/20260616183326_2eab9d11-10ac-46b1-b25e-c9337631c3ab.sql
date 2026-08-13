ALTER TABLE public.account_guardrails ADD COLUMN IF NOT EXISTS daily_loss_reminder boolean NOT NULL DEFAULT true;
ALTER TABLE public.sticky_notes ADD COLUMN IF NOT EXISTS kind text;