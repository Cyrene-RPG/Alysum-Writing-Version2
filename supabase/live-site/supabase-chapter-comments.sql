-- Run once in Supabase → SQL Editor (safe to re-run).
-- Does not drag-and-drop: copy this whole file, paste, Run.
-- Staff may delete chapter comments. Public bucket for comment images.

DROP POLICY IF EXISTS "comments_delete_as_staff" ON public.comments;
CREATE POLICY "comments_delete_as_staff" ON public.comments
  FOR DELETE TO authenticated
  USING (public.is_moderation_staff());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comment-images',
  'comment-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS "comment_images_public_read" ON storage.objects;
CREATE POLICY "comment_images_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'comment-images');

DROP POLICY IF EXISTS "comment_images_insert_own" ON storage.objects;
CREATE POLICY "comment_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comment-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "comment_images_delete_own" ON storage.objects;
CREATE POLICY "comment_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'comment-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
