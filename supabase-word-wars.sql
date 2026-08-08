-- Run once in Supabase → SQL Editor (safe to re-run).
-- Word Wars: friendly writing spar lobbies (test branch).
-- Apply before using word-wars-lobby.html with cloud sync.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.word_wars_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  duration_min integer NOT NULL DEFAULT 15
    CHECK (duration_min IN (0, 5, 15, 20, 25, 30, 45)),
  status text NOT NULL DEFAULT 'lobby'
    CHECK (status IN ('lobby', 'active', 'finished', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '4 hours')
);

ALTER TABLE public.word_wars_rooms ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.word_wars_rooms ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.word_wars_rooms ADD COLUMN IF NOT EXISTS pause_ms_total bigint NOT NULL DEFAULT 0;
ALTER TABLE public.word_wars_rooms ADD COLUMN IF NOT EXISTS max_writers integer NOT NULL DEFAULT 4;
ALTER TABLE public.word_wars_rooms DROP CONSTRAINT IF EXISTS word_wars_rooms_max_writers_check;
ALTER TABLE public.word_wars_rooms
  ADD CONSTRAINT word_wars_rooms_max_writers_check
  CHECK (max_writers >= 2 AND max_writers <= 16);

CREATE INDEX IF NOT EXISTS word_wars_rooms_host_id_idx
  ON public.word_wars_rooms (host_id, created_at DESC);

CREATE INDEX IF NOT EXISTS word_wars_rooms_code_idx
  ON public.word_wars_rooms (code)
  WHERE status = 'lobby';

ALTER TABLE public.word_wars_rooms DROP CONSTRAINT IF EXISTS word_wars_rooms_duration_min_check;
ALTER TABLE public.word_wars_rooms
  ADD CONSTRAINT word_wars_rooms_duration_min_check
  CHECK (duration_min IN (0, 5, 15, 20, 25, 30, 45));

