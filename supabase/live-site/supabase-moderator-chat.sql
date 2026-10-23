-- Run after supabase-moderation-center.sql (and its installed email-code update).
-- Private shared staff room. Additive, transactional and safe to rerun.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mc_chat_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 sender_name text NOT NULL,
 sender_role text NOT NULL CHECK(sender_role IN ('admin','moderator')),
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS mc_chat_messages_rate_idx ON public.mc_chat_messages(sender_id,created_at DESC);
ALTER TABLE public.mc_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mc_chat_messages FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.mc_chat_messages_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mc_chat_list(p_before bigint DEFAULT NULL,p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE items jsonb; first_id bigint; last_id bigint;
BEGIN
 IF public.mc_verified() IS NOT TRUE OR public.mc_role(auth.uid()) NOT IN ('admin','moderator') THEN
  RAISE EXCEPTION 'Fresh staff verification is required. Reopen the Moderation Center.' USING ERRCODE='42501';
 END IF;
 IF p_before IS NOT NULL AND p_after IS NOT NULL OR coalesce(p_before,1)<1 OR coalesce(p_after,0)<0 THEN
  RAISE EXCEPTION 'Invalid chat history cursor.';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'senderId',sender_id,'name',sender_name,'role',sender_role,'body',body,'createdAt',created_at) ORDER BY id),'[]'),min(id),max(id)
 INTO items,first_id,last_id FROM (
  SELECT * FROM public.mc_chat_messages
  WHERE (p_before IS NULL OR id<p_before) AND (p_after IS NULL OR id>p_after)
  ORDER BY CASE WHEN p_after IS NOT NULL THEN id END ASC,id DESC LIMIT 50
 ) messages;
 -- Reads deliberately do not renew the staff lease: polling must not defeat idle expiry.
 RETURN jsonb_build_object('items',items,
  'hasOlder',EXISTS(SELECT 1 FROM public.mc_chat_messages WHERE id<first_id),
  'hasNewer',EXISTS(SELECT 1 FROM public.mc_chat_messages WHERE id>last_id));
END $$;

CREATE OR REPLACE FUNCTION public.mc_chat_send(p_request_id uuid,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE uid uuid:=auth.uid(); existing public.mc_chat_messages%ROWTYPE; new_id bigint; txt text:=btrim(coalesce(p_body,'')); staff_role text;
BEGIN
 IF public.mc_verified() IS NOT TRUE THEN
  RAISE EXCEPTION 'Fresh staff verification is required. Reopen the Moderation Center.' USING ERRCODE='42501';
 END IF;
 staff_role:=public.mc_role(uid);
 IF staff_role NOT IN ('admin','moderator') THEN RAISE EXCEPTION 'Staff access required.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR char_length(txt) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Write a message of 1–4,000 characters.'; END IF;
 -- Serialize this single room so a poll cannot skip a lower ID committed after a later message.
 PERFORM pg_advisory_xact_lock(hashtextextended('mc-chat-room',0));
 SELECT * INTO existing FROM public.mc_chat_messages WHERE request_id=p_request_id;
 IF FOUND THEN
  IF existing.sender_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'This send request is unavailable.'; END IF;
  IF existing.body<>txt THEN RAISE EXCEPTION 'This send key was already used for different text.'; END IF;
  RETURN jsonb_build_object('id',existing.id::text);
 END IF;
 IF (SELECT count(*) FROM public.mc_chat_messages WHERE sender_id=uid AND created_at>clock_timestamp()-interval '1 minute')>=30 THEN
  RAISE EXCEPTION 'Please wait a minute before sending more chat messages.';
 END IF;
 INSERT INTO public.mc_chat_messages(request_id,sender_id,sender_name,sender_role,body)
 VALUES(p_request_id,uid,public.mc_name(uid),staff_role,txt) RETURNING id INTO new_id;
 UPDATE public.mc_staff_sessions SET last_seen_at=clock_timestamp() WHERE user_id=uid AND session_id=(auth.jwt()->>'session_id')::uuid;
 RETURN jsonb_build_object('id',new_id::text);
END $$;
REVOKE ALL ON FUNCTION public.mc_chat_list(bigint,bigint),public.mc_chat_send(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_chat_list(bigint,bigint),public.mc_chat_send(uuid,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
