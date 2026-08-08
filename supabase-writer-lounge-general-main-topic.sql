-- Run once in Supabase → SQL Editor (safe to re-run).
-- Seeds the sticky "General Main topic" thread under General Chat.
-- Requires supabase-writer-lounge.sql (general-chat board + seed function).

CREATE OR REPLACE FUNCTION public.seed_lounge_general_main_topic()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board_id uuid;
  v_author_id uuid;
  v_thread_id uuid;
  v_body text := $body$
Welcome to General Chat — the place for off-topic banter, life updates, memes, and anything that doesn't fit the other boards.

Reply here to say hi, share what you're working on, or just hang out. Be kind. No full manuscripts or critique requests — use Beta rooms for that.

This thread stays pinned so newcomers always have a front door.
$body$;
BEGIN
  SELECT b.id INTO v_board_id
  FROM public.lounge_boards b
  WHERE b.slug = 'general-chat';

  IF v_board_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT t.id INTO v_thread_id
  FROM public.lounge_threads t
  WHERE t.board_id = v_board_id
    AND lower(trim(t.title)) = lower('General Main topic')
    AND t.status <> 'deleted'
  LIMIT 1;

  IF v_thread_id IS NOT NULL THEN
    UPDATE public.lounge_threads
    SET is_sticky = true
    WHERE id = v_thread_id
      AND NOT is_sticky;
    RETURN v_thread_id;
  END IF;

  IF to_regclass('public.moderation_staff') IS NOT NULL THEN
    SELECT ms.user_id INTO v_author_id
    FROM public.moderation_staff ms
    ORDER BY
      CASE ms.role
        WHEN 'admin' THEN 0
        WHEN 'moderator' THEN 1
        ELSE 2
      END,
      ms.created_at ASC
    LIMIT 1;
  END IF;

  IF v_author_id IS NULL THEN
    SELECT u.id INTO v_author_id
    FROM public.users u
    ORDER BY u.created_at ASC
    LIMIT 1;
  END IF;

  IF v_author_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.lounge_threads (
    board_id,
    author_id,
    title,
    status,
    is_sticky,
    is_announcement,
    reply_count,
    last_post_at,
    last_post_by
  )
  VALUES (
    v_board_id,
    v_author_id,
    'General Main topic',
    'open',
    true,
    false,
    0,
    now(),
    v_author_id
  )
  RETURNING id INTO v_thread_id;

  INSERT INTO public.lounge_posts (
    thread_id,
    board_id,
    author_id,
    body,
    post_number
  )
  VALUES (
    v_thread_id,
    v_board_id,
    v_author_id,
    trim(v_body),
    1
  );

  RETURN v_thread_id;
END;
$$;

SELECT public.seed_lounge_general_main_topic();
