-- ============================================================================
-- STEP 2 ONLY — run AFTER supabase-library-reports.sql
-- ============================================================================
-- If you see: relation "public.moderation_staff" does not exist
-- you skipped step 1. Run the FULL migration first:
--   Alysum-Web/supabase-library-reports.sql  (~1470 lines)
-- in Supabase → SQL Editor → New query → paste entire file → Run
--
-- SQL Editor: https://supabase.com/dashboard/project/jrfxgpkpbacajhcwimgz/sql/new
-- ============================================================================

INSERT INTO public.moderation_staff (user_id, role, created_by)
VALUES (
  '3ce04b19-0cbc-45f8-88f5-5ac18c8ba6a5',
  'admin',
  '3ce04b19-0cbc-45f8-88f5-5ac18c8ba6a5'
)
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role;