CREATE TABLE IF NOT EXISTS public.word_wars_participants (
  room_id uuid NOT NULL REFERENCES public.word_wars_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id text,
  book_title text NOT NULL DEFAULT 'Untitled',
  display_name text NOT NULL DEFAULT '',
  is_ready boolean NOT NULL DEFAULT false,
  is_host boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS word_wars_participants_user_id_idx
  ON public.word_wars_participants (user_id, joined_at DESC);

ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS words_at_start integer NOT NULL DEFAULT 0;
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS sprint_words integer NOT NULL DEFAULT 0;
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS is_typing boolean NOT NULL DEFAULT false;
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS last_ping_at timestamptz;
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS share_draft boolean NOT NULL DEFAULT false;
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS live_chapter_title text NOT NULL DEFAULT '';
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS live_chapter_html text NOT NULL DEFAULT '';
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS live_chapter_id text;
ALTER TABLE public.word_wars_participants ADD COLUMN IF NOT EXISTS pause_requested boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gen_word_war_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_word_war_participant(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.word_wars_participants wp
    JOIN public.word_wars_rooms wr ON wr.id = wp.room_id
    WHERE wp.room_id = p_room_id
      AND wp.user_id = auth.uid()
      AND wr.status IN ('lobby', 'active', 'finished')
      AND wr.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.word_war_book_title(p_book_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(b.title), ''),
    'Untitled'
  )
  FROM public.books b
  WHERE b.id = p_book_id
    AND b.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.word_war_lobby_json(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.word_wars_rooms%ROWTYPE;
  v_participants jsonb;
BEGIN
  SELECT * INTO v_room
  FROM public.word_wars_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'userId', wp.user_id,
      'displayName', wp.display_name,
      'profileImageUrl', nullif(trim(u.profile_image_url), ''),
      'bookId', wp.book_id,
      'bookTitle', wp.book_title,
      'isReady', wp.is_ready,
      'isHost', wp.is_host,
      'joinedAt', wp.joined_at,
      'wordsAtStart', wp.words_at_start,
      'sprintWords', wp.sprint_words,
      'isTyping', wp.is_typing,
      'lastPingAt', wp.last_ping_at,
      'shareDraft', wp.share_draft,
      'liveChapterTitle', wp.live_chapter_title,
      'liveChapterHtml', wp.live_chapter_html,
      'liveChapterId', wp.live_chapter_id,
      'pauseRequested', wp.pause_requested
    )
    ORDER BY wp.is_host DESC, wp.joined_at ASC
  ), '[]'::jsonb)
  INTO v_participants
  FROM public.word_wars_participants wp
  LEFT JOIN public.users u ON u.id = wp.user_id
  WHERE wp.room_id = p_room_id;

  RETURN jsonb_build_object(
    'roomId', v_room.id,
    'code', v_room.code,
    'hostId', v_room.host_id,
    'durationMin', v_room.duration_min,
    'maxWriters', v_room.max_writers,
    'status', v_room.status,
    'createdAt', v_room.created_at,
    'startedAt', v_room.started_at,
    'expiresAt', v_room.expires_at,
    'isPaused', v_room.is_paused,
    'pausedAt', v_room.paused_at,
    'pauseMsTotal', v_room.pause_ms_total,
    'participants', v_participants
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_word_war_room(
  p_duration_min integer DEFAULT 15,
  p_max_writers integer DEFAULT 4,
  p_book_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_duration integer := coalesce(p_duration_min, 15);
  v_max_writers integer := coalesce(p_max_writers, 4);
  v_book_id text := nullif(trim(coalesce(p_book_id, '')), '');
  v_book_title text := 'Untitled';
  v_code text;
  v_room_id uuid;
  v_display_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_duration NOT IN (0, 5, 15, 20, 25, 30, 45) THEN
    RAISE EXCEPTION 'Invalid sprint length';
  END IF;

  IF v_max_writers < 2 OR v_max_writers > 16 THEN
    RAISE EXCEPTION 'Invalid writer count';
  END IF;

  IF v_book_id IS NOT NULL THEN
    v_book_title := public.word_war_book_title(v_book_id);
    IF v_book_title IS NULL THEN
      RAISE EXCEPTION 'Book not found';
    END IF;
  END IF;

  SELECT coalesce(
    nullif(trim(u.display_name), ''),
    nullif(trim(u.username), ''),
    'Writer'
  )
  INTO v_display_name
  FROM public.users u
  WHERE u.id = v_uid;

  LOOP
    v_code := public.gen_word_war_code();
    BEGIN
      INSERT INTO public.word_wars_rooms (code, host_id, duration_min, max_writers)
      VALUES (v_code, v_uid, v_duration, v_max_writers)
      RETURNING id INTO v_room_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.word_wars_participants (
    room_id, user_id, book_id, book_title, display_name, is_host, is_ready
  )
  VALUES (v_room_id, v_uid, v_book_id, coalesce(v_book_title, 'Untitled'), coalesce(v_display_name, 'Writer'), true, false);

  RETURN public.word_war_lobby_json(v_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_word_war_room(
  p_code text,
  p_book_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_book_id text := nullif(trim(coalesce(p_book_id, '')), '');
  v_book_title text := 'Untitled';
  v_room_id uuid;
  v_max_writers integer;
  v_count integer;
  v_display_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_code = '' OR char_length(v_code) <> 6 THEN
    RAISE EXCEPTION 'Invalid room code';
  END IF;

  SELECT wr.id, wr.max_writers
  INTO v_room_id, v_max_writers
  FROM public.word_wars_rooms wr
  WHERE wr.code = v_code
    AND wr.status = 'lobby'
    AND wr.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.word_wars_participants wp
    WHERE wp.room_id = v_room_id AND wp.user_id = v_uid
  ) THEN
    RETURN public.word_war_lobby_json(v_room_id);
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.word_wars_participants wp
  WHERE wp.room_id = v_room_id;

  IF v_count >= v_max_writers THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  IF v_book_id IS NOT NULL THEN
    v_book_title := public.word_war_book_title(v_book_id);
    IF v_book_title IS NULL THEN
      RAISE EXCEPTION 'Book not found';
    END IF;
  END IF;

  SELECT coalesce(
    nullif(trim(u.display_name), ''),
    nullif(trim(u.username), ''),
    'Writer'
  )
  INTO v_display_name
  FROM public.users u
  WHERE u.id = v_uid;

  INSERT INTO public.word_wars_participants (
    room_id, user_id, book_id, book_title, display_name, is_host, is_ready
  )
  VALUES (
    v_room_id,
    v_uid,
    v_book_id,
    coalesce(v_book_title, 'Untitled'),
    coalesce(v_display_name, 'Writer'),
    false,
    false
  );

  RETURN public.word_war_lobby_json(v_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_word_war_lobby(p_code text DEFAULT NULL, p_room_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
BEGIN
  IF p_room_id IS NOT NULL THEN
    v_room_id := p_room_id;
  ELSIF v_code <> '' THEN
    SELECT wr.id INTO v_room_id
    FROM public.word_wars_rooms wr
    WHERE wr.code = v_code
      AND wr.expires_at > now()
    LIMIT 1;
  END IF;

  IF v_room_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_word_war_participant(v_room_id) THEN
    SELECT wr.id INTO v_room_id
    FROM public.word_wars_rooms wr
    WHERE wr.id = v_room_id
      AND wr.status = 'lobby'
      AND wr.expires_at > now()
      AND (SELECT count(*) FROM public.word_wars_participants wp WHERE wp.room_id = wr.id) < wr.max_writers;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Room not accessible';
    END IF;
  END IF;

  RETURN public.word_war_lobby_json(v_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_word_war_lobby(
  p_room_id uuid,
  p_duration_min integer DEFAULT NULL,
  p_book_id text DEFAULT NULL,
  p_is_ready boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_book_id text := nullif(trim(coalesce(p_book_id, '')), '');
  v_book_title text;
  v_is_host boolean;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_word_war_participant(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  SELECT wr.status INTO v_status
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  IF v_status <> 'lobby' THEN
    RAISE EXCEPTION 'Lobby is closed';
  END IF;

  SELECT wp.is_host INTO v_is_host
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id AND wp.user_id = v_uid;

  IF p_duration_min IS NOT NULL THEN
    IF NOT coalesce(v_is_host, false) THEN
      RAISE EXCEPTION 'Only the host can change sprint length';
    END IF;
    IF p_duration_min NOT IN (0, 5, 15, 20, 25, 30, 45) THEN
      RAISE EXCEPTION 'Invalid sprint length';
    END IF;
    UPDATE public.word_wars_rooms
    SET duration_min = p_duration_min
    WHERE id = p_room_id;
  END IF;

  IF p_book_id IS NOT NULL OR p_is_ready IS NOT NULL THEN
    IF p_book_id IS NOT NULL THEN
      v_book_title := public.word_war_book_title(p_book_id);
      IF v_book_title IS NULL THEN
        RAISE EXCEPTION 'Book not found';
      END IF;
      UPDATE public.word_wars_participants
      SET book_id = p_book_id,
          book_title = v_book_title,
          is_ready = false
      WHERE room_id = p_room_id AND user_id = v_uid;
    ELSIF p_is_ready IS NOT NULL THEN
      UPDATE public.word_wars_participants
      SET is_ready = coalesce(p_is_ready, false)
      WHERE room_id = p_room_id AND user_id = v_uid;
    END IF;
  END IF;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_word_war(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ready_count integer;
  v_participant_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.word_wars_participants wp
    WHERE wp.room_id = p_room_id AND wp.user_id = v_uid AND wp.is_host
  ) THEN
    RAISE EXCEPTION 'Only the host can start';
  END IF;

  SELECT count(*)::integer, count(*) FILTER (WHERE wp.is_ready AND coalesce(nullif(trim(wp.book_id), ''), '') <> '')::integer
  INTO v_participant_count, v_ready_count
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id;

  IF v_participant_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 writers in the lobby';
  END IF;

  IF v_ready_count < v_participant_count THEN
    RAISE EXCEPTION 'Every writer must be ready';
  END IF;

  UPDATE public.word_wars_rooms
  SET status = 'active',
      started_at = now(),
      is_paused = false,
      paused_at = NULL,
      pause_ms_total = 0
  WHERE id = p_room_id
    AND status = 'lobby';

  UPDATE public.word_wars_participants
  SET words_at_start = 0,
      sprint_words = 0,
      is_typing = false,
      share_draft = false,
      live_chapter_title = '',
      live_chapter_html = '',
      live_chapter_id = NULL,
      pause_requested = false,
      last_ping_at = now()
  WHERE room_id = p_room_id;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_word_war_progress(
  p_room_id uuid,
  p_sprint_words integer DEFAULT NULL,
  p_words_at_start integer DEFAULT NULL,
  p_is_typing boolean DEFAULT NULL,
  p_share_draft boolean DEFAULT NULL,
  p_live_chapter_title text DEFAULT NULL,
  p_live_chapter_html text DEFAULT NULL,
  p_live_chapter_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_word_war_participant(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  SELECT wr.status INTO v_status
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Word War is not active';
  END IF;

  UPDATE public.word_wars_participants wp
  SET
    sprint_words = coalesce(p_sprint_words, wp.sprint_words),
    words_at_start = CASE
      WHEN p_words_at_start IS NOT NULL AND wp.words_at_start = 0 THEN greatest(0, p_words_at_start)
      ELSE wp.words_at_start
    END,
    is_typing = coalesce(p_is_typing, wp.is_typing),
    share_draft = coalesce(p_share_draft, wp.share_draft),
    live_chapter_title = CASE
      WHEN coalesce(p_share_draft, wp.share_draft) = false THEN ''
      WHEN p_live_chapter_title IS NOT NULL THEN left(p_live_chapter_title, 500)
      ELSE wp.live_chapter_title
    END,
    live_chapter_html = CASE
      WHEN coalesce(p_share_draft, wp.share_draft) = false THEN ''
      WHEN p_live_chapter_html IS NOT NULL THEN left(p_live_chapter_html, 120000)
      ELSE wp.live_chapter_html
    END,
    live_chapter_id = CASE
      WHEN coalesce(p_share_draft, wp.share_draft) = false THEN NULL
      WHEN p_live_chapter_id IS NOT NULL THEN left(p_live_chapter_id, 128)
      ELSE wp.live_chapter_id
    END,
    last_ping_at = now()
  WHERE wp.room_id = p_room_id
    AND wp.user_id = v_uid;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_word_war_pause(
  p_room_id uuid,
  p_pause_requested boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_is_paused boolean;
  v_paused_at timestamptz;
  v_pause_ms_total bigint;
  v_participant_count integer;
  v_requested_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_word_war_participant(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  SELECT wr.status, wr.is_paused, wr.paused_at, wr.pause_ms_total
  INTO v_status, v_is_paused, v_paused_at, v_pause_ms_total
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Word War is not active';
  END IF;

  UPDATE public.word_wars_participants wp
  SET pause_requested = coalesce(p_pause_requested, false)
  WHERE wp.room_id = p_room_id
    AND wp.user_id = v_uid;

  SELECT count(*)::integer, count(*) FILTER (WHERE wp.pause_requested)::integer
  INTO v_participant_count, v_requested_count
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id;

  IF NOT v_is_paused
     AND v_participant_count >= 2
     AND v_requested_count >= v_participant_count THEN
    UPDATE public.word_wars_rooms
    SET is_paused = true,
        paused_at = now()
    WHERE id = p_room_id;
  ELSIF v_is_paused AND v_requested_count = 0 THEN
    UPDATE public.word_wars_rooms
    SET is_paused = false,
        pause_ms_total = v_pause_ms_total + greatest(
          0,
          (extract(epoch FROM (now() - v_paused_at)) * 1000)::bigint
        ),
        paused_at = NULL
    WHERE id = p_room_id;
  END IF;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_word_war(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_word_war_participant(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  UPDATE public.word_wars_rooms
  SET status = 'finished'
  WHERE id = p_room_id
    AND status = 'active';

  UPDATE public.word_wars_participants
  SET is_typing = false,
      last_ping_at = now()
  WHERE room_id = p_room_id;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_word_war_room(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_word_war_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_word_war_lobby(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_word_war_lobby(uuid, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_word_war(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_word_war_progress(uuid, integer, integer, boolean, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_word_war_pause(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_word_war(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.word_wars_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_wars_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS word_wars_rooms_select ON public.word_wars_rooms;
CREATE POLICY word_wars_rooms_select ON public.word_wars_rooms
  FOR SELECT TO authenticated
  USING (
    public.is_word_war_participant(id)
    OR (status = 'lobby' AND expires_at > now())
  );

DROP POLICY IF EXISTS word_wars_participants_select ON public.word_wars_participants;
CREATE POLICY word_wars_participants_select ON public.word_wars_participants
  FOR SELECT TO authenticated
  USING (
    public.is_word_war_participant(room_id)
    OR EXISTS (
      SELECT 1 FROM public.word_wars_rooms wr
      WHERE wr.id = room_id
        AND wr.status = 'lobby'
        AND wr.expires_at > now()
    )
  );

-- Mutations go through SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------

ALTER TABLE public.word_wars_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.word_wars_participants REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.word_wars_rooms;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.word_wars_participants;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;
