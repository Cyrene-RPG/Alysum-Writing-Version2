-- Run once in Supabase → SQL Editor (safe to re-run).
-- Deletes publish-cooldown objects from the live database.
-- Does not drag-and-drop: copy this whole file, paste, Run.
-- Owner-only library insert stays. 500-word chapter rule is app code, not this SQL.

DROP TRIGGER IF EXISTS library_track_new_book_publish_trg ON public.library;

DROP POLICY IF EXISTS "library_insert_owner" ON public.library;
CREATE POLICY "library_insert_owner" ON public.library
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid())::text = user_id::text
    AND EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id::text = library.id::text
        AND b.user_id::text = (auth.uid())::text
    )
  );

DROP FUNCTION IF EXISTS public.moderation_review_publish_approval(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.moderation_list_publish_approvals(text);
DROP FUNCTION IF EXISTS public.moderation_grant_publish_bypass(uuid, text, text);
DROP FUNCTION IF EXISTS public.submit_publish_approval_request(text, text);
DROP FUNCTION IF EXISTS public.get_publish_eligibility(text);
DROP FUNCTION IF EXISTS public.publish_cooldown_allows(uuid, text);
DROP FUNCTION IF EXISTS public.publish_has_approved_bypass(uuid, text);
DROP FUNCTION IF EXISTS public.publish_is_new_library_listing(text);
DROP FUNCTION IF EXISTS public.user_account_created_at(uuid);
DROP FUNCTION IF EXISTS public.library_track_new_book_publish();

DROP TABLE IF EXISTS public.publish_approval_requests CASCADE;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS last_new_book_published_at;
