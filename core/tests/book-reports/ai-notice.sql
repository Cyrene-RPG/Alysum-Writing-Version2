\set ON_ERROR_STOP on
SELECT public.report_test_assert(current_database()='book_reports_test' OR current_setting('test.ai_notice_disposable',true)='1','disposable notice database');
ALTER TABLE public.library ADD COLUMN IF NOT EXISTS user_id uuid;
INSERT INTO public.library(id,data,user_id) VALUES
 ('ai-notice','{"title":"Notice test","isAnonymous":true}','00000000-0000-0000-0000-000000000006'),
 ('ai-hidden','{"hidden":true}','00000000-0000-0000-0000-000000000006'),
 ('ai-draft','{"isPublished":false}','00000000-0000-0000-0000-000000000006');
SET request.jwt.claim.sub=''; SET ROLE anon;
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('ai-notice'),'zero reports');
RESET ROLE;
INSERT INTO public.book_reports_v2(request_id,book_id,book_title,author_label,reporter_id,reason,explanation,status)
 VALUES(gen_random_uuid(),'ai-notice','Notice test','Author','00000000-0000-0000-0000-000000000003','suspected_ai','A substantive concern.','resolved');
SET ROLE anon;
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('ai-notice'),'one report');
RESET ROLE;
-- Repeat reports by the same account, deleted reporters, unrelated reasons and self-reports do not reach the threshold.
INSERT INTO public.book_reports_v2(request_id,book_id,book_title,author_label,reporter_id,reason,explanation,status) VALUES
 (gen_random_uuid(),'ai-notice','Notice test','Author','00000000-0000-0000-0000-000000000003','suspected_ai','A repeated concern.','resolved'),
 (gen_random_uuid(),'ai-notice','Notice test','Author',NULL,'suspected_ai','A deleted reporter.','resolved'),
 (gen_random_uuid(),'ai-notice','Notice test','Author','00000000-0000-0000-0000-000000000004','other','An unrelated concern.','resolved'),
 (gen_random_uuid(),'ai-notice','Notice test','Author','00000000-0000-0000-0000-000000000006','suspected_ai','The owner self-reported.','resolved');
SET ROLE anon;
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('ai-notice'),'distinct non-owner readers only');
RESET ROLE;
INSERT INTO public.book_reports_v2(request_id,book_id,book_title,author_label,reporter_id,reason,explanation,status)
 VALUES(gen_random_uuid(),'ai-notice','Notice test','Author','00000000-0000-0000-0000-000000000004','suspected_ai','A second reader concern.','new');
SET ROLE anon;
SELECT public.report_test_assert(public.book_reports_v2_ai_notice('ai-notice'),'two independent AI reports show guest notice');
SELECT public.report_expect_error($q$SELECT * FROM public.book_reports_v2$q$,'permission denied');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006'; SET ROLE authenticated;
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('ai-notice'),'real owner excluded even for anonymous publication');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000005'; SET ROLE authenticated;
SELECT public.report_test_assert(public.book_reports_v2_ai_notice('ai-notice'),'other signed-in reader sees notice');
SELECT public.report_test_assert((SELECT count(*) FROM public.book_reports_v2)=0,'threshold does not expose report rows');
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('missing'),'unavailable book');
RESET ROLE;
UPDATE public.book_reports_v2 SET status='dismissed' WHERE book_id='ai-notice' AND reporter_id='00000000-0000-0000-0000-000000000004' AND reason='suspected_ai';
SET ROLE authenticated;
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('ai-notice'),'staff dismissal removes report from threshold');
RESET ROLE;
INSERT INTO public.book_reports_v2(request_id,book_id,book_title,author_label,reporter_id,reason,explanation,status)
 SELECT gen_random_uuid(),b,'Hidden','Author',u::uuid,'suspected_ai','A substantive concern.','new'
 FROM unnest(ARRAY['ai-hidden','ai-draft']) b CROSS JOIN unnest(ARRAY['00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004']) u;
SET ROLE anon;
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('ai-hidden'),'hidden book never flagged publicly');
SELECT public.report_test_assert(NOT public.book_reports_v2_ai_notice('ai-draft'),'draft never flagged publicly');
RESET ROLE;
