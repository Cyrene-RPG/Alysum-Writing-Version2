-- Story Bible — run once in Supabase SQL editor (Dashboard → SQL → New query).
-- Project: https://supabase.com/dashboard/project/jrfxgpkpbacajhcwimgz/sql/new
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- Characters + places (legacy codex sheets)
CREATE TABLE IF NOT EXISTS public.story_bible_characters (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  id text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, book_id, id)
);

CREATE TABLE IF NOT EXISTS public.story_bible_places (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  id text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, book_id, id)
);

-- Extracted canon facts (cloud-synced)
CREATE TABLE IF NOT EXISTS public.story_bible_facts (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  id text NOT NULL,
  character_id text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  value text NOT NULL DEFAULT '',
  source_chapter text NOT NULL DEFAULT '',
  source_paragraph text NOT NULL DEFAULT '',
  source_text text NOT NULL DEFAULT '',
  date_added timestamptz NOT NULL DEFAULT now(),
  updated bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, book_id, id)
);

CREATE INDEX IF NOT EXISTS story_bible_facts_character_idx
  ON public.story_bible_facts (user_id, book_id, character_id);

ALTER TABLE public.story_bible_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_bible_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_bible_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_bible_characters_own" ON public.story_bible_characters;
CREATE POLICY "story_bible_characters_own" ON public.story_bible_characters
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "story_bible_places_own" ON public.story_bible_places;
CREATE POLICY "story_bible_places_own" ON public.story_bible_places
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "story_bible_facts_own" ON public.story_bible_facts;
CREATE POLICY "story_bible_facts_own" ON public.story_bible_facts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_characters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_facts TO authenticated;

-- Refresh PostgREST schema cache so the API sees new tables immediately
NOTIFY pgrst, 'reload schema';
