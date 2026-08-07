-- Run in Supabase SQL Editor if library import fails with "schema cache" error.
CREATE TABLE IF NOT EXISTS public.library (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_user_id_idx ON public.library (user_id);

ALTER TABLE public.library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_select_public" ON public.library;
CREATE POLICY "library_select_public" ON public.library
  FOR SELECT TO anon, authenticated
  USING (COALESCE((data->>'isPublished')::boolean, true) = true);

GRANT SELECT ON public.library TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.library TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
