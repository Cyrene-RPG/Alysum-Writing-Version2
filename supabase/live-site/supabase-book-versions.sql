-- Run once in Supabase → SQL Editor (safe to re-run).
-- Book version history: save, list, compare, restore manuscript snapshots.
-- Versions are never auto-deleted — only removed when the parent book row is deleted.
--
-- Uses md5() (built-in) for content_hash — no pgcrypto / extensions schema required.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.book_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  label text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto', 'checkpoint', 'structural')),
  word_count integer NOT NULL DEFAULT 0,
  media_format text NOT NULL DEFAULT 'novel',
  title text NOT NULL DEFAULT 'Untitled',
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS book_versions_book_id_idx
  ON public.book_versions (book_id, created_at DESC);

CREATE INDEX IF NOT EXISTS book_versions_user_id_idx
  ON public.book_versions (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.book_version_owned(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.book_versions bv
    WHERE bv.id = p_version_id
      AND bv.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.book_owned(p_book_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.books b
    WHERE b.id::text = p_book_id
      AND b.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

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
  v_ch jsonb;
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

CREATE OR REPLACE FUNCTION public.list_book_versions(
  p_book_id text,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  book_id text,
  created_at timestamptz,
  label text,
  source text,
  word_count integer,
  media_format text,
  title text,
  content_hash text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.book_owned(p_book_id) THEN
    RAISE EXCEPTION 'book_not_found';
  END IF;

  RETURN QUERY
  SELECT
    bv.id,
    bv.book_id,
    bv.created_at,
    bv.label,
    bv.source,
    bv.word_count,
    bv.media_format,
    bv.title,
    bv.content_hash
  FROM public.book_versions bv
  WHERE bv.book_id = p_book_id
    AND bv.user_id = v_uid
  ORDER BY bv.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_book_version(p_version_id uuid)
RETURNS public.book_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.book_versions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.book_versions
  WHERE id = p_version_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_not_found';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_book_version(
  p_version_id uuid,
  p_mode text DEFAULT 'full',
  p_chapter_id text DEFAULT ''
)
RETURNS public.books
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_version public.book_versions%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_mode text := lower(trim(coalesce(p_mode, 'full')));
  v_sections jsonb;
  v_chapter_id text := trim(coalesce(p_chapter_id, ''));
  v_src_ch jsonb;
  v_found boolean := false;
  v_sec text;
  v_arr jsonb;
  v_i integer;
  v_elem jsonb;
  v_new_arr jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_version
  FROM public.book_versions
  WHERE id = p_version_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_not_found';
  END IF;

  SELECT * INTO v_book
  FROM public.books
  WHERE id::text = v_version.book_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'book_not_found';
  END IF;

  -- Checkpoint current manuscript before any restore (never deleted automatically).
  PERFORM public.create_book_version(
    v_version.book_id,
    'Before restore',
    'checkpoint'
  );

  IF v_mode = 'chapter' THEN
    IF v_chapter_id = '' THEN
      RAISE EXCEPTION 'chapter_id_required';
    END IF;

    v_sections := COALESCE(v_book.sections, '{}'::jsonb);

    FOR v_sec IN SELECT unnest(ARRAY['front', 'body', 'back'])
    LOOP
      v_arr := COALESCE(v_sections->v_sec, '[]'::jsonb);
      FOR v_i IN 0 .. jsonb_array_length(v_arr) - 1
      LOOP
        IF (v_arr->v_i->>'id') = v_chapter_id THEN
          v_found := true;
          EXIT;
        END IF;
      END LOOP;
      EXIT WHEN v_found;
    END LOOP;

    IF NOT v_found THEN
      RAISE EXCEPTION 'chapter_not_in_current';
    END IF;

    v_src_ch := NULL;
    FOR v_sec IN SELECT unnest(ARRAY['front', 'body', 'back'])
    LOOP
      v_arr := COALESCE(v_version.sections->v_sec, '[]'::jsonb);
      FOR v_i IN 0 .. jsonb_array_length(v_arr) - 1
      LOOP
        IF (v_arr->v_i->>'id') = v_chapter_id THEN
          v_src_ch := v_arr->v_i;
          EXIT;
        END IF;
      END LOOP;
      EXIT WHEN v_src_ch IS NOT NULL;
    END LOOP;

    IF v_src_ch IS NULL THEN
      RAISE EXCEPTION 'chapter_not_in_version';
    END IF;

    v_found := false;
    FOR v_sec IN SELECT unnest(ARRAY['front', 'body', 'back'])
    LOOP
      v_arr := COALESCE(v_sections->v_sec, '[]'::jsonb);
      v_new_arr := '[]'::jsonb;
      FOR v_i IN 0 .. jsonb_array_length(v_arr) - 1
      LOOP
        v_elem := v_arr->v_i;
        IF (v_elem->>'id') = v_chapter_id THEN
          v_new_arr := v_new_arr || jsonb_build_array(v_src_ch);
          v_found := true;
        ELSE
          v_new_arr := v_new_arr || jsonb_build_array(v_elem);
        END IF;
      END LOOP;
      IF v_found THEN
        v_sections := jsonb_set(v_sections, ARRAY[v_sec], v_new_arr, true);
        EXIT;
      END IF;
    END LOOP;

    UPDATE public.books
    SET
      sections = v_sections,
      updated = (extract(epoch from now()) * 1000)::bigint
    WHERE id::text = v_version.book_id
      AND user_id = v_uid
    RETURNING * INTO v_book;

    RETURN v_book;
  END IF;

  IF v_mode <> 'full' THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  IF COALESCE(v_version.media_format, 'novel') <> COALESCE(v_book.media_format, 'novel') THEN
    RAISE EXCEPTION 'media_format_mismatch';
  END IF;

  UPDATE public.books
  SET
    title = v_version.title,
    sections = v_version.sections,
    words = v_version.word_count,
    updated = (extract(epoch from now()) * 1000)::bigint
  WHERE id::text = v_version.book_id
    AND user_id = v_uid
  RETURNING * INTO v_book;

  RETURN v_book;
END;
$$;

REVOKE ALL ON FUNCTION public.book_version_owned(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_owned(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_book_version(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_book_versions(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_book_version(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_book_version(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.book_version_owned(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_owned(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_book_version(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_book_versions(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_book_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_book_version(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.book_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_versions_select_own" ON public.book_versions;
CREATE POLICY "book_versions_select_own" ON public.book_versions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "book_versions_insert_own" ON public.book_versions;
CREATE POLICY "book_versions_insert_own" ON public.book_versions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE or DELETE policies — versions are immutable and never pruned.

GRANT SELECT, INSERT ON public.book_versions TO authenticated;
