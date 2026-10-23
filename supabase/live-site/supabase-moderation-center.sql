-- Alysum live Moderation Center. Apply AFTER supabase-book-reports-v2.sql.
-- Transactional; safe to rerun; preserves reports, conversations, sanctions and audit.
-- No earlier reporting code/data is inspected or deleted.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.book_reports_v2') IS NULL OR to_regclass('public.moderation_staff') IS NULL OR to_regclass('public.inbox_notifications') IS NULL THEN
 RAISE EXCEPTION 'Apply the book reporting and inbox migrations first.'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.mc_staff_overrides(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN ('admin','moderator','none')));
CREATE TABLE IF NOT EXISTS public.mc_staff_sessions(session_id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS public.mc_sanctions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('warning','commenting','publishing','announcements','suspension','ban')),reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 160),explanation text NOT NULL CHECK(length(explanation) BETWEEN 10 AND 4000),expires_at timestamptz,revoked_at timestamptz,revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX IF NOT EXISTS mc_sanctions_user_idx ON public.mc_sanctions(user_id,created_at DESC) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS public.mc_activity(user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,day date NOT NULL,reading boolean NOT NULL DEFAULT false,writing boolean NOT NULL DEFAULT false,community integer NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day));
CREATE TABLE IF NOT EXISTS public.mc_threads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,book_id text,report_id uuid REFERENCES public.book_reports_v2(id) ON DELETE SET NULL,subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 160),deadline date,recipient_read_at timestamptz,staff_read_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS public.mc_messages(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,thread_id uuid NOT NULL REFERENCES public.mc_threads(id) ON DELETE CASCADE,sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,side text NOT NULL CHECK(side IN ('staff','user')),body text NOT NULL CHECK(length(body) BETWEEN 10 AND 4000),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX IF NOT EXISTS mc_messages_thread_idx ON public.mc_messages(thread_id,id DESC);
CREATE INDEX IF NOT EXISTS mc_threads_recipient_idx ON public.mc_threads(recipient_id,updated_at DESC,id);
CREATE TABLE IF NOT EXISTS public.mc_appeals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sanction_id uuid NOT NULL REFERENCES public.mc_sanctions(id),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,body text NOT NULL CHECK(length(body) BETWEEN 10 AND 4000),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','awaiting_information','upheld','granted')),decision text NOT NULL DEFAULT '',decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE UNIQUE INDEX IF NOT EXISTS mc_appeals_open_idx ON public.mc_appeals(user_id,sanction_id) WHERE status IN ('pending','awaiting_information');
CREATE TABLE IF NOT EXISTS public.mc_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,action text NOT NULL,target text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS public.mc_requests(user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,request_id uuid NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,request_id));
CREATE TABLE IF NOT EXISTS public.mc_case_meta(report_id uuid PRIMARY KEY REFERENCES public.book_reports_v2(id),assigned_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,follow_up_at date,phase text CHECK(phase IN ('new','under_review','awaiting_changes','resolved','dismissed')));
CREATE TABLE IF NOT EXISTS public.mc_book_visibility(book_id text PRIMARY KEY,visibility text NOT NULL CHECK(visibility IN ('visible','hidden','removed')),reason text NOT NULL,updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS public.mc_ip_blocks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address inet NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),expires_at timestamptz NOT NULL,revoked_at timestamptz,created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.inbox_notifications ADD COLUMN IF NOT EXISTS moderation_thread_id uuid REFERENCES public.mc_threads(id) ON DELETE SET NULL;
DO $$
DECLARE t text; rule text;
BEGIN
 FOREACH t IN ARRAY ARRAY['mc_staff_overrides','mc_staff_sessions','mc_sanctions','mc_activity','mc_threads','mc_messages','mc_appeals','mc_audit','mc_requests','mc_case_meta','mc_book_visibility','mc_ip_blocks'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
 REVOKE ALL ON SEQUENCE public.mc_messages_id_seq,public.mc_audit_id_seq FROM PUBLIC,anon,authenticated;
 SELECT pg_get_expr(conbin,conrelid) INTO rule FROM pg_constraint WHERE conrelid='public.inbox_notifications'::regclass AND conname='inbox_notifications_kind_check';
 IF rule IS NULL THEN RAISE EXCEPTION 'Expected inbox kind constraint is missing. No changes were applied.'; END IF;
 IF position('moderation_message' IN rule)=0 THEN
 ALTER TABLE public.inbox_notifications DROP CONSTRAINT inbox_notifications_kind_check;
 EXECUTE 'ALTER TABLE public.inbox_notifications ADD CONSTRAINT inbox_notifications_kind_check CHECK (('||rule||') OR kind=''moderation_message'')';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mc_role(p_user uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r text;
BEGIN
 SELECT role INTO r FROM public.mc_staff_overrides WHERE user_id=p_user;
 IF FOUND THEN RETURN CASE WHEN r='none' THEN '' ELSE r END; END IF;
 SELECT CASE WHEN role::text='admin' THEN 'admin' WHEN role::text IN ('moderator','staff','mod') THEN 'moderator' ELSE '' END INTO r FROM public.moderation_staff WHERE user_id=p_user;
 RETURN coalesce(r,'');
END $$;
CREATE OR REPLACE FUNCTION public.mc_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT coalesce(nullif(display_name,''),nullif(username,''),id::text) FROM public.users WHERE id=p_user),'Deleted account')
$$;
CREATE OR REPLACE FUNCTION public.mc_verified()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL AND public.mc_role(auth.uid())<>'' AND coalesce(auth.jwt()->>'aal','')='aal2'
 AND EXISTS(SELECT 1 FROM public.mc_staff_sessions m JOIN auth.sessions s ON s.id=m.session_id AND s.user_id=m.user_id
 WHERE m.user_id=auth.uid() AND m.session_id=nullif(auth.jwt()->>'session_id','')::uuid
 AND m.last_seen_at>clock_timestamp()-interval '15 minutes' AND m.verified_at>clock_timestamp()-interval '8 hours')
