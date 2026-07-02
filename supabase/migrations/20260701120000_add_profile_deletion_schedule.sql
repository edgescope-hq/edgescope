ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_cancelled_at TIMESTAMPTZ;
