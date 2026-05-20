-- Run once in Supabase → SQL Editor (safe to re-run).
-- Profile pictures: users.profile_pic_url + public storage bucket.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_pic_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-pictures',
    'profile-pictures',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "profile_pics_select_public" ON storage.objects;
CREATE POLICY "profile_pics_select_public" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'profile-pictures');

DROP POLICY IF EXISTS "profile_pics_insert_own" ON storage.objects;
CREATE POLICY "profile_pics_insert_own" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] = (auth.uid())::text
    );

DROP POLICY IF EXISTS "profile_pics_update_own" ON storage.objects;
CREATE POLICY "profile_pics_update_own" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] = (auth.uid())::text
    )
    WITH CHECK (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] = (auth.uid())::text
    );

DROP POLICY IF EXISTS "profile_pics_delete_own" ON storage.objects;
CREATE POLICY "profile_pics_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] = (auth.uid())::text
    );
