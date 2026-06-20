-- Run in Supabase SQL editor if story_bible_facts is not yet deployed.
-- Also included in supabase-sibling-tables.sql.

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

ALTER TABLE public.story_bible_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_bible_facts_own" ON public.story_bible_facts;
CREATE POLICY "story_bible_facts_own" ON public.story_bible_facts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
