-- Run once in Supabase → SQL Editor (safe to re-run).
-- Fixes: missing users.last_login (studio profile load) + books/library RLS (empty book list).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login text;

-- books — authors read/write their own manuscripts
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'books'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.books', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "books_select_own" ON public.books;
CREATE POLICY "books_select_own" ON public.books
  FOR SELECT TO authenticated
  USING ((auth.uid())::text = user_id::text);

DROP POLICY IF EXISTS "books_insert_own" ON public.books;
CREATE POLICY "books_insert_own" ON public.books
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid())::text = user_id::text);

DROP POLICY IF EXISTS "books_update_own" ON public.books;
CREATE POLICY "books_update_own" ON public.books
  FOR UPDATE TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

DROP POLICY IF EXISTS "books_delete_own" ON public.books;
CREATE POLICY "books_delete_own" ON public.books
  FOR DELETE TO authenticated
  USING ((auth.uid())::text = user_id::text);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;

-- library — public reads for homepage catalog
ALTER TABLE public.library ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'library'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.library', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "library_select_public" ON public.library;
CREATE POLICY "library_select_public" ON public.library
  FOR SELECT TO anon, authenticated
  USING (COALESCE((data->>'isPublished')::boolean, true) = true);

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

DROP POLICY IF EXISTS "library_update_owner" ON public.library;
CREATE POLICY "library_update_owner" ON public.library
  FOR UPDATE TO authenticated
  USING (
    (auth.uid())::text = user_id::text
    OR EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id::text = library.id::text
        AND b.user_id::text = (auth.uid())::text
    )
  )
  WITH CHECK (
    (auth.uid())::text = user_id::text
    AND EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id::text = library.id::text
        AND b.user_id::text = (auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "library_delete_owner" ON public.library;
CREATE POLICY "library_delete_owner" ON public.library
  FOR DELETE TO authenticated
  USING (
    (auth.uid())::text = user_id::text
    OR EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id::text = library.id::text
        AND b.user_id::text = (auth.uid())::text
    )
  );

GRANT SELECT ON public.library TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.library TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_library_views(p_book_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.library
  SET data = jsonb_set(
    COALESCE(data, '{}'::jsonb),
    '{views}',
    to_jsonb(GREATEST(COALESCE((data->>'views')::bigint, 0) + 1, 0)),
    true
  )
  WHERE id::text = p_book_id
    AND COALESCE((data->>'isPublished')::boolean, true) = true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_library_views(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_library_views(text) TO anon, authenticated;
