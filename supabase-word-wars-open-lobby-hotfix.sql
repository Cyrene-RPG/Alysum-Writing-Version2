-- Run this in Supabase SQL Editor if open lobbies fail with:
--   UPDATE is not allowed in a non-volatile function
-- (CREATE OR REPLACE cannot change STABLE → VOLATILE — must DROP first.)

DROP FUNCTION IF EXISTS public.list_open_word_war_lobbies(integer);

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
      max_writers = 16
  WHERE wr.id = p_room_id
    AND coalesce(wr.is_locked, false) = false
    AND wr.status = 'cancelled'
    AND EXISTS (
      SELECT 1 FROM public.word_wars_participants wp WHERE wp.room_id = wr.id
    );

  UPDATE public.word_wars_rooms wr
  SET expires_at = greatest(wr.expires_at, now() + interval '4 hours'),
      max_writers = 16
  WHERE wr.id = p_room_id
    AND coalesce(wr.is_locked, false) = false
    AND wr.status = 'lobby';
END;
$$;

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
        'hostDisplayName', coalesce((
          SELECT nullif(trim(wp.display_name), '')
          FROM public.word_wars_participants wp
          WHERE wp.room_id = wr.id AND wp.is_host
          LIMIT 1
        ), 'Writer'),
        'createdAt', wr.created_at
      ) AS row_data
      FROM public.word_wars_rooms wr
      WHERE wr.status = 'lobby'
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

GRANT EXECUTE ON FUNCTION public.list_open_word_war_lobbies(integer) TO authenticated;
