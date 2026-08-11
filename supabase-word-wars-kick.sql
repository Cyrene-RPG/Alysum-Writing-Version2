-- Host kick for Word Wars (safe to re-run).
-- Run in Supabase SQL Editor if kick_word_war_participant is missing.

DROP FUNCTION IF EXISTS public.kick_word_war_participant(uuid, uuid);

CREATE OR REPLACE FUNCTION public.kick_word_war_participant(
  p_room_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_remaining integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_user_id IS NULL OR p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.word_wars_participants wp
    WHERE wp.room_id = p_room_id
      AND wp.user_id = v_uid
      AND wp.is_host
  ) THEN
    RAISE EXCEPTION 'Only the host can remove writers';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.word_wars_participants wp
    WHERE wp.room_id = p_room_id
      AND wp.user_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'Writer not in this room';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.word_wars_participants wp
    WHERE wp.room_id = p_room_id
      AND wp.user_id = p_target_user_id
      AND wp.is_host
  ) THEN
    RAISE EXCEPTION 'Cannot remove the host';
  END IF;

  SELECT wr.status INTO v_status
  FROM public.word_wars_rooms wr
  WHERE wr.id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_status NOT IN ('lobby', 'active') THEN
    RAISE EXCEPTION 'Room not found or no longer open';
  END IF;

  DELETE FROM public.word_wars_participants
  WHERE room_id = p_room_id AND user_id = p_target_user_id;

  SELECT count(*)::integer INTO v_remaining
  FROM public.word_wars_participants wp
  WHERE wp.room_id = p_room_id;

  IF v_remaining = 0 THEN
    UPDATE public.word_wars_rooms
    SET status = 'cancelled'
    WHERE id = p_room_id AND status IN ('lobby', 'active');
  ELSIF v_status IN ('lobby', 'active') THEN
    UPDATE public.word_wars_rooms
    SET status = v_status
    WHERE id = p_room_id AND status = 'cancelled';
  END IF;

  IF v_status = 'active' AND v_remaining >= 1 THEN
    UPDATE public.word_wars_rooms
    SET status = 'active'
    WHERE id = p_room_id AND status IN ('finished', 'cancelled');
  END IF;

  RETURN public.word_war_lobby_json(p_room_id);
END;
$$;

REVOKE ALL ON FUNCTION public.kick_word_war_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kick_word_war_participant(uuid, uuid) TO authenticated;
