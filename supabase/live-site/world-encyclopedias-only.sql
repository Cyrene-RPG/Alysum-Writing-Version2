-- Run this whole file in the Supabase SQL Editor if World Encyclopedia shows:
--   PGRST205 / schema cache errors for world_encyclopedias.
-- Then: Project Settings → API → Reload schema (or wait ~1 min) and hard-refresh the page.

CREATE TABLE IF NOT EXISTS public.world_encyclopedias (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id text NOT NULL,
  title text NOT NULL DEFAULT 'Untitled encyclopedia',
  magic_type text,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  PRIMARY KEY (user_id, id),
  CONSTRAINT world_encyclopedias_magic_type_check CHECK (
    magic_type IS NULL OR magic_type IN ('soft', 'hard', 'undecided')
  )
);

CREATE INDEX IF NOT EXISTS world_encyclopedias_user_updated_idx
  ON public.world_encyclopedias (user_id, updated_at_ms DESC);

ALTER TABLE public.world_encyclopedias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "world_encyclopedias_own" ON public.world_encyclopedias;
CREATE POLICY "world_encyclopedias_own" ON public.world_encyclopedias
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.world_encyclopedias TO anon, authenticated;
