-- Run in Supabase SQL editor once. Adds tables/columns used by the static site after the Firestore migration.

-- Optional: beta reader shelf + notes (merged JSON on users, same shapes as legacy Firestore fields)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beta_read_shelf jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beta_read_notes_by_book jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Story Bible per-book rows (replaces users/{uid}/books/{bookId}/bibleCharacters|biblePlaces)
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

-- Worldbuilding encyclopedia (worldbuilding.html — was users/{uid}/worldbuilding/{sheetId})
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

-- Multi worldbuilding workbooks (was users/{uid}/worldbuildingSheets/{sheetId})
CREATE TABLE IF NOT EXISTS public.worldbuilding_workbooks (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id text NOT NULL,
  display_name text NOT NULL DEFAULT 'Untitled world',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 2,
  created_at_ms bigint NOT NULL,
  updated_ms bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Character profile side worksheets (was users/{uid}/characterProfileSheets/{sheetId})
CREATE TABLE IF NOT EXISTS public.character_profile_sheets (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id text NOT NULL,
  display_name text NOT NULL DEFAULT 'Untitled',
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Prompt notebook vault (was users/{uid}/notebookVault/data)
CREATE TABLE IF NOT EXISTS public.notebook_vault (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.story_bible_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_bible_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worldbuilding_encyclopedia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worldbuilding_workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_profile_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_bible_characters_own" ON public.story_bible_characters;
CREATE POLICY "story_bible_characters_own" ON public.story_bible_characters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "story_bible_places_own" ON public.story_bible_places;
CREATE POLICY "story_bible_places_own" ON public.story_bible_places
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "worldbuilding_encyclopedia_own" ON public.worldbuilding_encyclopedia;
CREATE POLICY "worldbuilding_encyclopedia_own" ON public.worldbuilding_encyclopedia
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "worldbuilding_workbooks_own" ON public.worldbuilding_workbooks;
CREATE POLICY "worldbuilding_workbooks_own" ON public.worldbuilding_workbooks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "character_profile_sheets_own" ON public.character_profile_sheets;
CREATE POLICY "character_profile_sheets_own" ON public.character_profile_sheets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notebook_vault_own" ON public.notebook_vault;
CREATE POLICY "notebook_vault_own" ON public.notebook_vault
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Prompt notebook entries (was users/{uid}/promptEntries/{id})
CREATE TABLE IF NOT EXISTS public.prompt_entries (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_ms bigint NOT NULL,
  created_ms bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Which beta highlights the reader already sent to authors (was users/{uid}/betaSharesIndex/{shareKey})
CREATE TABLE IF NOT EXISTS public.beta_shares_index (
  reader_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  share_key text NOT NULL,
  book_id text NOT NULL DEFAULT '',
  note_id text NOT NULL DEFAULT '',
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reader_id, share_key)
);

ALTER TABLE public.prompt_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_shares_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompt_entries_own" ON public.prompt_entries;
CREATE POLICY "prompt_entries_own" ON public.prompt_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "beta_shares_index_own" ON public.beta_shares_index;
CREATE POLICY "beta_shares_index_own" ON public.beta_shares_index
  FOR ALL USING (auth.uid() = reader_id) WITH CHECK (auth.uid() = reader_id);

-- Requires existing `public.notifications` with jsonb `data` (see migrate-firestore.js). If this fails, create that table first or comment out the next two statements.
-- Let a signed-in reader create a notification row on an author's inbox when data.readerUid matches them.
DROP POLICY IF EXISTS "notifications_insert_beta_share_reader" ON public.notifications;
CREATE POLICY "notifications_insert_beta_share_reader" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (data IS NOT NULL)
    AND coalesce(data->>'readerUid', '') = (auth.uid())::text
  );
