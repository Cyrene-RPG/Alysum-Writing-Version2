-- Additive Word Wars: live-writing required/optional, 10-min sprints, tighter RLS.
-- Safe to re-run. Apply after supabase-word-wars.sql.

ALTER TABLE public.word_wars_rooms
  ADD COLUMN IF NOT EXISTS share_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.word_wars_rooms DROP CONSTRAINT IF EXISTS word_wars_rooms_duration_min_check;
ALTER TABLE public.word_wars_rooms
  ADD CONSTRAINT word_wars_rooms_duration_min_check
  CHECK (duration_min IN (0, 5, 10, 15, 20, 25, 30, 45));

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
  v_uid uuid := auth.uid();
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
      'bookId', CASE WHEN wp.user_id = v_uid THEN wp.book_id ELSE NULL END,
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
    'isLocked', v_room.is_locked,
    'shareRequired', coalesce(v_room.share_required, false),
    'participants', v_participants
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_word_war_room(integer, integer, text, boolean);
DROP FUNCTION IF EXISTS public.create_word_war_room(integer, integer, text);

CREATE OR REPLACE FUNCTION public.create_word_war_room(
  p_duration_min integer DEFAULT 15,
  p_max_writers integer DEFAULT 4,
  p_book_id text DEFAULT NULL,
  p_is_locked boolean DEFAULT false,
  p_share_required boolean DEFAULT false
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

  IF v_duration NOT IN (0, 5, 10, 15, 20, 25, 30, 45) THEN
    RAISE EXCEPTION 'Invalid sprint length';
  END IF;

  IF v_max_writers < 2 OR v_max_writers > 16 THEN
    RAISE EXCEPTION 'Invalid writer count';
  END IF;

  IF NOT coalesce(p_is_locked, false) THEN
    v_max_writers := 16;
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
      INSERT INTO public.word_wars_rooms (
        code, host_id, duration_min, max_writers, is_locked, share_required
      )
      VALUES (
        v_code, v_uid, v_duration, v_max_writers,
        coalesce(p_is_locked, false),
        coalesce(p_share_required, false)
      )
      RETURNING id INTO v_room_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.word_wars_participants (
    room_id, user_id, book_id, book_title, display_name, is_host, is_ready
  )
  VALUES (
    v_room_id, v_uid, v_book_id, coalesce(v_book_title, 'Untitled'),
    coalesce(v_display_name, 'Writer'), true, false
  );

  PERFORM public.word_war_leave_other_rooms(v_room_id);

  RETURN public.word_war_lobby_json(v_room_id);
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
  v_share_required boolean;
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

  SELECT count(*)::integer,
         count(*) FILTER (WHERE wp.is_ready AND coalesce(nullif(trim(wp.book_id), ''), '') <> '')::integer
  INTO v_participant_count, v_ready_count
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id;

  IF v_participant_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 writers in the lobby';
  END IF;

  IF v_ready_count < v_participant_count THEN
    RAISE EXCEPTION 'Every writer must be ready';
  END IF;

  SELECT coalesce(wr.share_required, false) INTO v_share_required
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  UPDATE public.word_wars_rooms
  SET status = 'active',
      started_at = now(),
      expires_at = greatest(expires_at, now() + interval '12 hours'),
      is_paused = false,
      paused_at = NULL,
      pause_ms_total = 0
  WHERE id = p_room_id
    AND status = 'lobby';

  UPDATE public.word_wars_participants
  SET words_at_start = 0,
      sprint_words = 0,
      is_typing = false,
      share_draft = v_share_required,
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
  v_share_required boolean;
  v_share boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_word_war_participant(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  SELECT wr.status, coalesce(wr.share_required, false)
  INTO v_status, v_share_required
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Word War is not active';
  END IF;

  IF v_share_required AND p_share_draft IS FALSE THEN
    RAISE EXCEPTION 'Live writing is required in this room';
  END IF;

  SELECT CASE
    WHEN v_share_required THEN true
    ELSE coalesce(p_share_draft, wp.share_draft)
  END
  INTO v_share
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id AND wp.user_id = v_uid;

  UPDATE public.word_wars_participants wp
  SET
    sprint_words = coalesce(p_sprint_words, wp.sprint_words),
    words_at_start = CASE
      WHEN p_words_at_start IS NOT NULL AND wp.words_at_start = 0 THEN greatest(0, p_words_at_start)
      ELSE wp.words_at_start
    END,
    is_typing = coalesce(p_is_typing, wp.is_typing),
    share_draft = v_share,
    live_chapter_title = CASE
      WHEN v_share = false THEN ''
      WHEN p_live_chapter_title IS NOT NULL THEN left(p_live_chapter_title, 500)
      ELSE wp.live_chapter_title
    END,
    live_chapter_html = CASE
      WHEN v_share = false THEN ''
      WHEN p_live_chapter_html IS NOT NULL THEN left(p_live_chapter_html, 120000)
      ELSE wp.live_chapter_html
    END,
    live_chapter_id = CASE
      WHEN v_share = false THEN NULL
      WHEN p_live_chapter_id IS NOT NULL THEN left(p_live_chapter_id, 128)
      ELSE wp.live_chapter_id
    END,
    last_ping_at = now()
  WHERE wp.room_id = p_room_id
    AND wp.user_id = v_uid;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_word_war_lobby(
  p_room_id uuid,
  p_duration_min integer DEFAULT NULL,
  p_book_id text DEFAULT NULL,
  p_is_ready boolean DEFAULT NULL,
  p_is_locked boolean DEFAULT NULL
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
    IF p_duration_min NOT IN (0, 5, 10, 15, 20, 25, 30, 45) THEN
      RAISE EXCEPTION 'Invalid sprint length';
    END IF;
    UPDATE public.word_wars_rooms
    SET duration_min = p_duration_min
    WHERE id = p_room_id;

    UPDATE public.word_wars_participants
    SET is_ready = false
    WHERE room_id = p_room_id;
  END IF;

  IF p_is_locked IS NOT NULL THEN
    IF NOT coalesce(v_is_host, false) THEN
      RAISE EXCEPTION 'Only the host can lock the lobby';
    END IF;
    UPDATE public.word_wars_rooms
    SET
      is_locked = coalesce(p_is_locked, false),
      max_writers = CASE
        WHEN coalesce(p_is_locked, false) = false THEN 16
        ELSE max_writers
      END
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

CREATE OR REPLACE FUNCTION public.word_war_apply_share_on_join()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_required boolean;
  v_status text;
BEGIN
  SELECT coalesce(wr.share_required, false), wr.status
  INTO v_required, v_status
  FROM public.word_wars_rooms wr
  WHERE wr.id = NEW.room_id;

  IF v_status = 'active' AND v_required THEN
    NEW.share_draft := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS word_war_apply_share_on_join ON public.word_wars_participants;
CREATE TRIGGER word_war_apply_share_on_join
  BEFORE INSERT ON public.word_wars_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.word_war_apply_share_on_join();

DROP FUNCTION IF EXISTS public.list_open_word_war_lobbies(integer);

CREATE OR REPLACE FUNCTION public.list_open_word_war_lobbies(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.word_wars_rooms wr
  SET status = 'lobby',
      expires_at = greatest(wr.expires_at, now() + interval '4 hours'),
      max_writers = 16
  WHERE coalesce(wr.is_locked, false) = false
    AND wr.status = 'cancelled'
    AND EXISTS (
      SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
    );

  UPDATE public.word_wars_rooms wr
  SET expires_at = greatest(wr.expires_at, now() + interval '4 hours'),
      max_writers = 16
  WHERE coalesce(wr.is_locked, false) = false
    AND wr.status = 'lobby'
    AND EXISTS (
      SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
    );

  RETURN coalesce((
    SELECT jsonb_agg(row_data ORDER BY row_data->>'createdAt' DESC)
    FROM (
      SELECT jsonb_build_object(
        'roomId', wr.id,
        'code', wr.code,
        'durationMin', wr.duration_min,
        'maxWriters', public.word_war_joinable_max_writers(wr.max_writers, wr.is_locked),
        'participantCount', (
          SELECT count(*)::integer
          FROM public.word_wars_participants wp
          WHERE wp.room_id = wr.id
        ),
        'sharingCount', (
          SELECT count(*)::integer
          FROM public.word_wars_participants wp
          WHERE wp.room_id = wr.id AND wp.share_draft
        ),
        'shareRequired', coalesce(wr.share_required, false),
        'isLocked', coalesce(wr.is_locked, false),
        'hostBookTitle', coalesce((
          SELECT nullif(trim(wp.book_title), '')
          FROM public.word_wars_participants wp
          WHERE wp.room_id = wr.id AND wp.is_host
          LIMIT 1
        ), 'Untitled'),
        'hostDisplayName', coalesce((
          SELECT nullif(trim(wp.display_name), '')
          FROM public.word_wars_participants wp
          WHERE wp.room_id = wr.id AND wp.is_host
          LIMIT 1
        ), 'Writer'),
        'status', wr.status,
        'createdAt', wr.created_at
      ) AS row_data
      FROM public.word_wars_rooms wr
      WHERE wr.status IN ('lobby', 'active')
        AND coalesce(wr.is_locked, false) = false
        AND wr.expires_at > now()
        AND EXISTS (
          SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.word_wars_participants wp
          WHERE wp.room_id = wr.id AND wp.user_id = auth.uid()
        )
      ORDER BY wr.created_at DESC
      LIMIT v_limit
    ) rows
  ), '[]'::jsonb);
END;
$$;

DROP POLICY IF EXISTS word_wars_rooms_select ON public.word_wars_rooms;
CREATE POLICY word_wars_rooms_select ON public.word_wars_rooms
  FOR SELECT TO authenticated
  USING (
    public.is_word_war_participant(id)
    OR (
      status = 'lobby'
      AND expires_at > now()
      AND coalesce(is_locked, false) = false
    )
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
        AND coalesce(wr.is_locked, false) = false
    )
  );

GRANT EXECUTE ON FUNCTION public.create_word_war_room(integer, integer, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_open_word_war_lobbies(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_word_war(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_word_war_progress(uuid, integer, integer, boolean, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_word_war_lobby(uuid, integer, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.word_war_lobby_json(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
