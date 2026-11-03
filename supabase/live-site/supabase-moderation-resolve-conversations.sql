-- Run after supabase-moderation-direct-messages.sql.
-- Staff can mark a conversation resolved and reopen it. Additive, transactional, safe to rerun.
-- No email. Recipients keep read access; replies stay blocked while resolved.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.mc_call(text,jsonb)') IS NULL OR to_regclass('public.mc_threads') IS NULL THEN
  RAISE EXCEPTION 'Run the Moderation Center and private-message SQL first.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.mc_threads'::regclass AND attname='kind' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Run supabase-moderation-direct-messages.sql first.';
 END IF;
END $$;

ALTER TABLE public.mc_threads ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.mc_threads ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mc_threads_open_idx ON public.mc_threads(updated_at DESC,id) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.mc_set_thread_resolved(p_thread uuid, p_resolve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 thread public.mc_threads%ROWTYPE;
 uid uuid:=auth.uid();
 note text;
 key text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT * INTO thread FROM public.mc_threads WHERE id=p_thread FOR UPDATE;
 IF NOT FOUND OR NOT public.mc_staff_sees_thread(thread.kind,thread.owner_id,thread.second_staff_id,uid) THEN
  RAISE EXCEPTION 'Conversation not found.';
 END IF;
 IF p_resolve AND thread.resolved_at IS NULL THEN
  UPDATE public.mc_threads SET resolved_at=clock_timestamp(),resolved_by=uid,updated_at=clock_timestamp(),staff_read_at=clock_timestamp() WHERE id=p_thread;
  note:='Staff marked this conversation resolved. You can still read it.';
  key:='moderation:resolved:'||gen_random_uuid();
  INSERT INTO public.inbox_notifications(recipient_id,kind,title,message,source_key,moderation_thread_id)
  VALUES(thread.recipient_id,'moderation_message','Alysum Moderation: '||thread.subject,note,key,p_thread)
  ON CONFLICT DO NOTHING;
  PERFORM public.mc_log('Conversation resolved',p_thread::text);
 ELSIF NOT p_resolve AND thread.resolved_at IS NOT NULL THEN
  UPDATE public.mc_threads SET resolved_at=NULL,resolved_by=NULL,updated_at=clock_timestamp(),staff_read_at=clock_timestamp() WHERE id=p_thread;
  note:='Staff reopened this conversation. You can reply again in Moderation Messages.';
  key:='moderation:reopened:'||gen_random_uuid();
  INSERT INTO public.inbox_notifications(recipient_id,kind,title,message,source_key,moderation_thread_id)
  VALUES(thread.recipient_id,'moderation_message','Alysum Moderation: '||thread.subject,note,key,p_thread)
  ON CONFLICT DO NOTHING;
  PERFORM public.mc_log('Conversation reopened',p_thread::text);
 END IF;
 SELECT * INTO thread FROM public.mc_threads WHERE id=p_thread;
 RETURN jsonb_build_object('id',p_thread,'resolvedAt',thread.resolved_at);
END $$;

REVOKE ALL ON FUNCTION public.mc_set_thread_resolved(uuid,boolean) FROM PUBLIC,anon,authenticated;

DO $$
DECLARE src text;
BEGIN
 src:=pg_get_functiondef('public.mc_call(text,jsonb)'::regprocedure);
 src:=regexp_replace(src,'^CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 IF position('''resolve_thread''' in src)=0 THEN
  IF position('Unknown moderation action.' in src)=0
     OR position('Enter a clear explanation in 10–4,000 characters.' in src)=0
     OR position('Staff reply sent' in src)=0 THEN
   RAISE EXCEPTION 'mc_call does not match the private-message function this patch expects. Re-run supabase-moderation-direct-messages.sql first.';
  END IF;
  src:=replace(src,
   'IF p_action NOT IN (''sanction'',''revoke_sanction'',''message'',''staff_reply'',''direct_message'',''invite_staff'',''report_save'',''book_visibility'',''appeal_decision'',''set_staff'',''ip_add'',''ip_remove'') THEN RAISE EXCEPTION ''Unknown moderation action.''; END IF;',
   'IF p_action NOT IN (''sanction'',''revoke_sanction'',''message'',''staff_reply'',''direct_message'',''invite_staff'',''report_save'',''book_visibility'',''appeal_decision'',''set_staff'',''ip_add'',''ip_remove'',''resolve_thread'',''reopen_thread'') THEN RAISE EXCEPTION ''Unknown moderation action.''; END IF;');
  src:=replace(src,
   'IF length(txt) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION ''Enter a clear explanation in 10–4,000 characters.''; END IF;',
   $q$IF p_action IN ('resolve_thread','reopen_thread') THEN
 tid:=(p_payload->>'threadId')::uuid;
 result:=public.mc_set_thread_resolved(tid,p_action='resolve_thread');
 INSERT INTO public.mc_requests(user_id,request_id,result) VALUES(uid,req,result);
 RETURN result;
 END IF;
 IF p_action NOT IN ('resolve_thread','reopen_thread') AND length(txt) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Enter a clear explanation in 10–4,000 characters.'; END IF;$q$);
  src:=replace(src,
   'PERFORM 1 FROM public.mc_threads WHERE id=tid AND recipient_id=uid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION ''Conversation not found.''; END IF;',
   'PERFORM 1 FROM public.mc_threads WHERE id=tid AND recipient_id=uid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION ''Conversation not found.''; END IF; IF (SELECT resolved_at FROM public.mc_threads WHERE id=tid) IS NOT NULL THEN RAISE EXCEPTION ''This conversation is resolved. You can still read it.''; END IF;');
  src:=replace(src,
   'IF NOT FOUND OR NOT public.mc_staff_sees_thread(thread.kind,thread.owner_id,thread.second_staff_id,uid) THEN RAISE EXCEPTION ''Conversation not found.''; END IF;
 INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(tid,uid,''staff'',txt) RETURNING id INTO total;',
   'IF NOT FOUND OR NOT public.mc_staff_sees_thread(thread.kind,thread.owner_id,thread.second_staff_id,uid) THEN RAISE EXCEPTION ''Conversation not found.''; END IF;
 IF thread.resolved_at IS NOT NULL THEN RAISE EXCEPTION ''Reopen this conversation before sending another reply.''; END IF;
 INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(tid,uid,''staff'',txt) RETURNING id INTO total;');
  src:=replace(src,
   'AND (coalesce(p_payload->>''kind'',''all'')=''all'' OR t.kind=p_payload->>''kind''))',
   'AND (coalesce(p_payload->>''kind'',''all'')=''all'' OR t.kind=p_payload->>''kind'') AND (coalesce(p_payload->>''status'',''open'')=''all'' OR (coalesce(p_payload->>''status'',''open'')=''open'' AND t.resolved_at IS NULL) OR (p_payload->>''status''=''resolved'' AND t.resolved_at IS NOT NULL)))');
  src:=replace(src,
   'AND EXISTS(SELECT 1 FROM public.mc_messages m WHERE m.thread_id=t.id AND side=''user'' AND m.created_at>coalesce(t.staff_read_at,''epoch'')))',
   'AND t.resolved_at IS NULL AND EXISTS(SELECT 1 FROM public.mc_messages m WHERE m.thread_id=t.id AND side=''user'' AND m.created_at>coalesce(t.staff_read_at,''epoch'')))');
  src:=replace(src,
   'SELECT t.id,t.subject,t.book_id,t.deadline,t.updated_at,t.recipient_read_at FROM public.mc_threads t WHERE t.recipient_id=uid',
   'SELECT t.id,t.subject,t.book_id,t.deadline,t.updated_at,t.recipient_read_at,t.resolved_at FROM public.mc_threads t WHERE t.recipient_id=uid');
  src:=replace(src,
   'RETURN jsonb_build_object(''id'',tid,''subject'',thread.subject,''bookId'',thread.book_id,''deadline'',thread.deadline,''messages'',items,''total'',total);',
   'RETURN jsonb_build_object(''id'',tid,''subject'',thread.subject,''bookId'',thread.book_id,''deadline'',thread.deadline,''resolvedAt'',thread.resolved_at,''messages'',items,''total'',total);');
  IF position('''resolve_thread''' in src)=0 THEN
   RAISE EXCEPTION 'Could not add resolve_thread to mc_call. Re-run supabase-moderation-direct-messages.sql first.';
  END IF;
  EXECUTE src;
 END IF;
 IF position('''resolve_thread''' in pg_get_functiondef('public.mc_call(text,jsonb)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'resolve_thread was not installed into mc_call.';
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.mc_call(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_call(text,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
