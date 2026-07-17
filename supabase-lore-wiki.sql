-- Lore Wiki — public read-only snapshots from private Story Wiki (run in Supabase SQL editor)

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS lore_wiki_published boolean NOT NULL DEFAULT false;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS lore_wiki_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.lore_wiki (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  book_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lore_wiki_user_id_idx ON public.lore_wiki (user_id);
CREATE INDEX IF NOT EXISTS lore_wiki_book_id_idx ON public.lore_wiki (book_id);

CREATE TABLE IF NOT EXISTS public.lore_wiki_articles (
  book_id text NOT NULL,
  entry_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('character', 'place')),
  slug text NOT NULL DEFAULT '',
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at bigint NOT NULL DEFAULT 0,
  updated bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, entry_id)
);

CREATE INDEX IF NOT EXISTS lore_wiki_articles_book_idx ON public.lore_wiki_articles (book_id);

ALTER TABLE public.lore_wiki ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lore_wiki_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lore_wiki_select_public" ON public.lore_wiki;
CREATE POLICY "lore_wiki_select_public" ON public.lore_wiki
  FOR SELECT TO anon, authenticated
  USING (COALESCE((data->>'isPublished')::boolean, true) = true);

DROP POLICY IF EXISTS "lore_wiki_owner" ON public.lore_wiki;
CREATE POLICY "lore_wiki_owner" ON public.lore_wiki
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lore_wiki_articles_select_public" ON public.lore_wiki_articles;
CREATE POLICY "lore_wiki_articles_select_public" ON public.lore_wiki_articles
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "lore_wiki_articles_owner" ON public.lore_wiki_articles;
CREATE POLICY "lore_wiki_articles_owner" ON public.lore_wiki_articles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.lore_wiki TO anon, authenticated;
GRANT SELECT ON public.lore_wiki_articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lore_wiki TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lore_wiki_articles TO authenticated;
