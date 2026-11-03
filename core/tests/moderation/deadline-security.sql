\set ON_ERROR_STOP on
SELECT public.report_test_assert(current_database()='moderation_test' OR current_setting('test.dm_disposable',true)='1','disposable book-deadline database');
RESET ROLE;
INSERT INTO public.books(id,user_id,data) VALUES
 ('book-1','00000000-0000-0000-0000-000000000003','{"title":"Studio copy one"}'),
 ('book-2','00000000-0000-0000-0000-000000000003','{"title":"Studio copy two"}'),
 ('book-4','00000000-0000-0000-0000-000000000003','{"title":"Studio copy four"}'),
 ('book-5','00000000-0000-0000-0000-000000000003','{"title":"Studio copy five"}'),
 ('book-6','00000000-0000-0000-0000-000000000003','{"title":"Studio copy six"}')
 ON CONFLICT(id) DO NOTHING;
UPDATE auth.sessions SET created_at=clock_timestamp();
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims',jsonb_build_object('session_id','10000000-0000-0000-0000-000000000001','email','staff@example.test','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch FROM clock_timestamp()))))::text,false);
SET ROLE authenticated;
SELECT public.mc_call('start');
SELECT public.report_expect_error($q$SELECT public.mc_enforce_book_deadlines()$q$,'permission denied');
SELECT public.mc_call('message',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000001','userId','00000000-0000-0000-0000-000000000003','bookId','book-1','subject','Please update your book cover','body','Please update the cover for your published book so it no longer uses that image. Reply here once you have changed it.','deadline',((clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-1)::text));
SELECT public.mc_call('message',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000002','userId','00000000-0000-0000-0000-000000000003','bookId','book-2','subject','Please review your content warnings','body','Please review the tags and content warnings for your book, especially the opening chapter. Reply here once you have checked them.','deadline',((clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-1)::text));
SELECT public.mc_call('message',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000003','userId','00000000-0000-0000-0000-000000000003','bookId','book-4','subject','Please review your content warnings','body','Please review the tags and content warnings for your book, especially the opening chapter. Reply here once you have checked them.','deadline',(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date::text));
SELECT public.mc_call('message',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000004','userId','00000000-0000-0000-0000-000000000003','bookId','book-5','subject','Book under review','body','We are reviewing your book following a reader concern. Reply here if you have questions about the listing.','deadline',((clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-1)::text));
SELECT public.mc_call('message',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000005','userId','00000000-0000-0000-0000-000000000003','subject','Account check-in','body','This account message has a passed date and must not unpublish any library listing.','deadline',((clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-1)::text));
SELECT public.mc_call('direct_message',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000006','userId','00000000-0000-0000-0000-000000000003','bookId','book-6','subject','Private cover check-in','body','This private on-site message is about a cover and must not unpublish the library listing.','deadline',((clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date-1)::text));
RESET ROLE;
SELECT set_config('test.mc.cover',(SELECT id::text FROM public.mc_threads WHERE book_id='book-1' AND coalesce(kind,'team')='team' ORDER BY created_at DESC LIMIT 1),false);
SELECT set_config('test.mc.replied',(SELECT id::text FROM public.mc_threads WHERE book_id='book-2' AND coalesce(kind,'team')='team' ORDER BY created_at DESC LIMIT 1),false);
SELECT set_config('test.mc.resolved_book',(SELECT id::text FROM public.mc_threads WHERE book_id='book-5' AND coalesce(kind,'team')='team' ORDER BY created_at DESC LIMIT 1),false);
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SET request.jwt.claims='{"session_id":"10000000-0000-0000-0000-000000000003","aal":"aal1"}';
SET ROLE authenticated;
SELECT public.mc_call('user_reply',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000007','threadId',current_setting('test.mc.replied'),'body','I updated the tags and content warnings on this book as requested.'));
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims',jsonb_build_object('session_id','10000000-0000-0000-0000-000000000001','email','staff@example.test','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch FROM clock_timestamp()))))::text,false);
SET ROLE authenticated;
SELECT public.mc_call('start');
SELECT public.mc_call('resolve_thread',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000008','threadId',current_setting('test.mc.resolved_book')));
RESET ROLE;
SELECT public.report_test_assert(public.mc_enforce_book_deadlines()=1,'one unanswered official book message unpublishes');
SELECT public.report_test_assert(public.mc_enforce_book_deadlines()=0,'deadline enforcement is idempotent');
SELECT public.report_test_assert((SELECT visibility FROM public.mc_book_visibility WHERE book_id='book-1')='hidden','unanswered cover message hides the library listing');
SELECT public.report_test_assert(NOT EXISTS(SELECT 1 FROM public.mc_book_visibility WHERE book_id IN ('book-2','book-4','book-5','book-6') AND visibility IN ('hidden','removed')),'replies, open dates, resolved threads and private messages do not hide listings');
SELECT public.report_test_assert((SELECT count(*) FROM public.library WHERE id='book-1')=1,'library row remains after a missed deadline');
SELECT public.report_test_assert((SELECT count(*) FROM public.books WHERE id='book-1' AND user_id='00000000-0000-0000-0000-000000000003')=1,'studio manuscript remains after a missed deadline');
SELECT public.report_test_assert(coalesce((SELECT data->>'isPublished' FROM public.library WHERE id='book-1'),'true')<>'false','missed deadline does not flip the author publish flag');
SELECT public.report_test_assert((SELECT count(*) FROM public.get_published_book('book-1'))=0,'public reading hides the missed-deadline book');
SELECT public.report_test_assert(NOT EXISTS(SELECT 1 FROM public.library_catalog WHERE id='book-1'),'catalog hides the missed-deadline book');
SELECT public.report_test_assert((SELECT deadline_enforced_at IS NOT NULL FROM public.mc_threads WHERE id=current_setting('test.mc.cover')::uuid),'enforced official threads are marked once');
SELECT public.report_test_assert((SELECT count(*) FROM public.inbox_notifications WHERE source_key='moderation:deadline:'||current_setting('test.mc.cover') AND recipient_id='00000000-0000-0000-0000-000000000003')=1,'recipient is told the listing left the library');
SELECT public.report_test_assert((SELECT count(*) FROM public.mc_audit WHERE action='Book unpublished after missed response date' AND target='book-1')=1,'one audit row for the automatic unpublish');
SELECT public.report_test_assert(NOT EXISTS(SELECT 1 FROM public.mc_audit WHERE action='Book unpublished after missed response date' AND (details ? 'body' OR details::text ILIKE '%Studio copy%')),'deadline audit omits notification copy');
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SET request.jwt.claims='{"session_id":"10000000-0000-0000-0000-000000000003","aal":"aal1"}';
SET ROLE authenticated;
SELECT public.report_test_assert((SELECT count(*) FROM public.books WHERE id='book-1')=1,'author can still open the studio manuscript');
SELECT public.mc_call('user_reply',jsonb_build_object('requestId','a1000000-0000-0000-0000-000000000009','threadId',current_setting('test.mc.cover'),'body','I can still reply after the listing left the public library.'));
RESET ROLE;
CREATE TEMP TABLE deadline_counts AS SELECT (SELECT count(*) FROM public.mc_book_visibility WHERE visibility='hidden') h,(SELECT count(*) FROM public.mc_threads WHERE deadline_enforced_at IS NOT NULL) e,(SELECT count(*) FROM public.books) b;
\ir ../../../supabase/live-site/supabase-moderation-book-deadlines.sql
SELECT public.report_test_assert((SELECT count(*) FROM public.mc_book_visibility WHERE visibility='hidden')=(SELECT h FROM deadline_counts),'rerun preserves hidden listings');
SELECT public.report_test_assert((SELECT count(*) FROM public.mc_threads WHERE deadline_enforced_at IS NOT NULL)=(SELECT e FROM deadline_counts),'rerun preserves enforced deadlines');
SELECT public.report_test_assert((SELECT count(*) FROM public.books)=(SELECT b FROM deadline_counts),'rerun preserves studio manuscripts');
SELECT 'Live moderation book-deadline tests passed';
