-- Word Wars hotfix — run in Supabase SQL Editor.
-- Fixes:
--   • UPDATE is not allowed in a non-volatile function (open lobby list)
--   • Join by code says "closed or expired" for open waiting lobbies

CREATE OR REPLACE FUNCTION public.word_war_joinable_max_writers(
  p_max_writers integer,
  p_is_locked boolean
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_is_locked, false) THEN greatest(2, least(coalesce(p_max_writers, 4), 16))
    ELSE 16
  END;
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
      expires_at = greatest(wr.expires_at, now() + interval '4 hours'),
      max_writers = CASE
        WHEN coalesce(wr.is_locked, false) THEN wr.max_writers
        ELSE 16
      END
  WHERE wr.id = p_room_id
    AND wr.status = 'cancelled'
    AND wr.started_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
    );

  UPDATE public.word_wars_rooms wr
  SET expires_at = greatest(wr.expires_at, now() + interval '4 hours'),
      max_writers = CASE
        WHEN coalesce(wr.is_locked, false) THEN wr.max_writers
        ELSE 16
      END
  WHERE wr.id = p_room_id
    AND wr.status = 'lobby';
END;
$$;

-- Reopen waiting lobbies that were wrongly cancelled.
UPDATE public.word_wars_rooms wr
SET status = 'lobby',
    expires_at = greatest(wr.expires_at, now() + interval '4 hours'),
    max_writers = CASE WHEN coalesce(wr.is_locked, false) THEN wr.max_writers ELSE 16 END
WHERE wr.status = 'cancelled'
  AND wr.started_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
  );

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
    AND wr.started_at IS NULL
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

DROP FUNCTION IF EXISTS public.join_word_war_room(text, text);

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
  v_is_locked boolean;
  v_status text;
  v_expires_at timestamptz;
  v_started_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_code = '' OR char_length(v_code) <> 6 THEN
    RAISE EXCEPTION 'Invalid room code';
  END IF;

  SELECT wr.id, wr.max_writers, wr.is_locked, wr.status, wr.expires_at
  INTO v_room_id, v_max_writers, v_is_locked, v_status, v_expires_at
  FROM public.word_wars_rooms wr
  WHERE wr.code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  PERFORM public.word_war_repair_open_lobby(v_room_id);

  SELECT wr.max_writers, wr.is_locked, wr.status, wr.expires_at, wr.started_at
  INTO v_max_writers, v_is_locked, v_status, v_expires_at, v_started_at
  FROM public.word_wars_rooms wr
  WHERE wr.id = v_room_id;

  IF v_status = 'finished' THEN
    RAISE EXCEPTION 'That Word War has ended';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  IF v_status NOT IN ('lobby', 'active') THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  IF coalesce(v_is_locked, false) AND v_expires_at <= now() AND v_status = 'lobby' THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  IF v_status = 'active' THEN
    UPDATE public.word_wars_rooms
    SET expires_at = greatest(expires_at, now() + interval '12 hours')
    WHERE id = v_room_id;
  END IF;

  v_max_writers := public.word_war_joinable_max_writers(v_max_writers, v_is_locked);

  IF EXISTS (
    SELECT 1 FROM public.word_wars_participants wp
    WHERE wp.room_id = v_room_id AND wp.user_id = v_uid
  ) THEN
    IF v_book_id IS NOT NULL THEN
      v_book_title := public.word_war_book_title(v_book_id);
      IF v_book_title IS NULL THEN
        RAISE EXCEPTION 'Book not found';
      END IF;
      UPDATE public.word_wars_participants
      SET book_id = v_book_id,
          book_title = v_book_title,
          is_ready = CASE WHEN v_status = 'active' THEN true ELSE false END
      WHERE room_id = v_room_id AND user_id = v_uid;
    END IF;
    RETURN public.word_war_lobby_json(v_room_id);
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.word_wars_participants wp
  WHERE wp.room_id = v_room_id;

  IF v_count >= v_max_writers THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  PERFORM public.word_war_leave_other_rooms(v_room_id);

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
    v_status = 'active'
  );

  RETURN public.word_war_lobby_json(v_room_id);
END;
$$;

DROP FUNCTION IF EXISTS public.join_word_war_room_by_id(uuid, text);

CREATE OR REPLACE FUNCTION public.join_word_war_room_by_id(
  p_room_id uuid,
  p_book_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_book_id text := nullif(trim(coalesce(p_book_id, '')), '');
  v_book_title text := 'Untitled';
  v_max_writers integer;
  v_count integer;
  v_display_name text;
  v_is_locked boolean;
  v_status text;
  v_expires_at timestamptz;
  v_started_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'Invalid room';
  END IF;

  SELECT wr.max_writers, wr.is_locked, wr.status, wr.expires_at, wr.started_at
  INTO v_max_writers, v_is_locked, v_status, v_expires_at, v_started_at
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  PERFORM public.word_war_repair_open_lobby(p_room_id);

  SELECT wr.max_writers, wr.is_locked, wr.status, wr.expires_at, wr.started_at
  INTO v_max_writers, v_is_locked, v_status, v_expires_at, v_started_at
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  IF v_status = 'finished' THEN
    RAISE EXCEPTION 'That Word War has ended';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  IF v_status NOT IN ('lobby', 'active') THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  IF coalesce(v_is_locked, false) THEN
    RAISE EXCEPTION 'This lobby is invite-only — use the room code';
  END IF;

  IF v_status = 'active' THEN
    UPDATE public.word_wars_rooms
    SET expires_at = greatest(expires_at, now() + interval '12 hours')
    WHERE id = p_room_id;
  END IF;

  v_max_writers := public.word_war_joinable_max_writers(v_max_writers, v_is_locked);

  IF EXISTS (
    SELECT 1 FROM public.word_wars_participants wp
    WHERE wp.room_id = p_room_id AND wp.user_id = v_uid
  ) THEN
    IF v_book_id IS NOT NULL THEN
      v_book_title := public.word_war_book_title(v_book_id);
      IF v_book_title IS NULL THEN
        RAISE EXCEPTION 'Book not found';
      END IF;
      UPDATE public.word_wars_participants
      SET book_id = v_book_id,
          book_title = v_book_title,
          is_ready = CASE WHEN v_status = 'active' THEN true ELSE false END
      WHERE room_id = p_room_id AND user_id = v_uid;
    END IF;
    RETURN public.word_war_lobby_json(p_room_id);
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id;

  IF v_count >= v_max_writers THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  PERFORM public.word_war_leave_other_rooms(p_room_id);

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
    p_room_id,
    v_uid,
    v_book_id,
    coalesce(v_book_title, 'Untitled'),
    coalesce(v_display_name, 'Writer'),
    false,
    v_status = 'active'
  );

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_open_word_war_lobbies(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_word_war_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_word_war_room_by_id(uuid, text) TO authenticated;
