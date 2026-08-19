-- Batch read counts for the public library (replaces N+1 per-book count queries).
-- Safe to re-run in Supabase → SQL Editor.

CREATE OR REPLACE FUNCTION public.get_library_read_counts(p_book_ids text[])
RETURNS TABLE(book_id text, read_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.book_id, COUNT(*)::bigint AS read_count
  FROM public.reads r
  WHERE p_book_ids IS NOT NULL
    AND cardinality(p_book_ids) > 0
    AND r.book_id = ANY(p_book_ids)
  GROUP BY r.book_id;
$$;

REVOKE ALL ON FUNCTION public.get_library_read_counts(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_library_read_counts(text[]) TO anon, authenticated;
