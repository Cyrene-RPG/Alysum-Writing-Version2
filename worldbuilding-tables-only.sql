-- Run this whole file in the Supabase SQL Editor if World building shows:
--   "Could not load worldsheets" or PGRST205 / schema cache errors.
-- Then: Project Settings → API → Reload schema (or wait ~1 min) and hard-refresh the page.

CREATE TABLE IF NOT EXISTS public.worldbuilding_encyclopedia (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id text NOT NULL,
  title text NOT NULL DEFAULT 'Untitled world',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 2,
  created_ms bigint NOT NULL,
  updated_ms bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.worldbuilding_encyclopedia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worldbuilding_encyclopedia_own" ON public.worldbuilding_encyclopedia;
CREATE POLICY "worldbuilding_encyclopedia_own" ON public.worldbuilding_encyclopedia
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worldbuilding_encyclopedia TO anon, authenticated;
