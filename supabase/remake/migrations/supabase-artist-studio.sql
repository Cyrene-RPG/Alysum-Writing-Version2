-- Additive artist studio fields + image bucket.
-- Run AFTER supabase-artist-foundation.sql on staging. Safe to re-run.
-- Do not run against live production until you intend to.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS artist_bio text NOT NULL DEFAULT '';

ALTER TABLE public.artist_characters
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '';

ALTER TABLE public.artist_characters
  ADD COLUMN IF NOT EXISTS portrait_url text NOT NULL DEFAULT '';

ALTER TABLE public.artist_artworks
  ADD COLUMN IF NOT EXISTS public_url text NOT NULL DEFAULT '';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'artist-media',
  'artist-media',
  true,
  12582912,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 12582912,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS artist_media_public_read ON storage.objects;
CREATE POLICY artist_media_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'artist-media');

DROP POLICY IF EXISTS artist_media_insert_own ON storage.objects;
CREATE POLICY artist_media_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'artist-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS artist_media_delete_own ON storage.objects;
CREATE POLICY artist_media_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'artist-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

COMMIT;
