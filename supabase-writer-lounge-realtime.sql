-- Writer's Lounge — realtime, reactions, online members.
-- Run after supabase-writer-lounge.sql (and supabase-staff-users.sql for last_seen_at).

-- ---------------------------------------------------------------------------
-- 1. Reactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lounge_post_reactions (
  post_id uuid NOT NULL REFERENCES public.lounge_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS lounge_post_reactions_post_idx
  ON public.lounge_post_reactions (post_id);

-- ---------------------------------------------------------------------------
-- 2. Shared post JSON (includes reactions)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lounge_post_to_json(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post public.lounge_posts;
BEGIN
  SELECT * INTO v_post
  FROM public.lounge_posts p
  WHERE p.id = p_post_id
    AND p.status = 'visible';

  IF v_post.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', v_post.id,
      'threadId', v_post.thread_id,
      'authorId', v_post.author_id,
      'authorName', public.lounge_display_name(v_post.author_id),
      'authorInitials', public.lounge_user_initials(v_post.author_id),
      'authorJoinedAt', u.created_at,
      'authorPostCount', (
        SELECT count(*)::integer
        FROM public.lounge_posts ap
        WHERE ap.author_id = v_post.author_id
          AND ap.status = 'visible'
      ),
      'authorDailyGoal', coalesce(u.daily_word_goal, 2000),
      'authorTodayWords', coalesce(
        nullif(trim(u.writing_day_totals ->> to_char(current_date, 'YYYY-MM-DD')), '')::integer,
        0
      ),
      'quotePostId', v_post.quote_post_id,
      'quoteBody', (
        SELECT left(q.body, 240)
        FROM public.lounge_posts q
        WHERE q.id = v_post.quote_post_id
      ),
      'quoteAuthorName', (
        SELECT public.lounge_display_name(q.author_id)
        FROM public.lounge_posts q
        WHERE q.id = v_post.quote_post_id
      ),
      'body', v_post.body,
      'postNumber', v_post.post_number,
      'createdAt', v_post.created_at,
      'editedAt', v_post.edited_at,
      'reactions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted', r.me
        ) ORDER BY r.cnt DESC, r.emoji)
        FROM (
          SELECT
            lr.emoji,
            count(*)::integer AS cnt,
            bool_or(lr.user_id = auth.uid()) AS me
          FROM public.lounge_post_reactions lr
          WHERE lr.post_id = v_post.id
          GROUP BY lr.emoji
        ) r
      ), '[]'::jsonb)
    )
    FROM public.users u
    WHERE u.id = v_post.author_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lounge_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN public.lounge_post_to_json(p_post_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lounge_thread(
  p_thread_id uuid,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.lounge_threads;
  v_board public.lounge_boards;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer;
  v_total integer;
  v_posts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_thread
  FROM public.lounge_threads t
  WHERE t.id = p_thread_id
    AND t.status = 'open';

  IF v_thread.id IS NULL THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  SELECT * INTO v_board
  FROM public.lounge_boards b
  WHERE b.id = v_thread.board_id;

  UPDATE public.lounge_threads
  SET view_count = view_count + 1
  WHERE id = v_thread.id;

  v_thread.view_count := v_thread.view_count + 1;
  v_offset := (v_page - 1) * v_limit;

  SELECT count(*)::integer INTO v_total
  FROM public.lounge_posts p
  WHERE p.thread_id = v_thread.id
    AND p.status = 'visible';

  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'postNumber')::integer), '[]'::jsonb)
  INTO v_posts
  FROM (
    SELECT public.lounge_post_to_json(p.id) AS row
    FROM public.lounge_posts p
    WHERE p.thread_id = v_thread.id
      AND p.status = 'visible'
    ORDER BY p.post_number ASC
    OFFSET v_offset
    LIMIT v_limit
  ) rows;

  RETURN jsonb_build_object(
    'board', jsonb_build_object(
      'id', v_board.id,
      'slug', v_board.slug,
      'title', v_board.title,
      'description', v_board.description,
      'isLocked', v_board.is_locked,
      'canPost', public.can_post_lounge_board(v_board.id)
    ),
    'thread', jsonb_build_object(
      'id', v_thread.id,
      'title', v_thread.title,
      'authorId', v_thread.author_id,
      'authorName', public.lounge_display_name(v_thread.author_id),
      'replyCount', v_thread.reply_count,
      'viewCount', v_thread.view_count,
      'postCount', v_total,
      'isSticky', v_thread.is_sticky,
      'createdAt', v_thread.created_at,
      'status', v_thread.status
    ),
    'posts', v_posts,
    'pagination', jsonb_build_object(
      'page', v_page,
      'limit', v_limit,
      'total', v_total,
      'totalPages', greatest(ceil(v_total::numeric / v_limit)::integer, 1)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Toggle reaction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.toggle_lounge_reaction(
  p_post_id uuid,
  p_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emoji text := trim(p_emoji);
  v_thread_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_emoji = '' OR char_length(v_emoji) > 16 THEN
    RAISE EXCEPTION 'invalid_emoji';
  END IF;

  SELECT p.thread_id INTO v_thread_id
  FROM public.lounge_posts p
  JOIN public.lounge_threads t ON t.id = p.thread_id
  WHERE p.id = p_post_id
    AND p.status = 'visible'
    AND t.status = 'open';

  IF v_thread_id IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lounge_post_reactions r
    WHERE r.post_id = p_post_id
      AND r.user_id = auth.uid()
      AND r.emoji = v_emoji
  ) THEN
    DELETE FROM public.lounge_post_reactions r
    WHERE r.post_id = p_post_id
      AND r.user_id = auth.uid()
      AND r.emoji = v_emoji;
  ELSE
    INSERT INTO public.lounge_post_reactions (post_id, user_id, emoji)
    VALUES (p_post_id, auth.uid(), v_emoji);
  END IF;

  RETURN public.lounge_post_to_json(p_post_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Online members (all authenticated users)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_lounge_online_members(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_members jsonb;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM public.users u
  WHERE u.last_seen_at >= now() - interval '5 minutes';

  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'lastSeenAt') DESC), '[]'::jsonb)
  INTO v_members
  FROM (
    SELECT jsonb_build_object(
      'id', u.id,
      'name', public.lounge_display_name(u.id),
      'initials', public.lounge_user_initials(u.id),
      'isOnline', true,
      'lastSeenAt', u.last_seen_at
    ) AS row
    FROM public.users u
    WHERE u.last_seen_at >= now() - interval '5 minutes'
    ORDER BY u.last_seen_at DESC
    LIMIT v_limit
  ) online_rows;

  RETURN jsonb_build_object(
    'totalOnline', coalesce(v_total, 0),
    'members', v_members
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.lounge_post_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lounge_reactions_select_auth" ON public.lounge_post_reactions;
CREATE POLICY "lounge_reactions_select_auth" ON public.lounge_post_reactions
  FOR SELECT TO authenticated
  USING (true);

-- Mutations via SECURITY DEFINER RPC only.

-- ---------------------------------------------------------------------------
-- 6. Realtime publication
-- ---------------------------------------------------------------------------

DO $lounge_realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_posts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_post_reactions;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$lounge_realtime$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.lounge_post_reactions TO authenticated;
GRANT EXECUTE ON FUNCTION public.lounge_post_to_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lounge_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_lounge_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_lounge_online_members(integer) TO authenticated;
