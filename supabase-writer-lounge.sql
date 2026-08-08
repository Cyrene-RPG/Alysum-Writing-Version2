-- Run once in Supabase → SQL Editor (safe to re-run).
-- Writer's Lounge: channel-based text chat for Alysum writers.
-- Apply after supabase-base-schema.sql and supabase-beta-rooms.sql (reuses 18+ attestation).
-- Optional: supabase-staff-users.sql for is_moderation_staff() on locked channels.

-- ---------------------------------------------------------------------------
-- 0. Drop legacy forum schema (threads, posts, reactions)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.lounge_post_reactions CASCADE;
DROP TABLE IF EXISTS public.lounge_posts CASCADE;
DROP TABLE IF EXISTS public.lounge_threads CASCADE;

DROP FUNCTION IF EXISTS public.list_lounge_threads(text, integer, integer);
DROP FUNCTION IF EXISTS public.get_lounge_thread(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.create_lounge_thread(text, text, text);
DROP FUNCTION IF EXISTS public.reply_lounge_thread(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.get_lounge_post(uuid);
DROP FUNCTION IF EXISTS public.toggle_lounge_reaction(uuid, text);
DROP FUNCTION IF EXISTS public.lounge_post_to_json(uuid);
DROP FUNCTION IF EXISTS public.seed_lounge_general_main_topic();

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
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lounge_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.lounge_boards (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 8000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

-- Upgrade tables created by the old forum migration (CREATE TABLE IF NOT EXISTS skips new columns).
ALTER TABLE public.lounge_boards ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE public.lounge_boards ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.lounge_boards b
SET last_message_at = sub.latest_at
FROM (
  SELECT m.board_id, max(m.created_at) AS latest_at
  FROM public.lounge_messages m
  WHERE m.deleted_at IS NULL
  GROUP BY m.board_id
) sub
WHERE b.id = sub.board_id
  AND (b.last_message_at IS NULL OR b.last_message_at < sub.latest_at);

CREATE INDEX IF NOT EXISTS lounge_messages_board_idx
  ON public.lounge_messages (board_id, created_at ASC);

CREATE INDEX IF NOT EXISTS lounge_boards_last_message_idx
  ON public.lounge_boards (last_message_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 2. Seed categories and channels
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
  SELECT coalesce(jsonb_agg(cat ORDER BY cat->>'sortOrder'), '[]'::jsonb)
  INTO v_categories
  FROM (
    SELECT jsonb_build_object(
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
            'canPost', public.can_post_lounge_board(b.id),
            'lastMessageAt', (
              SELECT m.created_at
              FROM public.lounge_messages m
              WHERE m.board_id = b.id
                AND m.deleted_at IS NULL
              ORDER BY m.created_at DESC
              LIMIT 1
            ),
            'lastMessage', (
              SELECT jsonb_build_object(
                'body', left(m.body, 120),
                'senderName', public.lounge_display_name(m.sender_id),
                'createdAt', m.created_at
              )
              FROM public.lounge_messages m
              WHERE m.board_id = b.id
                AND m.deleted_at IS NULL
              ORDER BY m.created_at DESC
              LIMIT 1
            )
          ) AS board
          FROM public.lounge_boards b
          WHERE b.category_id = c.id
        ) boards
      )
    ) AS cat
    FROM public.lounge_categories c
  ) cats;

  SELECT jsonb_build_object(
    'channelCount', (SELECT count(*) FROM public.lounge_boards),
    'messageCount', (SELECT count(*) FROM public.lounge_messages WHERE deleted_at IS NULL),
    'onlineCount', (
      SELECT count(*)
      FROM public.users u
      WHERE u.last_seen_at >= now() - interval '5 minutes'
    )
  )
  INTO v_stats;

  RETURN jsonb_build_object(
    'categories', v_categories,
    'stats', v_stats
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_lounge_messages(
  p_board_slug text,
  p_before timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board public.lounge_boards;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_messages jsonb;
BEGIN
  SELECT * INTO v_board
  FROM public.lounge_boards b
  WHERE b.slug = p_board_slug;

  IF v_board.id IS NULL THEN
    RAISE EXCEPTION 'channel_not_found';
  END IF;

  SELECT coalesce(jsonb_agg(msg ORDER BY msg->>'createdAt'), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'boardId', m.board_id,
      'senderId', m.sender_id,
      'senderName', public.lounge_display_name(m.sender_id),
      'senderInitials', public.lounge_user_initials(m.sender_id),
      'senderAvatarUrl', (
        SELECT nullif(trim(u.profile_image_url), '')
        FROM public.users u
        WHERE u.id = m.sender_id
      ),
      'body', m.body,
      'createdAt', m.created_at
    ) AS msg
    FROM public.lounge_messages m
    WHERE m.board_id = v_board.id
      AND m.deleted_at IS NULL
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
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
    'messages', v_messages
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.send_lounge_message(
  p_board_slug text,
  p_body text
)
RETURNS public.lounge_messages
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_board public.lounge_boards;
  v_body text := trim(coalesce(p_body, ''));
  v_recent_count integer;
  v_row public.lounge_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 8000 THEN
    RAISE EXCEPTION 'invalid_message_body';
  END IF;

  IF v_body ~ '<[^>]+>' THEN
    RAISE EXCEPTION 'text_only_messages';
  END IF;

  IF to_regprocedure('public.has_beta_messaging_attestation(uuid)') IS NOT NULL
     AND NOT public.has_beta_messaging_attestation(v_uid) THEN
    RAISE EXCEPTION 'age_attestation_required';
  END IF;

  SELECT * INTO v_board
  FROM public.lounge_boards b
  WHERE b.slug = p_board_slug;

  IF v_board.id IS NULL THEN
    RAISE EXCEPTION 'channel_not_found';
  END IF;

  IF NOT public.can_post_lounge_board(v_board.id) THEN
    RAISE EXCEPTION 'channel_locked';
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM public.lounge_messages m
  WHERE m.sender_id = v_uid
    AND m.created_at >= now() - interval '1 hour';

  IF v_recent_count >= 60 THEN
    RAISE EXCEPTION 'rate_limit_exceeded';
  END IF;

  INSERT INTO public.lounge_messages (board_id, sender_id, body)
  VALUES (v_board.id, v_uid, v_body)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_lounge_online_members(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
BEGIN
  -- Presence heartbeat runs client-side via user-presence.js (touch_user_presence
  -- must not run here — STABLE functions execute in a read-only transaction).

  RETURN coalesce((
    SELECT jsonb_agg(row ORDER BY row->>'lastSeenAt' DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', u.id,
        'name', public.lounge_display_name(u.id),
        'initials', public.lounge_user_initials(u.id),
        'lastSeenAt', u.last_seen_at
      ) AS row
      FROM public.users u
      WHERE u.last_seen_at >= now() - interval '5 minutes'
      ORDER BY u.last_seen_at DESC
      LIMIT v_limit
    ) members
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.lounge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lounge_categories_select_auth" ON public.lounge_categories;
CREATE POLICY "lounge_categories_select_auth" ON public.lounge_categories
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "lounge_boards_select_auth" ON public.lounge_boards;
CREATE POLICY "lounge_boards_select_auth" ON public.lounge_boards
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "lounge_messages_select_auth" ON public.lounge_messages;
CREATE POLICY "lounge_messages_select_auth" ON public.lounge_messages
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_lounge_staff());

-- ---------------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------------

DO $lounge_realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$lounge_realtime$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.lounge_categories TO authenticated;
GRANT SELECT ON public.lounge_boards TO authenticated;
GRANT SELECT ON public.lounge_messages TO authenticated;

GRANT EXECUTE ON FUNCTION public.list_lounge_home() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_lounge_messages(text, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_lounge_message(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_lounge_online_members(integer) TO authenticated;

-- Messages are inserted only through send_lounge_message (SECURITY DEFINER).
REVOKE INSERT ON public.lounge_messages FROM authenticated;
