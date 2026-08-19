-- Run this whole file in the Supabase SQL Editor if you see:
--   ERROR: relation "public.notebook_vault" does not exist
-- (Do not run GRANT alone until the table exists.)

CREATE TABLE IF NOT EXISTS public.notebook_vault (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.notebook_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notebook_vault_own" ON public.notebook_vault;
CREATE POLICY "notebook_vault_own" ON public.notebook_vault
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_vault TO anon, authenticated;
