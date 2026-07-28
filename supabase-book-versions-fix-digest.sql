-- Quick fix if create_book_version fails with:
--   function digest(text, unknown) does not exist
-- Run once in Supabase → SQL Editor (safe to re-run).

CREATE OR REPLACE FUNCTION public.create_book_version(
  p_book_id text,
  p_label text DEFAULT '',
  p_source text DEFAULT 'manual'
)
RETURNS public.book_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_book public.books%ROWTYPE;
  v_sections jsonb;
  v_words integer := 0;
  v_source text := lower(trim(coalesce(p_source, 'manual')));
  v_row public.book_versions;
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_source NOT IN ('manual', 'auto', 'checkpoint', 'structural') THEN
    v_source := 'manual';
  END IF;

  SELECT * INTO v_book
  FROM public.books
  WHERE id::text = p_book_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'book_not_found';
  END IF;

  v_sections := COALESCE(v_book.sections, '{}'::jsonb);
  v_words := COALESCE(v_book.words, 0);
  v_hash := md5(v_sections::text);

  INSERT INTO public.book_versions (
    book_id,
    user_id,
    label,
    source,
    word_count,
    media_format,
    title,
    sections,
    content_hash
  )
  VALUES (
    p_book_id,
    v_uid,
    COALESCE(NULLIF(trim(p_label), ''), ''),
    v_source,
    v_words,
    COALESCE(NULLIF(trim(v_book.media_format), ''), 'novel'),
    COALESCE(NULLIF(trim(v_book.title), ''), 'Untitled'),
    v_sections,
    v_hash
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_book_version(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_book_version(text, text, text) TO authenticated;
