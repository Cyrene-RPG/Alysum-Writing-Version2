-- Alysum core Supabase schema (run FIRST on a new project).
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS where needed.
--
-- Order after this file:
--   1. supabase-sibling-tables.sql
--   2. supabase-library-rls.sql
--   3. supabase-leaderboard.sql
--   4. supabase-plot-issues.sql
--   5. supabase-library-reports.sql (after library RLS)
--   6. supabase-staff-users.sql (after library reports — user browser RPCs)
--   6. supabase-staff-users.sql (after library reports)

-- ---------------------------------------------------------------------------
-- public.users — profile row keyed to auth.users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  firebase_uid text,
  username text NOT NULL DEFAULT 'user',
  display_name text NOT NULL DEFAULT 'user',
  email text,
  account_type text NOT NULL DEFAULT 'both',
  profile_image_url text,
  words integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  last_login text,
  daily_word_goal integer NOT NULL DEFAULT 2000,
  writing_day_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON public.users (lower(username));
CREATE INDEX IF NOT EXISTS users_firebase_uid_idx ON public.users (firebase_uid) WHERE firebase_uid IS NOT NULL;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_public" ON public.users;
CREATE POLICY "users_select_public" ON public.users
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

GRANT SELECT ON public.users TO anon, authenticated;
GRANT INSERT, UPDATE ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- public.books — author manuscripts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.books (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  firebase_uid text,
  title text NOT NULL DEFAULT 'Untitled',
  created bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  updated bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  words integer NOT NULL DEFAULT 0,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  library_type text,
  media_format text NOT NULL DEFAULT 'novel',
  published_chapter_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  publish_meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS books_user_id_idx ON public.books (user_id);
CREATE INDEX IF NOT EXISTS books_user_updated_idx ON public.books (user_id, updated DESC);
CREATE INDEX IF NOT EXISTS books_firebase_uid_idx ON public.books (firebase_uid) WHERE firebase_uid IS NOT NULL;

-- RLS for books is applied in supabase-library-rls.sql

-- ---------------------------------------------------------------------------
-- public.library — published catalog (JSON payload mirrors legacy Firestore)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_user_id_idx ON public.library (user_id);

-- RLS for library is applied in supabase-library-rls.sql

-- ---------------------------------------------------------------------------
-- public.notifications — author inbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON public.notifications (user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- Beta-share insert policy lives in supabase-sibling-tables.sql

-- ---------------------------------------------------------------------------
-- Storage: profile-pictures bucket (create bucket in Dashboard if this fails)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "profile_pictures_public_read" ON storage.objects;
CREATE POLICY "profile_pictures_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'profile-pictures');

DROP POLICY IF EXISTS "profile_pictures_insert_own" ON storage.objects;
CREATE POLICY "profile_pictures_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "profile_pictures_update_own" ON storage.objects;
CREATE POLICY "profile_pictures_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "profile_pictures_delete_own" ON storage.objects;
CREATE POLICY "profile_pictures_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
