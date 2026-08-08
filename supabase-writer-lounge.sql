-- Run once in Supabase → SQL Editor (safe to re-run).
-- Writer's Lounge: community forum boards, threads, and posts.
-- Apply after supabase-base-schema.sql (uses public.users).
-- Optional: supabase-library-reports.sql for is_moderation_staff() on locked boards.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lounge_categories (
  id smallserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.lounge_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id smallint NOT NULL REFERENCES public.lounge_categories (id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lounge_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.lounge_boards (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'locked', 'hidden', 'deleted')),
  is_sticky boolean NOT NULL DEFAULT false,
  is_announcement boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  last_post_at timestamptz,
  last_post_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lounge_threads_board_idx
  ON public.lounge_threads (board_id, is_sticky DESC, last_post_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS lounge_threads_open_idx
  ON public.lounge_threads (board_id, status)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.lounge_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.lounge_threads (id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES public.lounge_boards (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  quote_post_id uuid REFERENCES public.lounge_posts (id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 12000),
  status text NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'hidden', 'deleted')),
  post_number integer NOT NULL CHECK (post_number >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS lounge_posts_thread_idx
  ON public.lounge_posts (thread_id, post_number ASC);

CREATE INDEX IF NOT EXISTS lounge_posts_board_idx
  ON public.lounge_posts (board_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS lounge_posts_thread_number_uidx
  ON public.lounge_posts (thread_id, post_number);

-- ---------------------------------------------------------------------------
-- 2. Seed categories and boards
-- ---------------------------------------------------------------------------

INSERT INTO public.lounge_categories (slug, title, sort_order)
VALUES
  ('need-to-know', 'Stuff you need to know', 10),
  ('writing-life', 'The writing life', 20),
  ('community', 'Community', 30),
  ('genre', 'Genre forums', 40)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.lounge_boards (category_id, slug, title, description, sort_order, is_locked)
SELECT c.id, v.slug, v.title, v.description, v.sort_order, v.is_locked
FROM (
  VALUES
    ('need-to-know', 'announcements', 'Announcements & Pep Talks', 'Official news, season rules, and encouragement from the Alysum team.', 10, true),
    ('writing-life', 'word-count-hype', 'Word Count Hype', 'Daily check-ins. Brag, whimper, or confess — all counts welcome.', 10, false),
    ('writing-life', 'ate-my-soul', 'Ate My Soul', 'Writing broke your brain today? You''re in good company.', 20, false),
    ('writing-life', 'reference-desk', 'Reference Desk', 'Craft questions, research help, and "how do I fix this?" threads.', 30, false),
    ('writing-life', 'reaching-your-goal', 'Reaching Your Goal', 'Planning, pacing, streaks, and strategies for hitting your target.', 40, false),
    ('community', 'general-chat', 'General Chat', 'Anything goes — life updates, writing-adjacent rambles, and off-topic banter.', 5, false),
    ('community', 'find-a-buddy', 'Find a Writing Buddy', 'Post your timezone, genre, and what kind of accountability you want.', 10, false),
    ('community', 'come-write-in', 'Come Write In', 'Schedule write-ins and link Word Wars sprints.', 20, false),
    ('genre', 'fantasy', 'Fantasy', 'Swords, sorcery, and soft magic debates.', 10, false),
    ('genre', 'romance', 'Romance', 'Heat levels, beats, and HEA logistics.', 20, false),
    ('genre', 'sci-fi', 'Sci-Fi', 'Space opera, cyberpunk, near-future, and astrophysics headaches.', 30, false),
    ('genre', 'mystery-thriller', 'Mystery & Thriller', 'Clues, red herrings, and the art of the reveal.', 40, false),
    ('genre', 'horror', 'Horror', 'Dread, gore levels, and things that go bump in the draft.', 50, false),
    ('genre', 'literary-fiction', 'Literary Fiction', 'Character study, prose experiments, and quiet devastation.', 60, false),
    ('genre', 'historical-fiction', 'Historical Fiction', 'Period research, anachronisms, and corset logistics.', 70, false),
    ('genre', 'young-adult', 'Young Adult', 'Teen voices, coming-of-age beats, and age-appropriate stakes.', 80, false),
    ('genre', 'contemporary', 'Contemporary', 'Present-day settings, real-world themes, and kitchen-sink drama.', 90, false),
    ('genre', 'fanfiction', 'Fanfiction', 'Transformative works, AU brainstorming, and canon debates.', 100, false)
) AS v(category_slug, slug, title, description, sort_order, is_locked)
JOIN public.lounge_categories c ON c.slug = v.category_slug
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_locked = EXCLUDED.is_locked;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_lounge_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regprocedure('public.is_moderation_staff()') IS NOT NULL THEN
    RETURN public.is_moderation_staff();
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_post_lounge_board(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lounge_boards b
    WHERE b.id = p_board_id
      AND (
        NOT b.is_locked
        OR public.is_lounge_staff()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.lounge_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(u.display_name), ''),
    nullif(trim(u.username), ''),
    'Writer'
  )
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.lounge_user_initials(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(
    left(
      coalesce(
        nullif(regexp_replace(trim(u.display_name), '[^A-Za-z0-9]', '', 'g'), ''),
        nullif(regexp_replace(trim(u.username), '[^A-Za-z0-9]', '', 'g'), ''),
        'WR'
      ),
      2
    )
  )
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_lounge_home()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categories jsonb;
  v_stats jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT coalesce(jsonb_agg(cat ORDER BY cat->>'sortOrder'), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'title', c.title,
      'sortOrder', c.sort_order,
      'boards', (
        SELECT coalesce(jsonb_agg(board ORDER BY board->>'sortOrder'), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'id', b.id,
            'slug', b.slug,
            'title', b.title,
            'description', b.description,
            'sortOrder', b.sort_order,
            'isLocked', b.is_locked,
            'topicCount', (
              SELECT count(*)::integer
              FROM public.lounge_threads t
              WHERE t.board_id = b.id
                AND t.status = 'open'
            ),
            'postCount', (
              SELECT count(*)::integer
              FROM public.lounge_posts p
              WHERE p.board_id = b.id
                AND p.status = 'visible'
            ),
            'lastPost', (
              SELECT jsonb_build_object(
                'threadId', t.id,
                'threadTitle', t.title,
                'authorId', p.author_id,
                'authorName', public.lounge_display_name(p.author_id),
                'postedAt', p.created_at
              )
              FROM public.lounge_posts p
              JOIN public.lounge_threads t ON t.id = p.thread_id
              WHERE p.board_id = b.id
                AND p.status = 'visible'
                AND t.status = 'open'
              ORDER BY p.created_at DESC
              LIMIT 1
            )
          ) AS board
          FROM public.lounge_boards b
          WHERE b.category_id = c.id
        ) boards
      )
    ) AS cat
    FROM public.lounge_categories c
  ) categories;

  SELECT jsonb_build_object(
    'memberCount', (SELECT count(*)::integer FROM public.users),
    'topicCount', (
      SELECT count(*)::integer
      FROM public.lounge_threads t
      WHERE t.status = 'open'
    ),
    'postCount', (
      SELECT count(*)::integer
      FROM public.lounge_posts p
      WHERE p.status = 'visible'
    )
  )
  INTO v_stats;

  RETURN jsonb_build_object(
    'categories', v_categories,
    'stats', v_stats
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_lounge_threads(
  p_board_slug text,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board public.lounge_boards;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer;
  v_total integer;
  v_threads jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_board
  FROM public.lounge_boards b
  WHERE b.slug = p_board_slug;

  IF v_board.id IS NULL THEN
    RAISE EXCEPTION 'board_not_found';
  END IF;

  v_offset := (v_page - 1) * v_limit;

  SELECT count(*)::integer INTO v_total
  FROM public.lounge_threads t
  WHERE t.board_id = v_board.id
    AND t.status = 'open';

  SELECT coalesce(jsonb_agg(row ORDER BY row->>'sortKey'), '[]'::jsonb)
  INTO v_threads
  FROM (
    SELECT jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'authorId', t.author_id,
      'authorName', public.lounge_display_name(t.author_id),
      'isSticky', t.is_sticky,
      'isAnnouncement', t.is_announcement,
      'replyCount', t.reply_count,
      'viewCount', t.view_count,
      'createdAt', t.created_at,
      'lastPostAt', coalesce(t.last_post_at, t.created_at),
      'lastPostBy', t.last_post_by,
      'lastPostByName', public.lounge_display_name(t.last_post_by),
      'sortKey', lpad(CASE WHEN t.is_sticky THEN '0' ELSE '1' END, 1, '0') ||
        to_char(coalesce(t.last_post_at, t.created_at), 'YYYYMMDDHH24MISSUS')
    ) AS row
    FROM public.lounge_threads t
    WHERE t.board_id = v_board.id
      AND t.status = 'open'
    ORDER BY t.is_sticky DESC, coalesce(t.last_post_at, t.created_at) DESC, t.created_at DESC
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
    'threads', v_threads,
    'pagination', jsonb_build_object(
      'page', v_page,
      'limit', v_limit,
      'total', v_total,
      'totalPages', greatest(ceil(v_total::numeric / v_limit)::integer, 1)
    )
  );
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
    SELECT jsonb_build_object(
      'id', p.id,
      'threadId', p.thread_id,
      'authorId', p.author_id,
      'authorName', public.lounge_display_name(p.author_id),
      'authorInitials', public.lounge_user_initials(p.author_id),
      'authorJoinedAt', u.created_at,
      'authorPostCount', (
        SELECT count(*)::integer
        FROM public.lounge_posts ap
        WHERE ap.author_id = p.author_id
          AND ap.status = 'visible'
      ),
      'authorDailyGoal', coalesce(u.daily_word_goal, 2000),
      'authorTodayWords', coalesce(
        nullif(trim(u.writing_day_totals ->> to_char(current_date, 'YYYY-MM-DD')), '')::integer,
        0
      ),
      'quotePostId', p.quote_post_id,
      'quoteBody', (
        SELECT left(q.body, 240)
        FROM public.lounge_posts q
        WHERE q.id = p.quote_post_id
      ),
      'quoteAuthorName', (
        SELECT public.lounge_display_name(q.author_id)
        FROM public.lounge_posts q
        WHERE q.id = p.quote_post_id
      ),
      'body', p.body,
      'postNumber', p.post_number,
      'createdAt', p.created_at,
      'editedAt', p.edited_at
    ) AS row
    FROM public.lounge_posts p
    LEFT JOIN public.users u ON u.id = p.author_id
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

CREATE OR REPLACE FUNCTION public.create_lounge_thread(
  p_board_slug text,
  p_title text,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board public.lounge_boards;
  v_thread_id uuid;
  v_title text := left(trim(p_title), 200);
  v_body text := left(trim(p_body), 12000);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_title = '' OR v_body = '' THEN
    RAISE EXCEPTION 'empty_content';
  END IF;

  SELECT * INTO v_board
  FROM public.lounge_boards b
  WHERE b.slug = p_board_slug;

  IF v_board.id IS NULL THEN
    RAISE EXCEPTION 'board_not_found';
  END IF;

  IF NOT public.can_post_lounge_board(v_board.id) THEN
    RAISE EXCEPTION 'board_locked';
  END IF;

  INSERT INTO public.lounge_threads (
    board_id,
    author_id,
    title,
    reply_count,
    last_post_at,
    last_post_by
  )
  VALUES (
    v_board.id,
    auth.uid(),
    v_title,
    0,
    now(),
    auth.uid()
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
    v_board.id,
    auth.uid(),
    v_body,
    1
  );

  RETURN v_thread_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_lounge_thread(
  p_thread_id uuid,
  p_body text,
  p_quote_post_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.lounge_threads;
  v_body text := left(trim(p_body), 12000);
  v_post_number integer;
  v_post_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_body = '' THEN
    RAISE EXCEPTION 'empty_body';
  END IF;

  SELECT * INTO v_thread
  FROM public.lounge_threads t
  WHERE t.id = p_thread_id
    AND t.status = 'open';

  IF v_thread.id IS NULL THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  IF v_thread.status = 'locked' THEN
    RAISE EXCEPTION 'thread_locked';
  END IF;

  IF NOT public.can_post_lounge_board(v_thread.board_id) THEN
    RAISE EXCEPTION 'board_locked';
  END IF;

  IF p_quote_post_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.lounge_posts q
      WHERE q.id = p_quote_post_id
        AND q.thread_id = v_thread.id
        AND q.status = 'visible'
    ) THEN
      RAISE EXCEPTION 'quote_not_found';
    END IF;
  END IF;

  SELECT coalesce(max(p.post_number), 0) + 1
  INTO v_post_number
  FROM public.lounge_posts p
  WHERE p.thread_id = v_thread.id;

  INSERT INTO public.lounge_posts (
    thread_id,
    board_id,
    author_id,
    quote_post_id,
    body,
    post_number
  )
  VALUES (
    v_thread.id,
    v_thread.board_id,
    auth.uid(),
    p_quote_post_id,
    v_body,
    v_post_number
  )
  RETURNING id INTO v_post_id;

  UPDATE public.lounge_threads
  SET
    reply_count = greatest(reply_count + 1, v_post_number - 1),
    last_post_at = now(),
    last_post_by = auth.uid(),
    updated_at = now()
  WHERE id = v_thread.id;

  RETURN v_post_id;
END;
$$;

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

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.lounge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lounge_categories_select_auth" ON public.lounge_categories;
CREATE POLICY "lounge_categories_select_auth" ON public.lounge_categories
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "lounge_boards_select_auth" ON public.lounge_boards;
CREATE POLICY "lounge_boards_select_auth" ON public.lounge_boards
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "lounge_threads_select_open" ON public.lounge_threads;
CREATE POLICY "lounge_threads_select_open" ON public.lounge_threads
  FOR SELECT TO authenticated
  USING (status = 'open' OR public.is_lounge_staff());

DROP POLICY IF EXISTS "lounge_posts_select_visible" ON public.lounge_posts;
CREATE POLICY "lounge_posts_select_visible" ON public.lounge_posts
  FOR SELECT TO authenticated
  USING (status = 'visible' OR public.is_lounge_staff());

-- Mutations go through SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.lounge_categories TO authenticated;
GRANT SELECT ON public.lounge_boards TO authenticated;
GRANT SELECT ON public.lounge_threads TO authenticated;
GRANT SELECT ON public.lounge_posts TO authenticated;

GRANT EXECUTE ON FUNCTION public.list_lounge_home() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_lounge_threads(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lounge_thread(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lounge_thread(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_lounge_thread(uuid, text, uuid) TO authenticated;
