-- Run in Supabase SQL editor once. Adds tables/columns used by the static site after the Firestore migration.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login text;

-- Optional: beta reader shelf + notes (merged JSON on users, same shapes as legacy Firestore fields)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beta_read_shelf jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beta_read_notes_by_book jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Reader profile: last-open story + chapter (read.html → users; reader-home.html displays)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_read_book_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_read_chapter_index integer;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_read_chapter_title text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_read_story_title text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_read_author text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_read_updated_at timestamptz;

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

-- Story Bible canon facts (extracted from manuscript selections, cloud-synced)
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

-- World Encyclopedia shelf (world-encyclopedia.html — was device localStorage)
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

-- Encyclopedia builder blobs (history, geography, codexes, city/realm builders, links)
CREATE TABLE IF NOT EXISTS public.encyclopedia_blobs (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_ms bigint NOT NULL,
  PRIMARY KEY (user_id, storage_key)
);

CREATE INDEX IF NOT EXISTS encyclopedia_blobs_user_updated_idx
  ON public.encyclopedia_blobs (user_id, updated_ms DESC);

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

-- Prompt notebook vault (was users/{uid}/notebookVault/data).
-- If this table is missing, you can run `notebook-vault-only.sql` alone, then refresh PostgREST schema cache if needed.
CREATE TABLE IF NOT EXISTS public.notebook_vault (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

-- Note Graph — separate linked-notes workspace (not Alysum Vault / Notes)
CREATE TABLE IF NOT EXISTS public.note_graph (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.story_bible_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_bible_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_bible_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_encyclopedias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encyclopedia_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worldbuilding_encyclopedia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worldbuilding_workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_profile_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_graph ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_bible_characters_own" ON public.story_bible_characters;
CREATE POLICY "story_bible_characters_own" ON public.story_bible_characters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "story_bible_places_own" ON public.story_bible_places;
CREATE POLICY "story_bible_places_own" ON public.story_bible_places
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "story_bible_facts_own" ON public.story_bible_facts;
CREATE POLICY "story_bible_facts_own" ON public.story_bible_facts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "world_encyclopedias_own" ON public.world_encyclopedias;
CREATE POLICY "world_encyclopedias_own" ON public.world_encyclopedias
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "encyclopedia_blobs_own" ON public.encyclopedia_blobs;
CREATE POLICY "encyclopedia_blobs_own" ON public.encyclopedia_blobs
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

DROP POLICY IF EXISTS "note_graph_own" ON public.note_graph;
CREATE POLICY "note_graph_own" ON public.note_graph
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_vault TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_graph TO anon, authenticated;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_shares_index TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_characters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_profile_sheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worldbuilding_workbooks TO authenticated;

DROP POLICY IF EXISTS "notifications_update_beta_share_reader" ON public.notifications;
CREATE POLICY "notifications_update_beta_share_reader" ON public.notifications
  FOR UPDATE TO authenticated
  USING (coalesce(data->>'readerUid', '') = (auth.uid())::text)
  WITH CHECK (coalesce(data->>'readerUid', '') = (auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Reader engagement (read.html, author-dashboard.html, library.html, index)
-- Was Firestore: library/{bookId}/comments, library/{bookId}/likes, reads.
-- If comments/kudos never load, apply this block in the Supabase SQL editor.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS comments_book_id_idx ON public.comments (book_id);
CREATE INDEX IF NOT EXISTS comments_book_created_idx ON public.comments (book_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.likes (
  id text PRIMARY KEY,
  book_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS likes_book_id_idx ON public.likes (book_id);

CREATE TABLE IF NOT EXISTS public.reads (
  id text PRIMARY KEY,
  book_id text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reader_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reads_book_id_idx ON public.reads (book_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_public" ON public.comments;
CREATE POLICY "comments_select_public" ON public.comments
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete_as_library_owner" ON public.comments;
CREATE POLICY "comments_delete_as_library_owner" ON public.comments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.library lib
      WHERE lib.id::text = comments.book_id
        AND lib.user_id::text = (auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "likes_select_public" ON public.likes;
CREATE POLICY "likes_select_public" ON public.likes
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "likes_insert_own" ON public.likes;
CREATE POLICY "likes_insert_own" ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "likes_update_own" ON public.likes;
CREATE POLICY "likes_update_own" ON public.likes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reads_select_public" ON public.reads;
CREATE POLICY "reads_select_public" ON public.reads
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "reads_insert_public" ON public.reads;
CREATE POLICY "reads_insert_public" ON public.reads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "reads_update_public" ON public.reads;
CREATE POLICY "reads_update_public" ON public.reads
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comments TO authenticated;

GRANT SELECT ON public.likes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.likes TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.reads TO anon, authenticated;

-- Idempotent Firestore → Supabase import for library comments (see migrate-library-engagement.js).
-- PostgreSQL treats NULL as distinct in UNIQUE, so many rows may have (book_id, NULL) for app-created comments.
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS legacy_firestore_id text;
CREATE UNIQUE INDEX IF NOT EXISTS comments_book_legacy_uidx ON public.comments (book_id, legacy_firestore_id);

-- Beta reader highlights (beta-read.html, beta-notes-library.html).
-- Separate from public.users so RLS on users cannot block note sync.
CREATE TABLE IF NOT EXISTS public.reader_beta_notes (
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    book_id text NOT NULL,
    notes jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS reader_beta_notes_user_id_idx ON public.reader_beta_notes (user_id);

ALTER TABLE public.reader_beta_notes ENABLE ROW LEVEL SECURITY;

-- PostgREST uses the anon role for browser requests; auth.uid() still comes from the user JWT when logged in.
DROP POLICY IF EXISTS "reader_beta_notes_select_own" ON public.reader_beta_notes;
CREATE POLICY "reader_beta_notes_select_own" ON public.reader_beta_notes
    FOR SELECT TO anon, authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reader_beta_notes_insert_own" ON public.reader_beta_notes;
CREATE POLICY "reader_beta_notes_insert_own" ON public.reader_beta_notes
    FOR INSERT TO anon, authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reader_beta_notes_update_own" ON public.reader_beta_notes;
CREATE POLICY "reader_beta_notes_update_own" ON public.reader_beta_notes
    FOR UPDATE TO anon, authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reader_beta_notes_delete_own" ON public.reader_beta_notes;
CREATE POLICY "reader_beta_notes_delete_own" ON public.reader_beta_notes
    FOR DELETE TO anon, authenticated
    USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reader_beta_notes TO anon, authenticated;

-- Optional: live updates in the beta reader sidebar (safe to ignore if it errors on re-run).
DO $reader_beta_notes_realtime$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reader_beta_notes;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$reader_beta_notes_realtime$;

-- Needed if you re-enable Realtime postgres_changes with filters on this table.
ALTER TABLE public.reader_beta_notes REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- RPC API (SECURITY DEFINER): use these if direct REST on reader_beta_notes still fails.
-- PostgREST: supabase.rpc('reader_beta_notes_get', { p_book_id: '...' }), etc.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reader_beta_notes_get(p_book_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (
            SELECT r.notes
            FROM public.reader_beta_notes r
            WHERE r.user_id = auth.uid()
              AND r.book_id = p_book_id
            LIMIT 1
        ),
        '[]'::jsonb
    );
$$;

-- jsonb via PostgREST RPC can 400 from some clients; accept JSON as text and cast.
DROP FUNCTION IF EXISTS public.reader_beta_notes_upsert(text, jsonb);
DROP FUNCTION IF EXISTS public.reader_beta_notes_upsert(text, text);

CREATE OR REPLACE FUNCTION public.reader_beta_notes_upsert(p_book_id text, p_notes_json text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_notes jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
    END IF;
    IF p_book_id IS NULL OR btrim(p_book_id) = '' THEN
        RAISE EXCEPTION 'invalid book_id' USING ERRCODE = '22023';
    END IF;
    BEGIN
        v_notes := COALESCE(NULLIF(btrim(COALESCE(p_notes_json, '')), ''), '[]')::jsonb;
    EXCEPTION
        WHEN invalid_text_representation THEN
            v_notes := '[]'::jsonb;
    END;
    IF jsonb_typeof(v_notes) <> 'array' THEN
        v_notes := '[]'::jsonb;
    END IF;
    INSERT INTO public.reader_beta_notes (user_id, book_id, notes, updated_at)
    VALUES (v_uid, p_book_id, v_notes, now())
    ON CONFLICT (user_id, book_id)
    DO UPDATE SET
        notes = EXCLUDED.notes,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.reader_beta_notes_list_maps()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (
            SELECT jsonb_object_agg(r.book_id, r.notes)
            FROM public.reader_beta_notes r
            WHERE r.user_id = auth.uid()
        ),
        '{}'::jsonb
    );
$$;

REVOKE ALL ON FUNCTION public.reader_beta_notes_get(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reader_beta_notes_get(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.reader_beta_notes_upsert(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reader_beta_notes_upsert(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.reader_beta_notes_list_maps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reader_beta_notes_list_maps() TO anon, authenticated;

-- Legacy highlights still stored on public.users (Firestore-era). Direct REST can be blocked by RLS
-- on users; this RPC reads only beta_read_notes_by_book for the signed-in user.
CREATE OR REPLACE FUNCTION public.reader_beta_notes_legacy_map()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (
            SELECT u.beta_read_notes_by_book
            FROM public.users u
            WHERE u.id = auth.uid()
            LIMIT 1
        ),
        '{}'::jsonb
    );
$$;

REVOKE ALL ON FUNCTION public.reader_beta_notes_legacy_map() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reader_beta_notes_legacy_map() TO anon, authenticated;
