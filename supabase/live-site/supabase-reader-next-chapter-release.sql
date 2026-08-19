-- Run once in Supabase → SQL Editor (safe to re-run).
-- Public RPC: earliest pending chapter release for a published library book.
-- Apply after supabase-scheduled-chapter-releases.sql.

CREATE OR REPLACE FUNCTION public.get_next_chapter_release(p_book_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_title text := '';
  v_chapters jsonb;
BEGIN
  IF p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.library l
    WHERE l.id::text = p_book_id::text
      AND COALESCE((l.data->>'isPublished')::boolean, true) = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT scr.chapter_id, scr.scheduled_at
  INTO v_row
  FROM public.scheduled_chapter_releases scr
  WHERE scr.book_id = p_book_id
    AND scr.status = 'pending'
    AND scr.scheduled_at > now()
  ORDER BY scr.scheduled_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT l.data->'chapters'
  INTO v_chapters
  FROM public.library l
  WHERE l.id::text = p_book_id::text;

  IF v_chapters IS NOT NULL AND jsonb_typeof(v_chapters) = 'array' THEN
    SELECT COALESCE(elem->>'title', '')
    INTO v_title
    FROM jsonb_array_elements(v_chapters) AS elem
    WHERE elem->>'id' = v_row.chapter_id
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'chapterId', v_row.chapter_id,
    'scheduledAt', v_row.scheduled_at,
    'chapterTitle', COALESCE(NULLIF(trim(v_title), ''), 'Next chapter')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_chapter_release(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_chapter_release(text) TO anon, authenticated;
