-- Word Wars: joining drops you into a live sprint (Discord-style). No ready gate.
-- Safe to re-run. Apply after supabase-word-wars-share-required.sql.

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
        code, host_id, duration_min, max_writers, is_locked, share_required,
        status, started_at, expires_at
      )
      VALUES (
        v_code, v_uid, v_duration, v_max_writers,
        coalesce(p_is_locked, false),
        coalesce(p_share_required, false),
        'active',
        now(),
        now() + interval '12 hours'
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

  SELECT coalesce(wr.share_required, false) INTO v_share_required
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  UPDATE public.word_wars_rooms
  SET status = 'active',
      started_at = coalesce(started_at, now()),
      expires_at = greatest(expires_at, now() + interval '12 hours'),
      is_paused = false,
      paused_at = NULL,
      pause_ms_total = 0
  WHERE id = p_room_id
    AND status IN ('lobby', 'active');

  UPDATE public.word_wars_participants
  SET words_at_start = coalesce(words_at_start, 0),
      is_ready = true,
      last_ping_at = now()
  WHERE room_id = p_room_id;

  IF v_share_required THEN
    UPDATE public.word_wars_participants
    SET share_draft = true
    WHERE room_id = p_room_id;
  END IF;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

UPDATE public.word_wars_rooms wr
SET status = 'active',
    started_at = coalesce(wr.started_at, wr.created_at, now()),
    expires_at = greatest(wr.expires_at, now() + interval '12 hours')
WHERE wr.status = 'lobby'
  AND wr.expires_at > now();

DROP POLICY IF EXISTS word_wars_rooms_select ON public.word_wars_rooms;
CREATE POLICY word_wars_rooms_select ON public.word_wars_rooms
  FOR SELECT TO authenticated
  USING (
    public.is_word_war_participant(id)
    OR (
      status IN ('lobby', 'active')
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
        AND wr.status IN ('lobby', 'active')
        AND wr.expires_at > now()
        AND coalesce(wr.is_locked, false) = false
    )
  );

GRANT EXECUTE ON FUNCTION public.create_word_war_room(integer, integer, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_word_war(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
