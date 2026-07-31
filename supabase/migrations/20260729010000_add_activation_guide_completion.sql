alter table public.profiles
  add column if not exists activation_guide_completed_at timestamptz;

comment on column public.profiles.activation_guide_completed_at is
  'Durable completion marker for the user-level Dashboard activation guide.';
