-- Run in Supabase SQL Editor if encyclopedia builders show PGRST205 for encyclopedia_blobs.
-- Then reload the API schema and hard-refresh the page.

CREATE TABLE IF NOT EXISTS public.encyclopedia_blobs (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_ms bigint NOT NULL,
  PRIMARY KEY (user_id, storage_key)
);

CREATE INDEX IF NOT EXISTS encyclopedia_blobs_user_updated_idx
  ON public.encyclopedia_blobs (user_id, updated_ms DESC);

ALTER TABLE public.encyclopedia_blobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "encyclopedia_blobs_own" ON public.encyclopedia_blobs;
CREATE POLICY "encyclopedia_blobs_own" ON public.encyclopedia_blobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.encyclopedia_blobs TO anon, authenticated;
