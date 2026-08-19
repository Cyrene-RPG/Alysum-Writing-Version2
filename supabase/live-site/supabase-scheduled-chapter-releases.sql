-- Run once in Supabase → SQL Editor (safe to re-run).
-- Scheduled chapter releases: authors can publish some chapters immediately and
-- schedule others to go live at a future date/time.
-- Apply after supabase-library-rls.sql and supabase-publish-cooldown.sql.
-- Re-run this file after pulling scheduling fixes so process/sync RPCs stay current.

-- ---------------------------------------------------------------------------
-- 1. Queue table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scheduled_chapter_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  chapter_id text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS scheduled_chapter_releases_book_idx
  ON public.scheduled_chapter_releases (book_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS scheduled_chapter_releases_due_idx
  ON public.scheduled_chapter_releases (status, scheduled_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_chapter_releases_pending_uidx
  ON public.scheduled_chapter_releases (book_id, chapter_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.scheduled_chapter_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_releases_select_own" ON public.scheduled_chapter_releases;
CREATE POLICY "scheduled_releases_select_own" ON public.scheduled_chapter_releases
  FOR SELECT TO authenticated
  USING ((auth.uid())::text = user_id::text);

DROP POLICY IF EXISTS "scheduled_releases_insert_own" ON public.scheduled_chapter_releases;
CREATE POLICY "scheduled_releases_insert_own" ON public.scheduled_chapter_releases
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid())::text = user_id::text);

DROP POLICY IF EXISTS "scheduled_releases_update_own" ON public.scheduled_chapter_releases;
CREATE POLICY "scheduled_releases_update_own" ON public.scheduled_chapter_releases
  FOR UPDATE TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

DROP POLICY IF EXISTS "scheduled_releases_delete_own" ON public.scheduled_chapter_releases;
CREATE POLICY "scheduled_releases_delete_own" ON public.scheduled_chapter_releases
  FOR DELETE TO authenticated
  USING ((auth.uid())::text = user_id::text);

-- ---------------------------------------------------------------------------
-- 3. List pending schedules for a book (author)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_scheduled_chapter_releases(p_book_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RAISE EXCEPTION 'Missing book id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id::text = p_book_id::text
      AND b.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Book not found or not owned by you';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', scr.id,
          'chapterId', scr.chapter_id,
          'scheduledAt', scr.scheduled_at,
          'status', scr.status,
          'createdAt', scr.created_at
        )
        ORDER BY scr.scheduled_at ASC
      )
      FROM public.scheduled_chapter_releases scr
      WHERE scr.book_id = p_book_id
        AND scr.user_id = v_user_id
        AND scr.status = 'pending'
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_scheduled_chapter_releases(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cancel a pending schedule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_scheduled_chapter_release(p_schedule_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT scr.id, scr.book_id, scr.chapter_id, scr.status
  INTO v_row
  FROM public.scheduled_chapter_releases scr
  WHERE scr.id = p_schedule_id
    AND scr.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found';
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN false;
  END IF;

  UPDATE public.scheduled_chapter_releases
  SET status = 'cancelled', cancelled_at = now()
  WHERE id = p_schedule_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_scheduled_chapter_release(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Process due releases (callable by anyone — only flips past-due rows)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_due_chapter_releases(p_book_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_lib record;
  v_data jsonb;
  v_published_ids jsonb;
  v_released_count int := 0;
  v_released_chapters jsonb := '[]'::jsonb;
BEGIN
  FOR v_row IN
    SELECT scr.id, scr.user_id, scr.book_id, scr.chapter_id, scr.scheduled_at
    FROM public.scheduled_chapter_releases scr
    WHERE scr.status = 'pending'
      AND scr.scheduled_at <= now()
      AND (p_book_id IS NULL OR scr.book_id = p_book_id)
    ORDER BY scr.scheduled_at ASC
    FOR UPDATE OF scr
  LOOP
    SELECT lib.id, lib.data
    INTO v_lib
    FROM public.library lib
    WHERE lib.id::text = v_row.book_id::text;

    IF NOT FOUND THEN
      UPDATE public.scheduled_chapter_releases
      SET status = 'cancelled', cancelled_at = now()
      WHERE id = v_row.id;
      CONTINUE;
    END IF;

    v_data := COALESCE(v_lib.data, '{}'::jsonb);
    v_published_ids := COALESCE(v_data->'publishedChapterIds', v_data->'published_chapter_ids', '[]'::jsonb);
    IF jsonb_typeof(v_published_ids) <> 'array' THEN
      v_published_ids := '[]'::jsonb;
    END IF;

    IF NOT (v_published_ids @> jsonb_build_array(v_row.chapter_id)) THEN
      v_published_ids := v_published_ids || jsonb_build_array(v_row.chapter_id);
      v_data := jsonb_set(v_data, '{publishedChapterIds}', v_published_ids, true);
      v_data := jsonb_set(
        v_data,
        '{updated}',
        to_jsonb((extract(epoch from now()) * 1000)::bigint),
        true
      );

      UPDATE public.library
      SET data = v_data, updated_at = now()
      WHERE id::text = v_row.book_id::text;

      UPDATE public.books
      SET
        published_chapter_ids = v_published_ids,
        updated = (extract(epoch from now()) * 1000)::bigint
      WHERE id::text = v_row.book_id::text;
    END IF;

    UPDATE public.scheduled_chapter_releases
    SET status = 'executed', executed_at = now()
    WHERE id = v_row.id;

    v_released_count := v_released_count + 1;
    v_released_chapters := v_released_chapters || jsonb_build_object(
      'bookId', v_row.book_id,
      'chapterId', v_row.chapter_id,
      'scheduledAt', v_row.scheduled_at
    );
  END LOOP;

  RETURN jsonb_build_object(
    'releasedCount', v_released_count,
    'released', v_released_chapters
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_due_chapter_releases(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Upsert schedules after publish (author)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_scheduled_chapter_releases(
  p_book_id text,
  p_schedules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_chapter_id text;
  v_scheduled_at timestamptz;
  v_inserted int := 0;
  v_cancelled int := 0;
  v_keep_ids text[] := ARRAY[]::text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RAISE EXCEPTION 'Missing book id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id::text = p_book_id::text
      AND b.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Book not found or not owned by you';
  END IF;

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array' THEN
    p_schedules := '[]'::jsonb;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_schedules)
  LOOP
    v_chapter_id := trim(COALESCE(v_item->>'chapterId', v_item->>'chapter_id', ''));
    IF v_chapter_id = '' THEN
      CONTINUE;
    END IF;

    BEGIN
      v_scheduled_at := COALESCE(v_item->>'scheduledAt', v_item->>'scheduled_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid scheduledAt for chapter %', v_chapter_id;
    END;

    IF v_scheduled_at IS NULL THEN
      CONTINUE;
    END IF;

    IF v_scheduled_at <= now() + interval '5 minutes' THEN
      RAISE EXCEPTION 'Scheduled release for chapter % must be at least 5 minutes in the future', v_chapter_id;
    END IF;

    v_keep_ids := array_append(v_keep_ids, v_chapter_id);

    UPDATE public.scheduled_chapter_releases
    SET scheduled_at = v_scheduled_at
    WHERE book_id = p_book_id
      AND chapter_id = v_chapter_id
      AND user_id = v_user_id
      AND status = 'pending';

    IF NOT FOUND THEN
      BEGIN
        INSERT INTO public.scheduled_chapter_releases (
          user_id, book_id, chapter_id, scheduled_at, status
        )
        VALUES (v_user_id, p_book_id, v_chapter_id, v_scheduled_at, 'pending');
      EXCEPTION WHEN unique_violation THEN
        UPDATE public.scheduled_chapter_releases
        SET scheduled_at = v_scheduled_at
        WHERE book_id = p_book_id
          AND chapter_id = v_chapter_id
          AND user_id = v_user_id
          AND status = 'pending';
      END;
    END IF;

    v_inserted := v_inserted + 1;
  END LOOP;

  UPDATE public.scheduled_chapter_releases scr
  SET status = 'cancelled', cancelled_at = now()
  WHERE scr.book_id = p_book_id
    AND scr.user_id = v_user_id
    AND scr.status = 'pending'
    AND NOT (scr.chapter_id = ANY (v_keep_ids));

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  RETURN jsonb_build_object(
    'upserted', v_inserted,
    'cancelledStale', v_cancelled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_scheduled_chapter_releases(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Optional: pg_cron job (enable pg_cron in Supabase Dashboard first)
--    Releases also run from /api/book-content and /api/process-due-chapter-releases.
-- ---------------------------------------------------------------------------
-- SELECT cron.schedule(
--   'process-due-chapter-releases',
--   '* * * * *',
--   $$SELECT public.process_due_chapter_releases(NULL);$$
-- );
