-- Run once in Supabase → SQL Editor (safe to re-run).
-- Storage bucket for inline images embedded in novel chapter HTML.
-- Path: {user_id}/{book_id}/{chapter_id}/{timestamp}.{ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book-content-images',
  'book-content-images',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS "book_content_images_public_read" ON storage.objects;
CREATE POLICY "book_content_images_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'book-content-images');

DROP POLICY IF EXISTS "book_content_images_insert_own" ON storage.objects;
CREATE POLICY "book_content_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'book-content-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "book_content_images_update_own" ON storage.objects;
CREATE POLICY "book_content_images_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'book-content-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'book-content-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "book_content_images_delete_own" ON storage.objects;
CREATE POLICY "book_content_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'book-content-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
