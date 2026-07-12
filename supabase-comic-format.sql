-- Run once in Supabase → SQL Editor (safe to re-run).
-- Adds media_format to books and a comic-pages storage bucket for page uploads.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS media_format text NOT NULL DEFAULT 'novel';

COMMENT ON COLUMN public.books.media_format IS
  'Content format: novel | manga | comic | manhwa';

-- ---------------------------------------------------------------------------
-- comic-pages storage bucket — page images per book
-- Path: {user_id}/{book_id}/{page_id}-{timestamp}.{ext}
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comic-pages',
  'comic-pages',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS "comic_pages_public_read" ON storage.objects;
CREATE POLICY "comic_pages_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'comic-pages');

DROP POLICY IF EXISTS "comic_pages_insert_own" ON storage.objects;
CREATE POLICY "comic_pages_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comic-pages'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "comic_pages_update_own" ON storage.objects;
CREATE POLICY "comic_pages_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comic-pages'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'comic-pages'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "comic_pages_delete_own" ON storage.objects;
CREATE POLICY "comic_pages_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'comic-pages'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
