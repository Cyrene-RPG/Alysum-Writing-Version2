-- Run this whole file in the Supabase SQL Editor if you see:
--   ERROR: relation "public.plotweave" does not exist
-- (Do not run GRANT alone until the table exists.)

CREATE TABLE IF NOT EXISTS public.plotweave (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.plotweave ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plotweave_own" ON public.plotweave;
CREATE POLICY "plotweave_own" ON public.plotweave
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plotweave TO anon, authenticated;
