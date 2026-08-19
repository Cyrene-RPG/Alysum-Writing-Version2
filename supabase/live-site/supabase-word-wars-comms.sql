-- Additive Word Wars room chat migration.
-- Safe to re-run. Prefer re-running the latest supabase-word-wars.sql if you can;
-- this file exists for environments that already applied an older Word Wars schema.

CREATE TABLE IF NOT EXISTS public.word_wars_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.word_wars_rooms (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS word_wars_messages_room_idx
  ON public.word_wars_messages (room_id, created_at ASC);

CREATE INDEX IF NOT EXISTS word_wars_messages_sender_recent_idx
  ON public.word_wars_messages (sender_id, created_at DESC);

ALTER TABLE public.word_wars_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS word_wars_messages_select ON public.word_wars_messages;
CREATE POLICY word_wars_messages_select ON public.word_wars_messages
  FOR SELECT TO authenticated
  USING (public.is_word_war_member(room_id));

CREATE OR REPLACE FUNCTION public.word_war_sender_name(p_room_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(wp.display_name), ''),
    nullif(trim(u.display_name), ''),
    nullif(trim(u.username), ''),
    'Writer'
  )
  FROM (SELECT p_user_id AS id) src
  LEFT JOIN public.word_wars_participants wp
    ON wp.room_id = p_room_id AND wp.user_id = src.id
  LEFT JOIN public.users u ON u.id = src.id;
$$;

CREATE OR REPLACE FUNCTION public.list_word_war_messages(
  p_room_id uuid,
  p_before timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 80
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 80), 1), 120);
  v_messages jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_room_id IS NULL OR NOT public.is_word_war_member(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  SELECT coalesce(jsonb_agg(msg ORDER BY msg->>'createdAt'), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'roomId', m.room_id,
      'senderId', m.sender_id,
      'senderName', public.word_war_sender_name(m.room_id, m.sender_id),
      'body', m.body,
      'createdAt', m.created_at
    ) AS msg
    FROM public.word_wars_messages m
    WHERE m.room_id = p_room_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT v_limit
  ) ranked;

  RETURN jsonb_build_object('messages', coalesce(v_messages, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.send_word_war_message(
  p_room_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_recent_count integer;
  v_row public.word_wars_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_room_id IS NULL OR NOT public.is_word_war_member(p_room_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'invalid_message_body';
  END IF;

  IF v_body ~ '<[^>]+>' THEN
    RAISE EXCEPTION 'text_only_messages';
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM public.word_wars_messages m
  WHERE m.sender_id = v_uid
    AND m.created_at > now() - interval '10 seconds';

  IF v_recent_count >= 8 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.word_wars_messages (room_id, sender_id, body)
  VALUES (p_room_id, v_uid, v_body)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'roomId', v_row.room_id,
    'senderId', v_row.sender_id,
    'senderName', public.word_war_sender_name(v_row.room_id, v_row.sender_id),
    'body', v_row.body,
    'createdAt', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.word_war_sender_name(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_word_war_messages(uuid, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_word_war_message(uuid, text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.word_wars_messages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.word_wars_messages FROM anon;

ALTER TABLE public.word_wars_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.word_wars_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;
