-- Run once in Supabase → SQL Editor (safe to re-run).
-- Creates the missing roadmap-attachments bucket used by bug report uploads.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('roadmap-attachments', 'roadmap-attachments', true, 26214400)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 26214400;

DROP POLICY IF EXISTS "roadmap_attachments_public_read" ON storage.objects;
CREATE POLICY "roadmap_attachments_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'roadmap-attachments');

DROP POLICY IF EXISTS "roadmap_attachments_insert_own" ON storage.objects;
CREATE POLICY "roadmap_attachments_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "roadmap_attachments_update_own" ON storage.objects;
CREATE POLICY "roadmap_attachments_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "roadmap_attachments_delete_own" ON storage.objects;
CREATE POLICY "roadmap_attachments_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
