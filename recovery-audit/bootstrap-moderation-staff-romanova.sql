-- ============================================================================
-- STEP 3 ONLY — run AFTER supabase-library-reports.sql AND supabase-staff-users.sql
-- ============================================================================
-- User browser error "staff_search_users ... schema cache" means step 2 was skipped.
-- Run the FULL file: Alysum-Web/supabase-staff-users.sql
--
-- If you see: relation "public.moderation_staff" does not exist
-- you skipped step 1. Run: Alysum-Web/supabase-library-reports.sql
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
