-- Run after supabase-moderation-book-deadlines.sql.
-- Authors can submit an appeal ticket after an automatic Library unpublish.
-- Staff restore or uphold from the existing Appeals queue. Additive, transactional, safe to rerun.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.mc_call(text,jsonb)') IS NULL OR to_regclass('public.mc_threads') IS NULL THEN
  RAISE EXCEPTION 'Run the Moderation Center SQL first.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.mc_threads'::regclass AND attname='deadline_enforced_at' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Run supabase-moderation-book-deadlines.sql first.';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.mc_listing_appeals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 thread_id uuid NOT NULL REFERENCES public.mc_threads(id) ON DELETE CASCADE,
 book_id text NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(length(body) BETWEEN 10 AND 4000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','awaiting_information','upheld','granted')),
 decision text NOT NULL DEFAULT '',
 decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS mc_listing_appeals_open_idx ON public.mc_listing_appeals(thread_id) WHERE status IN ('pending','awaiting_information');
ALTER TABLE public.mc_listing_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mc_listing_appeals FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mc_inbox_listings(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'bookId',t.book_id,'subject',t.subject,'enforcedAt',t.deadline_enforced_at,
  'appealId',a.id,'appealStatus',a.status
 ) ORDER BY t.deadline_enforced_at DESC,t.id),'[]')
 FROM public.mc_threads t
 LEFT JOIN LATERAL (
  SELECT id,status FROM public.mc_listing_appeals WHERE thread_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1
 ) a ON true
 WHERE t.recipient_id=p_user AND t.deadline_enforced_at IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.mc_book_visibility v WHERE v.book_id=t.book_id AND v.visibility IN ('hidden','removed'))
$$;

CREATE OR REPLACE FUNCTION public.mc_submit_listing_appeal(p_thread uuid,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 thread public.mc_threads%ROWTYPE;
 uid uuid:=auth.uid();
 rid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT * INTO thread FROM public.mc_threads WHERE id=p_thread AND recipient_id=uid FOR UPDATE;
 IF NOT FOUND OR thread.deadline_enforced_at IS NULL OR thread.book_id IS NULL THEN
  RAISE EXCEPTION 'This listing is not available to appeal.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mc_book_visibility WHERE book_id=thread.book_id AND visibility IN ('hidden','removed')) THEN
  RAISE EXCEPTION 'This book is already in the Library.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.mc_listing_appeals WHERE thread_id=p_thread AND status IN ('pending','awaiting_information')) THEN
  RAISE EXCEPTION 'You already have an open appeal for this listing.';
 END IF;
 IF (SELECT count(*) FROM (
  SELECT 1 FROM public.mc_appeals WHERE user_id=uid AND created_at>clock_timestamp()-interval '24 hours'
  UNION ALL
  SELECT 1 FROM public.mc_listing_appeals WHERE user_id=uid AND created_at>clock_timestamp()-interval '24 hours'
 )q)>=5 THEN RAISE EXCEPTION 'Appeal limit reached. Please try again tomorrow.'; END IF;
 INSERT INTO public.mc_listing_appeals(thread_id,book_id,user_id,body) VALUES(p_thread,thread.book_id,uid,p_body) RETURNING id INTO rid;
 INSERT INTO public.mc_audit(actor_id,action,target,details) VALUES(uid,'Listing appeal submitted',thread.book_id,jsonb_build_object('thread',p_thread,'appeal',rid));
 RETURN jsonb_build_object('id',rid,'threadId',p_thread);
END $$;

CREATE OR REPLACE FUNCTION public.mc_decide_listing_appeal(p_id uuid,p_version integer,p_decision text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 appeal public.mc_listing_appeals%ROWTYPE;
 uid uuid:=auth.uid();
 tid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 SELECT * INTO appeal FROM public.mc_listing_appeals WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Appeal not found.'; END IF;
 IF appeal.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'This appeal changed. Reload before deciding.'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('awaiting_information','upheld','granted') THEN RAISE EXCEPTION 'Choose an appeal outcome.'; END IF;
 IF p_decision='granted' THEN
  UPDATE public.mc_book_visibility SET visibility='visible',reason='Listing appeal granted.',updated_by=uid,updated_at=clock_timestamp()
   WHERE book_id=appeal.book_id AND visibility='hidden';
  IF to_regclass('public.library_book_moderation') IS NOT NULL THEN
   EXECUTE $q$UPDATE public.library_book_moderation SET visibility='public',auto_hidden=false,hidden_reason='',updated_by=$2,updated_at=clock_timestamp()
    WHERE book_id=$1 AND visibility='hidden' AND auto_hidden$q$ USING appeal.book_id,uid;
  END IF;
 END IF;
 UPDATE public.mc_listing_appeals SET status=p_decision,decision=p_body,decided_by=uid,version=version+1,updated_at=clock_timestamp() WHERE id=p_id;
 tid:=public.mc_notice(appeal.user_id,'Appeal outcome: '||p_decision,p_body);
 INSERT INTO public.mc_audit(actor_id,action,target,details) VALUES(uid,'Listing appeal: '||p_decision,appeal.book_id,jsonb_build_object('appeal',p_id,'thread',appeal.thread_id));
 RETURN jsonb_build_object('id',p_id,'threadId',tid);
END $$;

CREATE OR REPLACE FUNCTION public.mc_appeal_queue(p_payload jsonb,p_offset integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH account AS (
  SELECT a.id,a.body,a.status,a.decision,a.version,a.created_at,public.mc_name(a.user_id) AS username,
   s.kind,s.reason,public.mc_name(s.created_by) AS original_actor,NULL::text AS book_id
  FROM public.mc_appeals a JOIN public.mc_sanctions s ON s.id=a.sanction_id
  WHERE coalesce(p_payload->>'status','all')='all' OR a.status=p_payload->>'status'
 ), listing AS (
  SELECT a.id,a.body,a.status,a.decision,a.version,a.created_at,public.mc_name(a.user_id) AS username,
   'listing'::text AS kind,left(coalesce(t.subject,'Library listing'),160) AS reason,
   'Automatic unpublish'::text AS original_actor,a.book_id
  FROM public.mc_listing_appeals a JOIN public.mc_threads t ON t.id=a.thread_id
  WHERE coalesce(p_payload->>'status','all')='all' OR a.status=p_payload->>'status'
 ), rows AS (SELECT * FROM account UNION ALL SELECT * FROM listing)
 SELECT jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET p_offset)q),'[]'),
  'total',(SELECT count(*) FROM rows)
 );
