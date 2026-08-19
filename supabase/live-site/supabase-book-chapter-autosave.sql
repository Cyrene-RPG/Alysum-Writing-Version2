-- Chapter-only editor autosave (patch one chapter in books.sections instead of the full JSON).
-- Safe to re-run in Supabase → SQL Editor.
-- Requires public.book_owned() from supabase-book-versions.sql (or equivalent).

CREATE OR REPLACE FUNCTION public.update_book_chapter(
  p_book_id text,
  p_section text,
  p_chapter_index integer,
  p_chapter jsonb,
  p_total_words integer DEFAULT NULL,
  p_updated bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sections jsonb;
  v_len integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.book_owned(p_book_id) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF p_section NOT IN ('front', 'body', 'back') THEN
    RAISE EXCEPTION 'invalid_section';
  END IF;

  IF p_chapter_index IS NULL OR p_chapter_index < 0 THEN
    RAISE EXCEPTION 'invalid_index';
  END IF;

  IF p_chapter IS NULL OR p_chapter = 'null'::jsonb THEN
    RAISE EXCEPTION 'invalid_chapter';
  END IF;

  SELECT b.sections INTO v_sections
  FROM public.books b
  WHERE b.id = p_book_id
    AND b.user_id = auth.uid()
  FOR UPDATE;

  IF v_sections IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF jsonb_typeof(v_sections -> p_section) <> 'array' THEN
    RAISE EXCEPTION 'invalid_section_array';
  END IF;

  v_len := jsonb_array_length(v_sections -> p_section);
  IF p_chapter_index >= v_len THEN
    RAISE EXCEPTION 'chapter_index_out_of_range';
  END IF;

  v_sections := jsonb_set(
    v_sections,
    ARRAY[p_section, p_chapter_index::text],
    p_chapter,
    false
  );

  UPDATE public.books
  SET
    sections = v_sections,
    words = COALESCE(p_total_words, words),
    updated = COALESCE(p_updated, (extract(epoch FROM now()) * 1000)::bigint)
  WHERE id = p_book_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_book_chapter(text, text, integer, jsonb, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_book_chapter(text, text, integer, jsonb, integer, bigint) TO authenticated;
