-- New book reporting system. Run in the LIVE Supabase SQL Editor.
-- Safe to rerun. Creates separate tables; does not read, alter or delete earlier reports.
-- Uses the existing moderation_staff membership and get_published_book reading API.
BEGIN;
CREATE TABLE IF NOT EXISTS public.book_reports_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 book_id text NOT NULL,
 book_title text NOT NULL,
 author_label text NOT NULL,
 reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reason text NOT NULL CHECK(reason IN ('suspected_ai','improper_tags','incorrect_rating','plagiarism','harassment','site_rules','spam','other')),
 explanation text NOT NULL CHECK(char_length(btrim(explanation)) BETWEEN 10 AND 4000),
 chapter_id text NOT NULL DEFAULT '',
 chapter_title text NOT NULL DEFAULT '',
 tag_details text NOT NULL DEFAULT '' CHECK(char_length(tag_details)<=1000),
 supporting_url text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','under_review','resolved','dismissed')),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(reason<>'improper_tags' OR char_length(btrim(tag_details))>0)
);
CREATE UNIQUE INDEX IF NOT EXISTS book_reports_v2_one_open ON public.book_reports_v2(reporter_id,book_id) WHERE status IN ('new','under_review');
CREATE INDEX IF NOT EXISTS book_reports_v2_queue_idx ON public.book_reports_v2(status,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS book_reports_v2_book_idx ON public.book_reports_v2(book_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS book_reports_v2_rate_idx ON public.book_reports_v2(reporter_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.book_report_events_v2 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 report_id uuid NOT NULL REFERENCES public.book_reports_v2(id),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('submitted','followup','review')),
 body text NOT NULL DEFAULT '' CHECK(char_length(body)<=4000),
 from_status text,
 to_status text,
 request_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_report_events_v2_timeline_idx ON public.book_report_events_v2(report_id,id DESC);
CREATE INDEX IF NOT EXISTS book_report_events_v2_rate_idx ON public.book_report_events_v2(actor_id,created_at DESC) WHERE kind='followup';

CREATE OR REPLACE FUNCTION public.book_reports_v2_is_staff()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
BEGIN
 IF auth.uid() IS NULL OR to_regclass('public.moderation_staff') IS NULL THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.moderation_staff WHERE user_id=auth.uid() AND role::text IN ('admin','moderator','staff'));
END $$;

ALTER TABLE public.book_reports_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_report_events_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS book_reports_v2_staff_read ON public.book_reports_v2;
CREATE POLICY book_reports_v2_staff_read ON public.book_reports_v2 FOR SELECT TO authenticated USING(public.book_reports_v2_is_staff());
DROP POLICY IF EXISTS book_report_events_v2_staff_read ON public.book_report_events_v2;
CREATE POLICY book_report_events_v2_staff_read ON public.book_report_events_v2 FOR SELECT TO authenticated USING(public.book_reports_v2_is_staff());
REVOKE ALL ON public.book_reports_v2,public.book_report_events_v2 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.book_reports_v2,public.book_report_events_v2 TO authenticated;
REVOKE ALL ON SEQUENCE public.book_report_events_v2_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.book_reports_v2_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to report a book.'; END IF;
 RETURN jsonb_build_object('staff',public.book_reports_v2_is_staff());
END $$;

-- A reader can fetch their open report, but never staff notes or another reader's report.
CREATE OR REPLACE FUNCTION public.book_reports_v2_own(p_book_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE r public.book_reports_v2%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to report a book.'; END IF;
 SELECT * INTO r FROM public.book_reports_v2 WHERE book_id=p_book_id AND reporter_id=auth.uid() AND status IN ('new','under_review');
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'reason',r.reason,'createdAt',r.created_at);
END $$;

CREATE OR REPLACE FUNCTION public.book_reports_v2_submit(
 p_request_id uuid,p_book_id text,p_reason text,p_explanation text,
 p_chapter_id text DEFAULT '',p_tag_details text DEFAULT '',p_supporting_url text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE
 u uuid:=auth.uid(); r public.book_reports_v2%ROWTYPE; b jsonb; ch_title text:='';
 v_text text:=btrim(coalesce(p_explanation,'')); v_tags text:=btrim(coalesce(p_tag_details,''));
 v_link text:=btrim(coalesce(p_supporting_url,'')); n timestamptz:=clock_timestamp();
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in to report a book.'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing submission identifier. Close and reopen the report form.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('book-reports-v2:'||u::text,0));
 SELECT * INTO r FROM public.book_reports_v2 WHERE request_id=p_request_id AND reporter_id=u;
 IF FOUND THEN RETURN jsonb_build_object('id',r.id,'status',r.status,'existing',false); END IF;
 SELECT * INTO r FROM public.book_reports_v2 WHERE reporter_id=u AND book_id=p_book_id AND status IN ('new','under_review');
 IF FOUND THEN RETURN jsonb_build_object('id',r.id,'status',r.status,'existing',true); END IF;
 IF p_reason IS NULL OR p_reason NOT IN ('suspected_ai','improper_tags','incorrect_rating','plagiarism','harassment','site_rules','spam','other') THEN RAISE EXCEPTION 'Choose a reason for reporting.'; END IF;
 IF char_length(v_text) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Explain your concern in 10–4,000 characters.'; END IF;
 IF char_length(v_tags)>1000 OR (p_reason='improper_tags' AND v_tags='') THEN RAISE EXCEPTION 'Tell staff which tags or warnings are missing or incorrect (up to 1,000 characters).'; END IF;
 IF char_length(v_link)>2000 OR (v_link<>'' AND (v_link !~* '^https?://[^[:space:]/]+[^[:space:]]*$' OR v_link ~* '^https?://[^/]*@')) THEN RAISE EXCEPTION 'Use a complete http or https supporting link without sign-in credentials.'; END IF;
 SELECT x.data INTO b FROM public.get_published_book(p_book_id) x;
 IF b IS NULL THEN RAISE EXCEPTION 'This book is not available for reporting.'; END IF;
 IF coalesce(p_chapter_id,'')<>'' THEN
  SELECT value->>'title' INTO ch_title FROM jsonb_array_elements(coalesce(b->'chapters','[]'::jsonb))
   WHERE value->>'id'=p_chapter_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an available chapter or Whole book.'; END IF;
 END IF;
 IF (SELECT count(*) FROM public.book_reports_v2 WHERE reporter_id=u AND created_at>n-interval '1 hour')>=5
 OR (SELECT count(*) FROM public.book_reports_v2 WHERE reporter_id=u AND created_at>n-interval '24 hours')>=20 THEN
  RAISE EXCEPTION 'You have reached the reporting limit. Please try again later.';
 END IF;
 INSERT INTO public.book_reports_v2(request_id,book_id,book_title,author_label,reporter_id,reason,explanation,chapter_id,chapter_title,tag_details,supporting_url)
 VALUES(p_request_id,p_book_id,left(coalesce(nullif(b->>'title',''),'Untitled'),500),
 left(coalesce(nullif(b->>'author',''),nullif(b->>'authorName',''),'Unknown'),500),u,p_reason,v_text,coalesce(p_chapter_id,''),coalesce(ch_title,''),v_tags,v_link) RETURNING * INTO r;
 INSERT INTO public.book_report_events_v2(report_id,actor_id,kind,to_status) VALUES(r.id,u,'submitted','new');
 RETURN jsonb_build_object('id',r.id,'status',r.status,'existing',false);
END $$;

CREATE OR REPLACE FUNCTION public.book_reports_v2_followup(p_report_id uuid,p_text text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE u uuid:=auth.uid(); r public.book_reports_v2%ROWTYPE; v_text text:=btrim(coalesce(p_text,'')); n timestamptz:=clock_timestamp();
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in to add information.'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing submission identifier.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('book-reports-v2:'||u::text,0));
 SELECT * INTO r FROM public.book_reports_v2 WHERE id=p_report_id AND reporter_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open report not found.'; END IF;
 IF EXISTS(SELECT 1 FROM public.book_report_events_v2 WHERE report_id=r.id AND request_id=p_request_id AND actor_id=u AND kind='followup') THEN RETURN jsonb_build_object('id',r.id,'status',r.status); END IF;
 IF r.status NOT IN ('new','under_review') THEN RAISE EXCEPTION 'This report is closed. You can submit a new report if needed.'; END IF;
 IF char_length(v_text) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Add 10–4,000 characters of information.'; END IF;
 IF (SELECT count(*) FROM public.book_report_events_v2 WHERE actor_id=u AND kind='followup' AND created_at>n-interval '1 hour')>=10
 OR (SELECT count(*) FROM public.book_report_events_v2 WHERE actor_id=u AND kind='followup' AND created_at>n-interval '24 hours')>=30 THEN RAISE EXCEPTION 'You have reached the update limit. Please try again later.'; END IF;
 INSERT INTO public.book_report_events_v2(report_id,actor_id,kind,body,request_id) VALUES(r.id,u,'followup',v_text,p_request_id);
 UPDATE public.book_reports_v2 SET updated_at=clock_timestamp(),version=version+1 WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id,'status',r.status);
END $$;

CREATE OR REPLACE FUNCTION public.book_reports_v2_queue(p_status text DEFAULT 'open',p_reason text DEFAULT '',p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE result jsonb; total bigint;
BEGIN
 IF NOT public.book_reports_v2_is_staff() THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('open','all','new','under_review','resolved','dismissed') THEN RAISE EXCEPTION 'Invalid report status.'; END IF;
 IF p_reason IS NULL OR (p_reason<>'' AND p_reason NOT IN ('suspected_ai','improper_tags','incorrect_rating','plagiarism','harassment','site_rules','spam','other')) THEN RAISE EXCEPTION 'Invalid report reason.'; END IF;
 WITH matching AS (
 SELECT * FROM public.book_reports_v2 WHERE (p_status='all' OR (p_status='open' AND status IN ('new','under_review')) OR status=p_status) AND (p_reason='' OR reason=p_reason)
 ) SELECT count(DISTINCT book_id) INTO total FROM matching;
 WITH matching AS (
 SELECT * FROM public.book_reports_v2 WHERE (p_status='all' OR (p_status='open' AND status IN ('new','under_review')) OR status=p_status) AND (p_reason='' OR reason=p_reason)
 ), grouped AS (
 SELECT book_id,(array_agg(book_title ORDER BY updated_at DESC,id DESC))[1] AS title,
 (array_agg(author_label ORDER BY updated_at DESC,id DESC))[1] AS author,
 count(*) AS report_count,count(*) FILTER(WHERE status='new') AS new_count,
 max(updated_at) AS latest_at FROM matching GROUP BY book_id
 ORDER BY max(updated_at) DESC,book_id LIMIT 30 OFFSET greatest(0,coalesce(p_offset,0))
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('bookId',book_id,'title',title,'author',author,'reportCount',report_count,'newCount',new_count,'latestAt',latest_at) ORDER BY latest_at DESC,book_id),'[]'::jsonb) INTO result FROM grouped;
 RETURN jsonb_build_object('items',result,'total',total);
END $$;

CREATE OR REPLACE FUNCTION public.book_reports_v2_book(p_book_id text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE items jsonb; total bigint;
BEGIN
 IF NOT public.book_reports_v2_is_staff() THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 SELECT count(*) INTO total FROM public.book_reports_v2 WHERE book_id=p_book_id;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO items FROM (
 SELECT id,reason,status,created_at,chapter_title FROM public.book_reports_v2 WHERE book_id=p_book_id ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET greatest(0,coalesce(p_offset,0))
 ) q;
 RETURN jsonb_build_object('items',items,'total',total);
END $$;

CREATE OR REPLACE FUNCTION public.book_reports_v2_detail(p_report_id uuid,p_event_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE r public.book_reports_v2%ROWTYPE; events jsonb; total bigint; reporter jsonb;
BEGIN
 IF NOT public.book_reports_v2_is_staff() THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 SELECT * INTO r FROM public.book_reports_v2 WHERE id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
 SELECT jsonb_build_object('id',u.id,'name',coalesce(nullif(to_jsonb(u)->>'display_name',''),nullif(to_jsonb(u)->>'username',''),u.id::text)) INTO reporter FROM public.users u WHERE u.id=r.reporter_id;
 SELECT count(*) INTO total FROM public.book_report_events_v2 WHERE report_id=r.id;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC),'[]'::jsonb) INTO events FROM (
 SELECT e.*,coalesce(nullif(to_jsonb(u)->>'display_name',''),nullif(to_jsonb(u)->>'username',''),e.actor_id::text,'Deleted account') AS actor_name
 FROM public.book_report_events_v2 e LEFT JOIN public.users u ON u.id=e.actor_id WHERE report_id=r.id ORDER BY e.id DESC LIMIT 100 OFFSET greatest(0,coalesce(p_event_offset,0))
 ) q;
 RETURN jsonb_build_object('report',to_jsonb(r),'reporter',reporter,'events',events,'totalEvents',total);
END $$;

CREATE OR REPLACE FUNCTION public.book_reports_v2_review(p_report_id uuid,p_status text,p_note text,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE r public.book_reports_v2%ROWTYPE; v_note text:=btrim(coalesce(p_note,''));
BEGIN
 IF NOT public.book_reports_v2_is_staff() THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('new','under_review','resolved','dismissed') THEN RAISE EXCEPTION 'Choose a valid status.'; END IF;
 IF char_length(v_note)>4000 THEN RAISE EXCEPTION 'Keep staff notes to 4,000 characters.'; END IF;
 IF p_status IN ('resolved','dismissed') AND char_length(v_note)<10 THEN RAISE EXCEPTION 'Describe the outcome in at least 10 characters before closing this report.'; END IF;
 SELECT * INTO r FROM public.book_reports_v2 WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
 IF p_expected_version IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'This report changed. Reload it before saving your review.'; END IF;
 IF p_status=r.status AND v_note='' THEN RAISE EXCEPTION 'Add a staff note or change the status.'; END IF;
 INSERT INTO public.book_report_events_v2(report_id,actor_id,kind,body,from_status,to_status) VALUES(r.id,auth.uid(),'review',v_note,r.status,p_status);
 UPDATE public.book_reports_v2 SET status=p_status,version=version+1,updated_at=clock_timestamp() WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id,'status',p_status,'version',r.version+1);
END $$;

DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,16)='book_reports_v2_'
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
