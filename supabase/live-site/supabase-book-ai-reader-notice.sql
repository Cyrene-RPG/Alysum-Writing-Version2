-- Run after supabase-book-reports-v2.sql in the live Supabase SQL Editor.
-- Additive and safe to rerun. Returns a threshold flag, never private reports or identities.
BEGIN;
CREATE INDEX IF NOT EXISTS book_reports_v2_ai_notice_idx
 ON public.book_reports_v2(book_id,reporter_id)
 WHERE reason='suspected_ai' AND status<>'dismissed' AND reporter_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.book_reports_v2_ai_notice(p_book_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE owner_id uuid;
BEGIN
 -- Honor the same published/hidden/removed access rules as the reading API.
 IF NOT EXISTS(SELECT 1 FROM public.get_published_book(p_book_id)) THEN RETURN false; END IF;
 SELECT l.user_id INTO owner_id FROM public.library l WHERE l.id::text=p_book_id;
 IF NOT FOUND OR owner_id IS NULL THEN RETURN false; END IF;
 -- Read the real owner, including anonymous publications; do not expose that identity.
 IF auth.uid()=owner_id THEN RETURN false; END IF;
 RETURN (SELECT count(*)=2 FROM (
  SELECT DISTINCT r.reporter_id FROM public.book_reports_v2 r
  WHERE r.book_id=p_book_id AND r.reason='suspected_ai' AND r.status<>'dismissed'
   AND r.reporter_id IS NOT NULL AND r.reporter_id<>owner_id
  LIMIT 2
 ) reporters);
END $$;
REVOKE ALL ON FUNCTION public.book_reports_v2_ai_notice(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.book_reports_v2_ai_notice(text) TO anon,authenticated;
COMMIT;
