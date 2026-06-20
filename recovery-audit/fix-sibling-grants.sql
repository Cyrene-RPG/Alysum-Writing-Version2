-- Run once in Supabase → SQL Editor (safe to re-run).
-- Fixes permission-denied errors for beta note sharing, prompt notebook, and story bible cloud sync.

GRANT INSERT ON public.notifications TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_shares_index TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_characters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bible_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_profile_sheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worldbuilding_workbooks TO authenticated;

DROP POLICY IF EXISTS "notifications_update_beta_share_reader" ON public.notifications;
CREATE POLICY "notifications_update_beta_share_reader" ON public.notifications
  FOR UPDATE TO authenticated
  USING (coalesce(data->>'readerUid', '') = (auth.uid())::text)
  WITH CHECK (coalesce(data->>'readerUid', '') = (auth.uid())::text);
