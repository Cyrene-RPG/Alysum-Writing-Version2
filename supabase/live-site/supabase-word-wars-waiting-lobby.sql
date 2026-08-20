-- Word Wars: create stays in lobby until the host begins with at least 2 writers.
-- Host max writers is stored as chosen. Re-run this whole file: list_open used to
-- SET max_writers = 16 on every lobby page load, which snapped 7 back to 16.
-- Safe to re-run. Apply after supabase-word-wars-share-required.sql
-- (and after supabase-word-wars-instant-join.sql if that was applied).

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
        code, host_id, duration_min, max_writers, is_locked, share_required,
        status
      )
      VALUES (
        v_code, v_uid, v_duration, v_max_writers,
        coalesce(p_is_locked, false),
        coalesce(p_share_required, false),
        'lobby'
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
    coalesce(v_display_name, 'Writer'), true, true
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

  SELECT count(*)::integer INTO v_participant_count
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id;

  IF v_participant_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 writers in the lobby';
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby is closed';
  END IF;

  UPDATE public.word_wars_participants
  SET words_at_start = 0,
      sprint_words = 0,
      is_typing = false,
      share_draft = v_share_required,
      live_chapter_title = '',
      live_chapter_html = '',
      live_chapter_id = NULL,
      pause_requested = false,
      is_ready = true,
      last_ping_at = now()
  WHERE room_id = p_room_id;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

DROP FUNCTION IF EXISTS public.update_word_war_lobby(uuid, integer, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.update_word_war_lobby(
  p_room_id uuid,
  p_duration_min integer DEFAULT NULL,
  p_book_id text DEFAULT NULL,
  p_is_ready boolean DEFAULT NULL,
  p_is_locked boolean DEFAULT NULL,
  p_max_writers integer DEFAULT NULL,
  p_share_required boolean DEFAULT NULL
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
  v_locked boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_word_war_participant(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  SELECT wr.status, coalesce(wr.is_locked, false)
  INTO v_status, v_locked
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
  END IF;

  IF p_is_locked IS NOT NULL THEN
    IF NOT coalesce(v_is_host, false) THEN
      RAISE EXCEPTION 'Only the host can lock the lobby';
    END IF;
    v_locked := coalesce(p_is_locked, false);
    UPDATE public.word_wars_rooms
    SET is_locked = v_locked
    WHERE id = p_room_id;
  END IF;

  IF p_max_writers IS NOT NULL THEN
    IF NOT coalesce(v_is_host, false) THEN
      RAISE EXCEPTION 'Only the host can change writer count';
    END IF;
    IF p_max_writers < 2 OR p_max_writers > 16 THEN
      RAISE EXCEPTION 'Invalid writer count';
    END IF;
    UPDATE public.word_wars_rooms
    SET max_writers = p_max_writers
    WHERE id = p_room_id;
  END IF;

  IF p_share_required IS NOT NULL THEN
    IF NOT coalesce(v_is_host, false) THEN
      RAISE EXCEPTION 'Only the host can change live writing';
    END IF;
    UPDATE public.word_wars_rooms
    SET share_required = coalesce(p_share_required, false)
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
          book_title = v_book_title
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

CREATE OR REPLACE FUNCTION public.word_war_joinable_max_writers(
  p_max_writers integer,
  p_is_locked boolean
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT greatest(2, least(coalesce(p_max_writers, 4), 16));
$$;

CREATE OR REPLACE FUNCTION public.word_war_repair_open_lobby(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.word_wars_rooms wr
  SET status = 'lobby',
      expires_at = greatest(wr.expires_at, now() + interval '4 hours')
  WHERE wr.id = p_room_id
    AND wr.status = 'cancelled'
    AND wr.started_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
    );

  UPDATE public.word_wars_rooms wr
  SET expires_at = greatest(wr.expires_at, now() + interval '4 hours')
  WHERE wr.id = p_room_id
    AND wr.status = 'lobby';
END;
$$;

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
      expires_at = greatest(wr.expires_at, now() + interval '4 hours')
  WHERE coalesce(wr.is_locked, false) = false
    AND wr.status = 'cancelled'
    AND wr.started_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
    );

  UPDATE public.word_wars_rooms wr
  SET expires_at = greatest(wr.expires_at, now() + interval '4 hours')
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

GRANT EXECUTE ON FUNCTION public.create_word_war_room(integer, integer, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_word_war(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_word_war_lobby(uuid, integer, text, boolean, boolean, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_open_word_war_lobbies(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
