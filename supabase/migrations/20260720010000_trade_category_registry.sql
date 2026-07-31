-- Per-user category registry. Trade rows keep their historical text values;
-- this table controls only future suggestions and archiving.
CREATE TABLE IF NOT EXISTS public.trade_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trade_categories_name_length CHECK (char_length(name) BETWEEN 1 AND 64),
  CONSTRAINT trade_categories_normalized_name_length CHECK (char_length(normalized_name) BETWEEN 1 AND 64),
  CONSTRAINT trade_categories_user_normalized_name_key UNIQUE (user_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS trade_categories_active_by_user_idx
  ON public.trade_categories (user_id, archived_at, name);

ALTER TABLE public.trade_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_categories_select_own" ON public.trade_categories FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "trade_categories_insert_own" ON public.trade_categories FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "trade_categories_update_own" ON public.trade_categories FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.trade_categories TO authenticated;
GRANT ALL ON public.trade_categories TO service_role;
CREATE TRIGGER trg_trade_categories_updated_at BEFORE UPDATE ON public.trade_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.trade_categories (user_id, name, normalized_name)
SELECT DISTINCT t.user_id, trimmed.name, lower(trimmed.name)
FROM public.trades AS t
CROSS JOIN LATERAL unnest(COALESCE(t.categories, ARRAY[]::text[])) AS raw(name)
CROSS JOIN LATERAL (SELECT btrim(raw.name) AS name) AS trimmed
WHERE trimmed.name <> '' AND char_length(trimmed.name) <= 64
ON CONFLICT (user_id, normalized_name) DO NOTHING;