$$;
CREATE OR REPLACE FUNCTION public.mc_allowed(p_feature text,p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.mc_sanctions WHERE user_id=p_user AND revoked_at IS NULL
 AND (expires_at IS NULL OR expires_at>clock_timestamp()) AND (kind IN ('suspension','ban') OR kind=p_feature))
$$;
CREATE OR REPLACE FUNCTION public.mc_visible(p_book text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.mc_book_visibility WHERE book_id=p_book AND visibility IN ('hidden','removed'))
$$;
CREATE OR REPLACE FUNCTION public.mc_log(p_action text,p_target text,p_details jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 INSERT INTO public.mc_audit(actor_id,action,target,details) VALUES(auth.uid(),p_action,p_target,p_details)
$$;
CREATE OR REPLACE FUNCTION public.mc_notice(p_user uuid,p_subject text,p_body text,p_book text DEFAULT NULL,p_report uuid DEFAULT NULL,p_deadline date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tid uuid; mid bigint;
BEGIN
 INSERT INTO public.mc_threads(recipient_id,subject,book_id,report_id,deadline) VALUES(p_user,p_subject,p_book,p_report,p_deadline) RETURNING id INTO tid;
 INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(tid,auth.uid(),'staff',p_body) RETURNING id INTO mid;
 INSERT INTO public.inbox_notifications(recipient_id,kind,title,message,source_key,moderation_thread_id) VALUES(p_user,'moderation_message','Alysum Moderation: '||p_subject,'You have a private message from the moderation team.','moderation:'||mid,tid) ON CONFLICT DO NOTHING;
 PERFORM public.mc_log('Official message sent',tid::text,jsonb_build_object('recipient',p_user,'book',p_book));
 RETURN tid;
END $$;
CREATE OR REPLACE FUNCTION public.mc_user_summary(p_user uuid,p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a record; u jsonb; s jsonb;
BEGIN
 SELECT count(*) AS active_days,count(*) FILTER(WHERE reading) AS reading_days,count(*) FILTER(WHERE writing) AS writing_days,coalesce(sum(community),0) AS community_actions INTO a FROM public.mc_activity WHERE user_id=p_user AND day>=(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-greatest(1,least(30,p_days))+1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'reason',reason,'expiresAt',expires_at,'createdAt',created_at) ORDER BY created_at DESC),'[]') INTO s FROM public.mc_sanctions WHERE user_id=p_user AND kind<>'warning' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp());
 SELECT jsonb_build_object('id',au.id,'name',coalesce(nullif(p.display_name,''),nullif(p.username,''),'Profile not completed'),'username',coalesce(p.username,''),'accountType',coalesce(to_jsonb(p)->>'account_type',''),'imageUrl',to_jsonb(p)->>'profile_image_url','joinedAt',au.created_at,'lastSeenAt',p.last_seen_at,'role',public.mc_role(au.id),'status',CASE WHEN EXISTS(SELECT 1 FROM public.mc_sanctions WHERE user_id=p_user AND kind='ban' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN 'Banned' WHEN NOT public.mc_allowed('account',p_user) THEN 'Suspended' ELSE 'Active' END,'restrictions',s,'activeDays',a.active_days,'readingDays',a.reading_days,'writingDays',a.writing_days,'communityActions',a.community_actions) INTO u FROM auth.users au LEFT JOIN public.users p ON p.id=au.id WHERE au.id=p_user;
 RETURN u;
END $$;

-- Database enforcement also covers writes made through older security-definer RPCs.
CREATE OR REPLACE FUNCTION public.mc_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.mc_allowed(TG_ARGV[0]) THEN RAISE EXCEPTION 'Your account is restricted. Open Moderation Messages to view the reason or appeal.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$
DECLARE t text; feature text;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND left(tablename,3)<>'mc_' AND tablename NOT IN ('book_reports_v2','book_report_events_v2','inbox_notifications','notification_preferences') LOOP
 feature:=CASE WHEN t='library' THEN 'publishing' WHEN t='comments' THEN 'commenting' WHEN t='announcements' THEN 'announcements' ELSE 'account' END;
 EXECUTE format('DROP TRIGGER IF EXISTS mc_guard ON public.%I',t);
 EXECUTE format('CREATE TRIGGER mc_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mc_write_guard(%L)',t,feature);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.mc_activity_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid; is_write boolean:=TG_TABLE_NAME='books';
BEGIN
 uid:=CASE WHEN is_write THEN auth.uid() ELSE nullif(coalesce(to_jsonb(NEW)->>'user_id',to_jsonb(NEW)->>'author_id'),'')::uuid END;
 IF TG_TABLE_NAME='announcements' AND (to_jsonb(NEW)->>'status' IS DISTINCT FROM 'published' OR (TG_OP='UPDATE' AND to_jsonb(OLD)->>'status'='published')) THEN RETURN NEW; END IF;
 IF uid IS NULL OR auth.uid() IS DISTINCT FROM uid OR NOT public.mc_allowed('account',uid) THEN RETURN NEW; END IF;
 INSERT INTO public.mc_activity(user_id,day,writing,community) VALUES(uid,(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date,is_write,CASE WHEN is_write THEN 0 ELSE 1 END)
 ON CONFLICT(user_id,day) DO UPDATE SET writing=mc_activity.writing OR EXCLUDED.writing,community=mc_activity.community+EXCLUDED.community;
 RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['books','comments','announcements'] LOOP
 IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
 EXECUTE format('DROP TRIGGER IF EXISTS mc_activity_write ON public.%I',t);
 EXECUTE format('CREATE TRIGGER mc_activity_write AFTER INSERT %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mc_activity_write()',CASE WHEN t IN ('books','announcements') THEN 'OR UPDATE' ELSE '' END,t);
 END LOOP;
END $$;

-- Existing published-reading and catalog interfaces keep their return types.
DO $$ BEGIN
 IF to_regprocedure('public.mc_base_get_published_book(text)') IS NULL THEN ALTER FUNCTION public.get_published_book(text) RENAME TO mc_base_get_published_book; END IF;
 IF to_regprocedure('public.mc_base_library_catalog_rows()') IS NULL THEN ALTER FUNCTION public.library_catalog_rows() RENAME TO mc_base_library_catalog_rows; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_published_book(p_book_id text)
RETURNS TABLE(id text,user_id uuid,data jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT b.* FROM public.mc_base_get_published_book(p_book_id) b WHERE public.mc_visible(b.id)
$$;
CREATE OR REPLACE FUNCTION public.library_catalog_rows()
RETURNS TABLE(id text,user_id uuid,data jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT b.* FROM public.mc_base_library_catalog_rows() b WHERE public.mc_visible(b.id)
$$;
-- The existing view depends on the old function OID, so point it at the filtered wrapper.
CREATE OR REPLACE VIEW public.library_catalog WITH(security_invoker=true) AS SELECT * FROM public.library_catalog_rows();
REVOKE ALL ON FUNCTION public.mc_base_get_published_book(text),public.mc_base_library_catalog_rows() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_book(text),public.library_catalog_rows() TO anon,authenticated;
GRANT SELECT ON public.library_catalog TO anon,authenticated;
DROP POLICY IF EXISTS mc_public_visibility ON public.library;
CREATE POLICY mc_public_visibility ON public.library AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.mc_visible(id::text) OR user_id=auth.uid());

-- Require fresh staff verification for all v2 reporting RPCs and raw-row policies.
CREATE OR REPLACE FUNCTION public.book_reports_v2_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.mc_verified() $$;

CREATE OR REPLACE FUNCTION public.mc_call(p_action text,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 uid uuid:=auth.uid(); v_role text; result jsonb; items jsonb; total bigint; req uuid; target uuid; rid uuid; tid uuid; bid text; txt text; v_reason text; v_kind text;
 duration integer; deadline timestamptz; off integer:=greatest(0,least(100000,coalesce((p_payload->>'offset')::integer,0))); days integer:=coalesce((p_payload->>'days')::integer,7);
 r public.book_reports_v2%ROWTYPE; sanction public.mc_sanctions%ROWTYPE; appeal public.mc_appeals%ROWTYPE;
 thread public.mc_threads%ROWTYPE; sid uuid; choice text; item record;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
 IF p_action IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION 'Invalid moderation request.'; END IF;
 v_role:=public.mc_role(uid);
 IF p_action='access' THEN RETURN jsonb_build_object('role',v_role,'verified',public.mc_verified(),'name',public.mc_name(uid)); END IF;
 IF p_action='account_status' THEN
 RETURN jsonb_build_object('blocked',NOT public.mc_allowed('account'),'restrictions',(public.mc_user_summary(uid)->'restrictions'));
 END IF;
 IF p_action='activity' THEN
 IF NOT public.mc_allowed('account') THEN RETURN jsonb_build_object('blocked',true); END IF;
 UPDATE public.users SET last_seen_at=clock_timestamp() WHERE id=uid AND (last_seen_at IS NULL OR last_seen_at<clock_timestamp()-interval '90 seconds');
 INSERT INTO public.mc_activity(user_id,day,reading) VALUES(uid,(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date,p_payload->>'kind'='reading')
 ON CONFLICT(user_id,day) DO UPDATE SET reading=mc_activity.reading OR EXCLUDED.reading;
 RETURN jsonb_build_object('blocked',false);
 END IF;
 IF p_action='start' THEN
 IF v_role='' THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 IF coalesce(auth.jwt()->>'aal','')<>'aal2' THEN RAISE EXCEPTION 'Complete two-factor verification to open moderation.'; END IF;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 IF public.mc_verified() THEN RETURN jsonb_build_object('role',v_role,'verified',true,'name',public.mc_name(uid)); END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=sid AND user_id=uid AND created_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'A fresh staff sign-in is required.'; END IF;
 INSERT INTO public.mc_staff_sessions(session_id,user_id) VALUES(sid,uid) ON CONFLICT(session_id) DO UPDATE SET verified_at=clock_timestamp(),last_seen_at=clock_timestamp() WHERE mc_staff_sessions.user_id=uid;
 PERFORM public.mc_log('Staff workspace verified',sid::text);
 RETURN jsonb_build_object('role',v_role,'verified',true,'name',public.mc_name(uid));
 END IF;
 IF p_action='end' THEN
 DELETE FROM public.mc_staff_sessions WHERE user_id=uid AND session_id=nullif(auth.jwt()->>'session_id','')::uuid;
 RETURN jsonb_build_object('ended',true);
 END IF;

 -- Recipient routes remain available during suspensions and bans.
 IF p_action='my_notification' THEN
 SELECT moderation_thread_id INTO tid FROM public.inbox_notifications WHERE id=(p_payload->>'id')::bigint AND recipient_id=uid;
 IF tid IS NULL THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
 RETURN jsonb_build_object('threadId',tid);
 END IF;
 IF p_action='my_inbox' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.updated_at DESC,q.id DESC),'[]') INTO items FROM (
 SELECT id,subject,book_id,deadline,updated_at,recipient_read_at FROM public.mc_threads WHERE recipient_id=uid ORDER BY updated_at DESC,id DESC LIMIT 50 OFFSET off)q;
 SELECT count(*) INTO total FROM public.mc_threads WHERE recipient_id=uid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'reason',s.reason,'explanation',s.explanation,'expiresAt',s.expires_at,'createdAt',s.created_at,'appealStatus',(SELECT status FROM public.mc_appeals WHERE sanction_id=s.id AND user_id=uid ORDER BY created_at DESC LIMIT 1)) ORDER BY s.created_at DESC),'[]') INTO result FROM public.mc_sanctions s WHERE s.user_id=uid AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp());
 RETURN jsonb_build_object('threads',items,'total',total,'sanctions',result);
 END IF;
 IF p_action='my_thread' THEN
 tid:=(p_payload->>'id')::uuid;
 SELECT * INTO thread FROM public.mc_threads WHERE id=tid AND recipient_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
 UPDATE public.mc_threads SET recipient_read_at=clock_timestamp() WHERE id=tid;
 UPDATE public.inbox_notifications SET read_at=coalesce(read_at,clock_timestamp()) WHERE recipient_id=uid AND moderation_thread_id=tid AND read_at IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'side',q.side,'body',q.body,'createdAt',q.created_at) ORDER BY q.id),'[]') INTO items FROM (
 SELECT id,side,body,created_at FROM public.mc_messages WHERE thread_id=tid ORDER BY id DESC LIMIT 100 OFFSET off)q;
 SELECT count(*) INTO total FROM public.mc_messages WHERE thread_id=tid;
 RETURN jsonb_build_object('id',tid,'subject',thread.subject,'bookId',thread.book_id,'deadline',thread.deadline,'messages',items,'total',total);
 END IF;
 IF p_action IN ('user_reply','submit_appeal') THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('mc:recipient:'||uid::text,0));
 req:=(p_payload->>'requestId')::uuid; IF req IS NULL THEN RAISE EXCEPTION 'Missing request identifier.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc:'||uid::text||req::text,0));
 SELECT mc_requests.result INTO result FROM public.mc_requests WHERE user_id=uid AND request_id=req; IF FOUND THEN RETURN result; END IF;
 txt:=btrim(coalesce(p_payload->>'body','')); IF length(txt) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Enter 10–4,000 characters.'; END IF;
 IF p_action='user_reply' THEN
 tid:=(p_payload->>'threadId')::uuid;
 PERFORM 1 FROM public.mc_threads WHERE id=tid AND recipient_id=uid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
 IF (SELECT count(*) FROM public.mc_messages WHERE sender_id=uid AND side='user' AND created_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'Message limit reached. Please try again later.'; END IF;
 INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(tid,uid,'user',txt);
 UPDATE public.mc_threads SET updated_at=clock_timestamp(),recipient_read_at=clock_timestamp() WHERE id=tid;
 result:=jsonb_build_object('id',tid);
 ELSE
 target:=(p_payload->>'sanctionId')::uuid;
 SELECT * INTO sanction FROM public.mc_sanctions WHERE id=target AND user_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Restriction not found.'; END IF;
 IF EXISTS(SELECT 1 FROM public.mc_appeals WHERE user_id=uid AND sanction_id=target AND status IN ('pending','awaiting_information')) THEN RAISE EXCEPTION 'You already have an open appeal for this restriction.'; END IF;
 IF (SELECT count(*) FROM public.mc_appeals WHERE user_id=uid AND created_at>clock_timestamp()-interval '24 hours')>=5 THEN RAISE EXCEPTION 'Appeal limit reached. Please try again tomorrow.'; END IF;
 INSERT INTO public.mc_appeals(user_id,sanction_id,body) VALUES(uid,target,txt) RETURNING id INTO rid;
 PERFORM public.mc_log('Appeal submitted',rid::text);
 result:=jsonb_build_object('id',rid);
 END IF;
 INSERT INTO public.mc_requests(user_id,request_id,result) VALUES(uid,req,result);
 RETURN result;
 END IF;

 IF NOT public.mc_verified() THEN RAISE EXCEPTION 'Fresh staff verification is required. Sign in to the Moderation Center again.'; END IF;
 UPDATE public.mc_staff_sessions SET last_seen_at=clock_timestamp() WHERE session_id=(auth.jwt()->>'session_id')::uuid AND user_id=uid;
 IF p_action IN ('staff','ips','set_staff','ip_add','ip_remove') AND v_role<>'admin' THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 IF p_action='dashboard' THEN
 RETURN jsonb_build_object('users',(SELECT count(*) FROM auth.users),'newUsers',(SELECT count(*) FROM auth.users WHERE (created_at AT TIME ZONE 'America/Los_Angeles')::date=(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date),'openReports',(SELECT count(*) FROM public.book_reports_v2 WHERE status IN ('new','under_review')),'unassigned',(SELECT count(*) FROM public.book_reports_v2 r LEFT JOIN public.mc_case_meta m ON m.report_id=r.id WHERE r.status IN ('new','under_review') AND m.assigned_id IS NULL),'pendingAppeals',(SELECT count(*) FROM public.mc_appeals WHERE status IN ('pending','awaiting_information')),'authorReplies',(SELECT count(*) FROM public.mc_threads t WHERE EXISTS(SELECT 1 FROM public.mc_messages m WHERE m.thread_id=t.id AND side='user' AND m.created_at>coalesce(t.staff_read_at,'epoch'))),'role',v_role,'name',public.mc_name(uid));
 END IF;
 IF p_action='users' THEN
 WITH rows AS (
 SELECT au.id,au.created_at,public.mc_user_summary(au.id,CASE WHEN days=30 THEN 30 ELSE 7 END) AS summary FROM auth.users au LEFT JOIN public.users u ON u.id=au.id
 WHERE (coalesce(p_payload->>'query','')='' OR coalesce(u.display_name,'')||' '||coalesce(u.username,'')||' '||au.id::text ILIKE '%'||left(p_payload->>'query',100)||'%')
 AND (p_payload->>'view' IS DISTINCT FROM 'new' OR (au.created_at AT TIME ZONE 'America/Los_Angeles')::date BETWEEN coalesce(nullif(p_payload->>'from','')::date,(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-6) AND coalesce(nullif(p_payload->>'through','')::date,(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date))
 ), filtered AS (SELECT * FROM rows WHERE coalesce(p_payload->>'status','all')='all' OR summary->>'status'=p_payload->>'status'),
 paged AS (SELECT * FROM filtered ORDER BY CASE WHEN p_payload->>'view'='active' THEN coalesce((summary->>CASE WHEN p_payload->>'measure' IN ('readingDays','writingDays','communityActions') THEN p_payload->>'measure' ELSE 'activeDays' END)::bigint,0) END DESC NULLS LAST,created_at DESC,id LIMIT 50 OFFSET off)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(summary) FROM paged),'[]'),'total',(SELECT count(*) FROM filtered),'trackingStartedAt',(SELECT min(day) FROM public.mc_activity)) INTO result;
 RETURN result;
 END IF;
 IF p_action='user' THEN
 target:=(p_payload->>'id')::uuid;
 result:=public.mc_user_summary(target,days); IF result IS NULL THEN RAISE EXCEPTION 'User not found.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'reason',reason,'explanation',explanation,'expiresAt',expires_at,'revokedAt',revoked_at,'createdAt',created_at,'createdBy',public.mc_name(created_by)) ORDER BY created_at DESC),'[]') INTO items FROM (SELECT * FROM public.mc_sanctions WHERE user_id=target ORDER BY created_at DESC LIMIT 100)q;
 RETURN result||jsonb_build_object('sanctions',items,'protected',EXISTS(SELECT 1 FROM public.moderation_staff WHERE user_id=target) OR EXISTS(SELECT 1 FROM public.mc_staff_overrides WHERE user_id=target),'books',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',left(data->>'title',500))),'[]') FROM public.library WHERE user_id=target),'reports',(SELECT count(*) FROM public.book_reports_v2 r JOIN public.library l ON l.id::text=r.book_id WHERE l.user_id=target));
 END IF;
 IF p_action='reports' THEN
 WITH filtered AS (
 SELECT r.*,m.assigned_id,m.follow_up_at,coalesce(m.phase,r.status) AS phase FROM public.book_reports_v2 r LEFT JOIN public.mc_case_meta m ON m.report_id=r.id WHERE
 (coalesce(p_payload->>'status','open')='all' OR (coalesce(p_payload->>'status','open')='open' AND r.status IN ('new','under_review')) OR coalesce(m.phase,r.status)=p_payload->>'status')
 AND (coalesce(p_payload->>'reason','')='' OR r.reason=p_payload->>'reason')
 ), paged AS (SELECT id,book_id,book_title,author_label,reason,status,phase,assigned_id,public.mc_name(assigned_id) AS assigned_name,follow_up_at,created_at,updated_at,version FROM filtered ORDER BY updated_at DESC,id DESC LIMIT 50 OFFSET off)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged),'[]'),'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
 END IF;
 IF p_action='report' THEN
 rid:=(p_payload->>'id')::uuid;
 result:=public.book_reports_v2_detail(rid,off);
 SELECT * INTO r FROM public.book_reports_v2 WHERE id=rid;
 SELECT user_id INTO target FROM public.library WHERE id::text=r.book_id;
 RETURN result||jsonb_build_object('ownerId',target,'conflict',target=uid OR r.reporter_id=uid,'caseMeta',(SELECT to_jsonb(m) FROM public.mc_case_meta m WHERE report_id=rid),'staff',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',public.mc_name(id))),'[]') FROM auth.users WHERE public.mc_role(id)<>''));
 END IF;
 IF p_action='books' THEN
 WITH filtered AS (SELECT l.id,l.user_id,left(l.data->>'title',500) AS title,left(l.data->>'author',500) AS author,coalesce(v.visibility,'visible') AS visibility,v.reason,CASE WHEN jsonb_typeof(l.data->'chapters')='array' THEN jsonb_array_length(l.data->'chapters') ELSE 0 END AS chapters,(SELECT count(*) FROM public.book_reports_v2 WHERE book_id=l.id::text) AS reports FROM public.library l LEFT JOIN public.mc_book_visibility v ON v.book_id=l.id::text WHERE (coalesce(p_payload->>'query','')='' OR l.data->>'title' ILIKE '%'||left(p_payload->>'query',100)||'%') AND (coalesce(p_payload->>'status','all')='all' OR coalesce(v.visibility,'visible')=p_payload->>'status'))
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM filtered ORDER BY title,id LIMIT 50 OFFSET off)q),'[]'),'total',(SELECT count(*) FROM filtered)) INTO result; RETURN result;
 END IF;
 IF p_action='conversations' THEN
 WITH rows AS (SELECT t.*,public.mc_name(recipient_id) AS recipient_name,(SELECT body FROM public.mc_messages WHERE thread_id=t.id ORDER BY id DESC LIMIT 1) AS latest_body,EXISTS(SELECT 1 FROM public.mc_messages WHERE thread_id=t.id AND side='user' AND created_at>coalesce(t.staff_read_at,'epoch')) AS unread FROM public.mc_threads t WHERE (coalesce(p_payload->>'query','')='' OR t.subject ILIKE '%'||left(p_payload->>'query',100)||'%'))
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY updated_at DESC,id DESC LIMIT 50 OFFSET off)q),'[]'),'total',(SELECT count(*) FROM rows)) INTO result; RETURN result;
 END IF;
 IF p_action='conversation' THEN
 tid:=(p_payload->>'id')::uuid; SELECT * INTO thread FROM public.mc_threads WHERE id=tid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
 UPDATE public.mc_threads SET staff_read_at=clock_timestamp() WHERE id=tid;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]') INTO items FROM (SELECT id,side,body,public.mc_name(sender_id) AS sender_name,created_at FROM public.mc_messages WHERE thread_id=tid ORDER BY id DESC LIMIT 100 OFFSET off)q;
 RETURN jsonb_build_object('thread',to_jsonb(thread),'recipientName',public.mc_name(thread.recipient_id),'messages',items,'total',(SELECT count(*) FROM public.mc_messages WHERE thread_id=tid));
 END IF;
 IF p_action='appeals' THEN
 WITH rows AS (SELECT a.*,public.mc_name(a.user_id) AS username,s.kind,s.reason,s.created_by,public.mc_name(s.created_by) AS original_actor FROM public.mc_appeals a JOIN public.mc_sanctions s ON s.id=a.sanction_id WHERE coalesce(p_payload->>'status','all')='all' OR a.status=p_payload->>'status')
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET off)q),'[]'),'total',(SELECT count(*) FROM rows)) INTO result; RETURN result;
 END IF;
 IF p_action='audit' THEN
 WITH rows AS (SELECT a.*,public.mc_name(actor_id) AS actor_name FROM public.mc_audit a WHERE coalesce(p_payload->>'query','')='' OR action||' '||target ILIKE '%'||left(p_payload->>'query',100)||'%')
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY id DESC LIMIT 100 OFFSET off)q),'[]'),'total',(SELECT count(*) FROM rows)) INTO result; RETURN result;
 END IF;
 IF p_action='staff' THEN
 RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',public.mc_name(id),'role',public.mc_role(id))),'[]') FROM auth.users WHERE public.mc_role(id)<>'' OR EXISTS(SELECT 1 FROM public.mc_staff_overrides o WHERE o.user_id=auth.users.id)));
 END IF;
 IF p_action='ips' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC),'[]') INTO items FROM (SELECT id,address::text AS address,reason,expires_at,revoked_at,created_at,public.mc_name(created_by) AS created_by FROM public.mc_ip_blocks ORDER BY created_at DESC LIMIT 100 OFFSET off)q;
 RETURN jsonb_build_object('items',items,'total',(SELECT count(*) FROM public.mc_ip_blocks));
 END IF;

 -- Every mutation has an idempotency key, even after a network retry.
 IF p_action NOT IN ('sanction','revoke_sanction','message','staff_reply','report_save','book_visibility','appeal_decision','set_staff','ip_add','ip_remove') THEN RAISE EXCEPTION 'Unknown moderation action.'; END IF;
 req:=(p_payload->>'requestId')::uuid; IF req IS NULL THEN RAISE EXCEPTION 'Missing request identifier.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc:'||uid::text||req::text,0));
 SELECT mc_requests.result INTO result FROM public.mc_requests WHERE user_id=uid AND request_id=req; IF FOUND THEN RETURN result; END IF;
 txt:=btrim(coalesce(p_payload->>'body',p_payload->>'note',''));
 v_reason:=btrim(coalesce(p_payload->>'reason',''));
 IF length(txt) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Enter a clear explanation in 10–4,000 characters.'; END IF;
 IF p_action='sanction' THEN
 target:=(p_payload->>'userId')::uuid;v_kind:=p_payload->>'kind';
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target) THEN RAISE EXCEPTION 'User not found.'; END IF;
 IF target=uid OR EXISTS(SELECT 1 FROM public.moderation_staff WHERE user_id=target) OR EXISTS(SELECT 1 FROM public.mc_staff_overrides WHERE user_id=target) THEN RAISE EXCEPTION 'Protected staff accounts cannot be sanctioned here.'; END IF;
 IF v_kind IS NULL OR v_kind NOT IN ('warning','commenting','publishing','announcements','suspension','ban') THEN RAISE EXCEPTION 'Choose a valid account action.'; END IF;
 IF length(v_reason) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Identify the relevant rule or reason.'; END IF;
 IF v_kind='ban' AND v_role<>'admin' THEN RAISE EXCEPTION 'Only admins can permanently ban accounts.'; END IF;
 duration:=coalesce((p_payload->>'days')::integer,7);
 IF v_kind NOT IN ('warning','ban') AND duration NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Choose a duration between 1 and 30 days.'; END IF;
 deadline:=CASE WHEN v_kind IN ('warning','ban') THEN NULL ELSE clock_timestamp()+make_interval(days=>duration) END;
 INSERT INTO public.mc_sanctions(user_id,kind,reason,explanation,expires_at,created_by) VALUES(target,v_kind,v_reason,txt,deadline,uid) RETURNING id INTO rid;
 tid:=public.mc_notice(target,'Account action: '||v_kind,v_reason||E'\n\n'||txt||CASE WHEN deadline IS NULL THEN '' ELSE E'\nExpires: '||deadline::text END||E'\nYou can reply here or appeal this restriction in Moderation Messages.');
 PERFORM public.mc_log('Account action: '||v_kind,target::text,jsonb_build_object('sanction',rid,'expiresAt',deadline,'reason',v_reason));
 result:=jsonb_build_object('id',rid,'threadId',tid);
 ELSIF p_action='revoke_sanction' THEN
 rid:=(p_payload->>'id')::uuid; SELECT * INTO sanction FROM public.mc_sanctions WHERE id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Restriction not found.'; END IF;
 IF sanction.v_kind='ban' AND v_role<>'admin' THEN RAISE EXCEPTION 'Only admins can reverse a permanent ban.'; END IF;
 UPDATE public.mc_sanctions SET revoked_at=clock_timestamp(),revoked_by=uid WHERE id=rid;
 tid:=public.mc_notice(sanction.user_id,'Account restriction lifted',txt);
 PERFORM public.mc_log('Restriction reversed',rid::text,jsonb_build_object('reason',txt));
 result:=jsonb_build_object('id',rid,'threadId',tid);
 ELSIF p_action='message' THEN
 target:=(p_payload->>'userId')::uuid;bid:=nullif(p_payload->>'bookId','');rid:=nullif(p_payload->>'reportId','')::uuid;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target) THEN RAISE EXCEPTION 'User not found.'; END IF;
 IF length(btrim(coalesce(p_payload->>'subject',''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Enter a subject in 3–160 characters.'; END IF;
 IF bid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.library WHERE id::text=bid AND user_id=target) THEN RAISE EXCEPTION 'The selected book does not belong to this user.'; END IF;
 IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.book_reports_v2 WHERE id=rid AND book_id=bid) THEN RAISE EXCEPTION 'The selected report does not match the book.'; END IF;
 IF txt ~ '\[[^]]+\]' THEN RAISE EXCEPTION 'Replace message template placeholders before sending.'; END IF;
 tid:=public.mc_notice(target,btrim(p_payload->>'subject'),txt,bid,rid,nullif(p_payload->>'deadline','')::date);
 result:=jsonb_build_object('id',tid);
 ELSIF p_action='staff_reply' THEN
 tid:=(p_payload->>'threadId')::uuid; SELECT * INTO thread FROM public.mc_threads WHERE id=tid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.'; END IF;
 INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(tid,uid,'staff',txt) RETURNING id INTO total;
 UPDATE public.mc_threads SET updated_at=clock_timestamp(),staff_read_at=clock_timestamp() WHERE id=tid;
 INSERT INTO public.inbox_notifications(recipient_id,kind,title,message,source_key,moderation_thread_id) VALUES(thread.recipient_id,'moderation_message','Alysum Moderation: '||thread.subject,'Staff replied to your private conversation.','moderation:'||total,tid) ON CONFLICT DO NOTHING;
 PERFORM public.mc_log('Staff reply sent',tid::text);
 result:=jsonb_build_object('id',tid);
 ELSIF p_action='report_save' THEN
 rid:=(p_payload->>'id')::uuid; SELECT * INTO r FROM public.book_reports_v2 WHERE id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
 IF r.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'This report changed. Reload it before saving.'; END IF;
 target:=nullif(p_payload->>'assignee','')::uuid;choice:=p_payload->>'status';
 IF target IS NOT NULL AND public.mc_role(target)='' THEN RAISE EXCEPTION 'Choose a current staff member.'; END IF;
 IF r.reporter_id=uid OR EXISTS(SELECT 1 FROM public.library WHERE id::text=r.book_id AND user_id=uid) THEN
 IF target IS NULL OR target=uid THEN RAISE EXCEPTION 'Hand this case to another staff member.'; END IF;
 INSERT INTO public.mc_case_meta(report_id,assigned_id) VALUES(rid,target) ON CONFLICT(report_id) DO UPDATE SET assigned_id=EXCLUDED.assigned_id;
 UPDATE public.book_reports_v2 SET version=version+1,updated_at=clock_timestamp() WHERE id=rid;
 PERFORM public.mc_log('Case handed off',rid::text,jsonb_build_object('assignee',target));
 ELSE
 IF choice IS NULL OR choice NOT IN ('new','under_review','awaiting_changes','resolved','dismissed') THEN RAISE EXCEPTION 'Choose a valid case status.'; END IF;
 PERFORM public.book_reports_v2_review(rid,CASE WHEN choice='awaiting_changes' THEN 'under_review' ELSE choice END,txt,(p_payload->>'version')::integer);
 INSERT INTO public.mc_case_meta(report_id,assigned_id,phase,follow_up_at) VALUES(rid,target,choice,nullif(p_payload->>'followUp','')::date)
 ON CONFLICT(report_id) DO UPDATE SET assigned_id=EXCLUDED.assigned_id,phase=EXCLUDED.phase,follow_up_at=EXCLUDED.follow_up_at;
 PERFORM public.mc_log('Case updated: '||choice,rid::text,jsonb_build_object('assignee',target));
 END IF;
 result:=jsonb_build_object('id',rid);
 ELSIF p_action='book_visibility' THEN
 bid:=p_payload->>'bookId';choice:=p_payload->>'visibility';
 IF NOT EXISTS(SELECT 1 FROM public.library WHERE id::text=bid) THEN RAISE EXCEPTION 'Book not found.'; END IF;
 IF EXISTS(SELECT 1 FROM public.library WHERE id::text=bid AND user_id=uid) THEN RAISE EXCEPTION 'Another staff member must review your book.'; END IF;
 IF choice IS NULL OR choice NOT IN ('visible','hidden','removed') THEN RAISE EXCEPTION 'Choose a valid visibility.'; END IF;
 IF choice='removed' AND v_role<>'admin' THEN RAISE EXCEPTION 'Only admins can remove public listings.'; END IF;
 INSERT INTO public.mc_book_visibility(book_id,visibility,reason,updated_by) VALUES(bid,choice,txt,uid) ON CONFLICT(book_id) DO UPDATE SET visibility=EXCLUDED.visibility,reason=EXCLUDED.reason,updated_by=uid,updated_at=clock_timestamp();
 PERFORM public.mc_log('Book visibility: '||choice,bid,jsonb_build_object('reason',txt));
 result:=jsonb_build_object('id',bid,'visibility',choice);
 ELSIF p_action='appeal_decision' THEN
 rid:=(p_payload->>'id')::uuid;SELECT * INTO appeal FROM public.mc_appeals WHERE id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Appeal not found.'; END IF;
 IF appeal.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'This appeal changed. Reload before deciding.'; END IF;
 SELECT * INTO sanction FROM public.mc_sanctions WHERE id=appeal.sanction_id FOR UPDATE;
 IF sanction.created_by=uid THEN RAISE EXCEPTION 'Another staff member must review your original decision.'; END IF;
 choice:=p_payload->>'decision'; IF choice IS NULL OR choice NOT IN ('awaiting_information','upheld','granted') THEN RAISE EXCEPTION 'Choose an appeal outcome.'; END IF;
 IF choice='granted' THEN
 IF sanction.v_kind='ban' AND v_role<>'admin' THEN RAISE EXCEPTION 'Only admins can reverse permanent bans.'; END IF;
 UPDATE public.mc_sanctions SET revoked_at=clock_timestamp(),revoked_by=uid WHERE id=sanction.id;
 END IF;
 UPDATE public.mc_appeals SET status=choice,decision=txt,decided_by=uid,version=version+1,updated_at=clock_timestamp() WHERE id=rid;
 tid:=public.mc_notice(appeal.user_id,'Appeal outcome: '||choice,txt);
 PERFORM public.mc_log('Appeal: '||choice,rid::text);
 result:=jsonb_build_object('id',rid,'threadId',tid);
 ELSIF p_action='set_staff' THEN
 target:=(p_payload->>'userId')::uuid;choice:=p_payload->>'role';
 IF target=uid THEN RAISE EXCEPTION 'You cannot change your own staff permissions.'; END IF;
 IF choice IS NULL OR choice NOT IN ('admin','moderator','none') THEN RAISE EXCEPTION 'Choose a valid staff role.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target) THEN RAISE EXCEPTION 'User not found.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mc:staff-membership',0));
 INSERT INTO public.mc_staff_overrides(user_id,role) VALUES(target,choice) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
 DELETE FROM public.mc_staff_sessions WHERE user_id=target;
 PERFORM public.mc_log('Staff role: '||choice,target::text,jsonb_build_object('reason',txt));
 result:=jsonb_build_object('id',target,'role',choice);
 ELSIF p_action='ip_add' THEN
 duration:=coalesce((p_payload->>'hours')::integer,24); IF duration NOT BETWEEN 1 AND 168 THEN RAISE EXCEPTION 'Network blocks must expire within 1 hour to 7 days.'; END IF;
 IF masklen((p_payload->>'address')::inet)<>(CASE WHEN family((p_payload->>'address')::inet)=4 THEN 32 ELSE 128 END) THEN RAISE EXCEPTION 'Enter a single address, not a network range.'; END IF;
 IF length(txt)>1000 THEN RAISE EXCEPTION 'Keep the reason to 1,000 characters.'; END IF;
 INSERT INTO public.mc_ip_blocks(address,reason,expires_at,created_by) VALUES((p_payload->>'address')::inet,txt,clock_timestamp()+make_interval(hours=>duration),uid) RETURNING id INTO rid;
 PERFORM public.mc_log('Temporary IP block added',rid::text,jsonb_build_object('expiresHours',duration));
 result:=jsonb_build_object('id',rid);
 ELSIF p_action='ip_remove' THEN
 rid:=(p_payload->>'id')::uuid; UPDATE public.mc_ip_blocks SET revoked_at=clock_timestamp() WHERE id=rid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Network rule not found.'; END IF;
 PERFORM public.mc_log('IP block removed',rid::text,jsonb_build_object('reason',txt));
 result:=jsonb_build_object('id',rid);
 ELSE RAISE EXCEPTION 'This moderation action is not supported.'; END IF;
 INSERT INTO public.mc_requests(user_id,request_id,result) VALUES(uid,req,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mc_network_blocked(p_address inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.mc_ip_blocks WHERE address=p_address AND revoked_at IS NULL AND expires_at>clock_timestamp())
$$;


-- Direct v2 review calls obey the same conflict rule and produce an audit record.
DO $$ BEGIN
 IF to_regprocedure('public.mc_base_v2_review(uuid,text,text,integer)') IS NULL THEN ALTER FUNCTION public.book_reports_v2_review(uuid,text,text,integer) RENAME TO mc_base_v2_review; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.book_reports_v2_review(p_report_id uuid,p_status text,p_note text,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.mc_verified() THEN RAISE EXCEPTION 'Fresh staff verification is required.'; END IF;
 IF EXISTS(SELECT 1 FROM public.book_reports_v2 r LEFT JOIN public.library l ON l.id::text=r.book_id WHERE r.id=p_report_id AND (r.reporter_id=auth.uid() OR l.user_id=auth.uid())) THEN RAISE EXCEPTION 'Another staff member must review this case.'; END IF;
 result:=public.mc_base_v2_review(p_report_id,p_status,p_note,p_expected_version);
 INSERT INTO public.mc_case_meta(report_id,phase) VALUES(p_report_id,p_status) ON CONFLICT(report_id) DO UPDATE SET phase=EXCLUDED.phase;
 PERFORM public.mc_log('Report reviewed: '||p_status,p_report_id::text);
 RETURN result;
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.moderation_staff FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS mc_ip_lookup_idx ON public.mc_ip_blocks(address,expires_at) WHERE revoked_at IS NULL;

-- Do not expose private helper functions or renamed bypasses through PostgREST.
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,3)='mc_' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.book_reports_v2_review(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_call(text,jsonb),public.book_reports_v2_review(uuid,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mc_visible(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_network_blocked(inet) TO anon,authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