$$;

REVOKE ALL ON FUNCTION public.mc_inbox_listings(uuid),public.mc_submit_listing_appeal(uuid,text),public.mc_decide_listing_appeal(uuid,integer,text,text),public.mc_appeal_queue(jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mc_enforce_book_deadlines()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 thread public.mc_threads%ROWTYPE;
 hidden integer:=0;
 note text:='The requested response date passed without a reply. This book was unpublished from the Library. Your Studio copy and manuscript are unchanged. You can still reply here or submit an appeal ticket in Moderation Messages.';
 reason text:='No reply by the requested response date. Unpublished from the Library; Studio copy unchanged.';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('mc:book-deadlines',0));
 FOR thread IN
  SELECT t.* FROM public.mc_threads t
  WHERE t.book_id IS NOT NULL AND t.deadline IS NOT NULL AND t.deadline_enforced_at IS NULL
   AND t.resolved_at IS NULL AND coalesce(t.kind,'team') IS DISTINCT FROM 'direct'
   AND t.deadline<(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date
   AND NOT EXISTS(SELECT 1 FROM public.mc_messages m WHERE m.thread_id=t.id AND m.side='user')
  FOR UPDATE OF t SKIP LOCKED
 LOOP
  IF EXISTS(SELECT 1 FROM public.library WHERE id::text=thread.book_id) THEN
   IF NOT EXISTS(SELECT 1 FROM public.mc_book_visibility WHERE book_id=thread.book_id AND visibility IN ('hidden','removed')) THEN
    INSERT INTO public.mc_book_visibility(book_id,visibility,reason,updated_by)
    VALUES(thread.book_id,'hidden',reason,NULL)
    ON CONFLICT(book_id) DO UPDATE SET visibility='hidden',reason=EXCLUDED.reason,updated_by=NULL,updated_at=clock_timestamp();
    IF to_regclass('public.library_book_moderation') IS NOT NULL THEN
     EXECUTE $q$INSERT INTO public.library_book_moderation(book_id,author_id,visibility,hidden_reason,auto_hidden)
      VALUES($1,$2,'hidden',$3,true)
      ON CONFLICT(book_id) DO UPDATE SET
       visibility=CASE WHEN public.library_book_moderation.visibility='removed' THEN public.library_book_moderation.visibility ELSE 'hidden' END,
       hidden_reason=CASE WHEN public.library_book_moderation.visibility='removed' THEN public.library_book_moderation.hidden_reason ELSE EXCLUDED.hidden_reason END,
       auto_hidden=CASE WHEN public.library_book_moderation.visibility='removed' THEN public.library_book_moderation.auto_hidden ELSE true END,
       updated_at=clock_timestamp()$q$ USING thread.book_id,thread.recipient_id,reason;
    END IF;
   END IF;
   INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(thread.id,NULL,'staff',note);
   INSERT INTO public.inbox_notifications(recipient_id,kind,title,message,source_key,moderation_thread_id)
   VALUES(thread.recipient_id,'moderation_message','Alysum Moderation: '||thread.subject,note,'moderation:deadline:'||thread.id,thread.id)
   ON CONFLICT DO NOTHING;
   INSERT INTO public.mc_audit(actor_id,action,target,details)
   VALUES(NULL,'Book unpublished after missed response date',thread.book_id,jsonb_build_object('thread',thread.id));
  END IF;
  UPDATE public.mc_threads SET deadline_enforced_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=thread.id;
  hidden:=hidden+1;
 END LOOP;
 RETURN hidden;
END $$;
REVOKE ALL ON FUNCTION public.mc_enforce_book_deadlines() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE src text;
BEGIN
 src:=pg_get_functiondef('public.mc_call(text,jsonb)'::regprocedure);
 src:=regexp_replace(src,'^CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 IF position('submit_listing_appeal' in src)=0 THEN
  IF position('RETURN jsonb_build_object(''threads'',items,''total'',total,''sanctions'',result);' in src)=0
     OR position('IF p_action IN (''user_reply'',''submit_appeal'') THEN' in src)=0
     OR position('ELSIF p_action=''appeal_decision'' THEN' in src)=0 THEN
   RAISE EXCEPTION 'mc_call does not match the resolve-conversation function this patch expects. Re-run supabase-moderation-resolve-conversations.sql first.';
  END IF;
  src:=replace(src,
   'RETURN jsonb_build_object(''threads'',items,''total'',total,''sanctions'',result);',
   'RETURN jsonb_build_object(''threads'',items,''total'',total,''sanctions'',result,''listings'',public.mc_inbox_listings(uid));');
  src:=replace(src,
   'RETURN jsonb_build_object(''id'',tid,''subject'',thread.subject,''bookId'',thread.book_id,''deadline'',thread.deadline,''resolvedAt'',thread.resolved_at,''messages'',items,''total'',total);',
   'RETURN jsonb_build_object(''id'',tid,''subject'',thread.subject,''bookId'',thread.book_id,''deadline'',thread.deadline,''resolvedAt'',thread.resolved_at,''deadlineEnforcedAt'',thread.deadline_enforced_at,''listingAppealStatus'',(SELECT status FROM public.mc_listing_appeals WHERE thread_id=tid ORDER BY created_at DESC,id DESC LIMIT 1),''messages'',items,''total'',total);');
  src:=replace(src,
   'IF p_action IN (''user_reply'',''submit_appeal'') THEN',
   'IF p_action IN (''user_reply'',''submit_appeal'',''submit_listing_appeal'') THEN');
  src:=replace(src,
   'target:=(p_payload->>''sanctionId'')::uuid;',
   $q$IF p_action='submit_listing_appeal' THEN
 result:=public.mc_submit_listing_appeal((p_payload->>'threadId')::uuid,txt);
 INSERT INTO public.mc_requests(user_id,request_id,result) VALUES(uid,req,result);
 RETURN result;
 END IF;
 target:=(p_payload->>'sanctionId')::uuid;$q$);
  src:=replace(src,
   '''pendingAppeals'',(SELECT count(*) FROM public.mc_appeals WHERE status IN (''pending'',''awaiting_information''))',
   '''pendingAppeals'',(SELECT count(*) FROM public.mc_appeals WHERE status IN (''pending'',''awaiting_information''))+(SELECT count(*) FROM public.mc_listing_appeals WHERE status IN (''pending'',''awaiting_information''))');
  src:=replace(src,
   'IF p_action=''appeals'' THEN
 WITH rows AS (SELECT a.*,public.mc_name(a.user_id) AS username,s.kind,s.reason,s.created_by,public.mc_name(s.created_by) AS original_actor FROM public.mc_appeals a JOIN public.mc_sanctions s ON s.id=a.sanction_id WHERE coalesce(p_payload->>''status'',''all'')=''all'' OR a.status=p_payload->>''status'')
 SELECT jsonb_build_object(''items'',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET off)q),''[]''),''total'',(SELECT count(*) FROM rows)) INTO result; RETURN result;
 END IF;',
   'IF p_action=''appeals'' THEN result:=public.mc_appeal_queue(p_payload,off); RETURN result; END IF;');
  src:=replace(src,
   'ELSIF p_action=''appeal_decision'' THEN
 rid:=(p_payload->>''id'')::uuid;SELECT * INTO appeal FROM public.mc_appeals WHERE id=rid FOR UPDATE;',
   $q$ELSIF p_action='appeal_decision' THEN
 rid:=(p_payload->>'id')::uuid;
 IF EXISTS(SELECT 1 FROM public.mc_listing_appeals WHERE id=rid) THEN
 result:=public.mc_decide_listing_appeal(rid,(p_payload->>'version')::integer,p_payload->>'decision',txt);
 INSERT INTO public.mc_requests(user_id,request_id,result) VALUES(uid,req,result);
 RETURN result;
 END IF;
 SELECT * INTO appeal FROM public.mc_appeals WHERE id=rid FOR UPDATE;$q$);
  IF position('submit_listing_appeal' in src)=0 THEN
   RAISE EXCEPTION 'Could not add submit_listing_appeal to mc_call. Re-run supabase-moderation-resolve-conversations.sql first.';
  END IF;
  EXECUTE src;
 END IF;
 IF position('submit_listing_appeal' in pg_get_functiondef('public.mc_call(text,jsonb)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'submit_listing_appeal was not installed into mc_call.';
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.mc_call(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_call(text,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
