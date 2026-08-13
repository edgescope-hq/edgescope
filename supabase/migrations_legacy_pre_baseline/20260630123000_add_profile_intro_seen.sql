ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_seen_intro BOOLEAN NOT NULL DEFAULT false;

UPDATE public.profiles
SET has_seen_intro = true
WHERE has_seen_intro = false;
