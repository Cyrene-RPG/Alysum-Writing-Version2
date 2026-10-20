-- DISPOSABLE notifications_test database only.
SELECT public.test_inbox_assert(current_database()='notifications_test','disposable database required');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind IN ('new_book','new_chapter')),'no historical alerts');
INSERT INTO public.author_follows(follower_id,author_id) VALUES
('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002'),
('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;

SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.set_book_subscription('subscription-old',true);
SELECT public.set_book_subscription('subscription-old',true);
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.book_subscriptions),'idempotent subscription');
DO $$ BEGIN
    BEGIN INSERT INTO public.book_subscriptions VALUES(auth.uid(),'subscription-old',now());
        RAISE EXCEPTION 'Direct subscription insert allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN DELETE FROM public.book_subscriptions;
        RAISE EXCEPTION 'Direct subscription delete allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN UPDATE public.book_subscriptions SET subscriber_id='10000000-0000-0000-0000-000000000004';
        RAISE EXCEPTION 'Direct subscription update allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM * FROM public.notification_chapters;
        RAISE EXCEPTION 'Private chapter ledger exposed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
SELECT public.test_inbox_assert((SELECT count(*)=0 FROM public.book_subscriptions),'subscriptions are private');
SELECT public.set_book_subscription('subscription-old',true);
SELECT public.set_reading_notification_preferences(true,true,false,false,false);
RESET ROLE;

-- Publishing a scheduled chapter body without releasing its ID must not notify.
UPDATE public.library SET data=jsonb_set(data,'{summary}','"Edited"') WHERE id='subscription-old';
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind='new_chapter'),'no alert for metadata or unreleased chapter');
UPDATE public.library SET data=jsonb_set(data,'{publishedChapterIds}','["c1","scheduled"]') WHERE id='subscription-old';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='new_chapter' AND recipient_id='10000000-0000-0000-0000-000000000003'),'released chapter notifies subscriber');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind='new_chapter' AND recipient_id='10000000-0000-0000-0000-000000000004'),'chapter preference opt-out');
UPDATE public.library SET data=jsonb_set(data,'{chapters,1,title}','"Renamed"') WHERE id='subscription-old';
UPDATE public.library SET data=jsonb_set(data,'{publishedChapterIds}','["c1"]') WHERE id='subscription-old';
UPDATE public.library SET data=jsonb_set(data,'{publishedChapterIds}','["scheduled","c1"]') WHERE id='subscription-old';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='new_chapter'),'rename and rerelease do not duplicate');

SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.test_inbox_assert((SELECT chapter_id='scheduled' FROM public.get_reading_notification_target(
    (SELECT id FROM public.inbox_notifications WHERE kind='new_chapter'))),'chapter destination');
SELECT public.set_book_subscription('subscription-old',false);
RESET ROLE;
UPDATE public.library SET data=data || '{"publishedChapterIds":["c1","scheduled","c3"],"chapters":[{"id":"c1"},{"id":"scheduled"},{"id":"c3","title":"After unsubscribe","locked":true,"wordCount":600}]}' WHERE id='subscription-old';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='new_chapter'),'unsubscribe stops chapter alerts');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.set_book_subscription('subscription-old',true);
RESET ROLE;
UPDATE public.library SET data=jsonb_set(data,'{summary}','"Still no catch-up"') WHERE id='subscription-old';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='new_chapter'),'resubscribe does not backfill');
UPDATE public.library SET data=jsonb_set(data,'{chapters}',(data->'chapters') || '[{"id":"c4","title":"Locked chapter","locked":true,"wordCount":600}]')
    || '{"publishedChapterIds":["c1","scheduled","c3","c4"]}' WHERE id='subscription-old';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='new_chapter' AND chapter_id='c4'),'locked release alerts without granting access');

-- New books go to author followers, not every subscriber.
INSERT INTO public.library(id,user_id,data) VALUES('subscription-new','10000000-0000-0000-0000-000000000002','{"title":"New book","isPublished":true,"chapters":[{"id":"first","wordCount":600}]}');
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='new_book' AND book_id='subscription-new' AND recipient_id='10000000-0000-0000-0000-000000000003'),'new book reaches follower');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind='new_book' AND recipient_id='10000000-0000-0000-0000-000000000004'),'new book preference opt-out');
UPDATE public.library SET data=jsonb_set(data,'{isPublished}','false') WHERE id='subscription-new';
UPDATE public.library SET data=jsonb_set(data,'{isPublished}','true') WHERE id='subscription-new';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='new_book' AND book_id='subscription-new' AND recipient_id='10000000-0000-0000-0000-000000000003'),'republish not a new book');
SET ROLE authenticated;
RESET ROLE;
SELECT min(id) AS other_notification_id FROM public.inbox_notifications WHERE kind='new_chapter' \\gset
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.get_reading_notification_target(:'other_notification_id'::bigint))),'other recipient cannot resolve target');
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
DO $$ BEGIN
    BEGIN PERFORM public.set_book_subscription('subscription-new',true);
        RAISE EXCEPTION 'Owner subscription allowed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE '%own book%' THEN RAISE; END IF;
    END;
END $$;
RESET ROLE;

-- Hidden destinations are unavailable even if the message was previously delivered.
INSERT INTO public.library_book_moderation VALUES('subscription-old','hidden');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.get_reading_notification_target(
    (SELECT min(id) FROM public.inbox_notifications WHERE kind='new_chapter'))),'hidden destination unavailable');
DO $$ BEGIN
    BEGIN PERFORM public.set_book_subscription('subscription-old',true);
        RAISE EXCEPTION 'Hidden subscription allowed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE '%not available%' THEN RAISE; END IF;
    END;
END $$;
SELECT public.set_book_subscription('subscription-old',false);
RESET ROLE;
DELETE FROM public.library_book_moderation WHERE book_id='subscription-old';

-- Anonymous publication does not identify the author to their followers.
INSERT INTO public.library(id,user_id,data) VALUES('subscription-anonymous','10000000-0000-0000-0000-000000000002','{"title":"Anonymous book","isPublished":true,"isAnonymous":true,"chapters":[]}');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind='new_book' AND book_id='subscription-anonymous'),'anonymous author not exposed');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.set_book_subscription('subscription-anonymous',true);
SELECT public.set_reading_notification_preferences(true,true,false,true,false);
RESET ROLE;
UPDATE public.library SET data=jsonb_set(data,'{chapters}','[{"id":"anon1","wordCount":600}]') WHERE id='subscription-anonymous';
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE book_id='subscription-anonymous'),'chapter global preference honored');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.set_reading_notification_preferences(true,true,false,true,true);
-- Old clients can save their original preferences without resetting new preferences.
SELECT public.set_notification_preferences(false,true,false);
SELECT public.test_inbox_assert((SELECT new_books AND new_chapters FROM public.notification_preferences WHERE user_id=auth.uid()),'old preference RPC preserves new settings');
RESET ROLE;
UPDATE public.library SET data=jsonb_set(data,'{chapters}',(data->'chapters') || '[{"id":"anon2","wordCount":600}]') WHERE id='subscription-anonymous';
SELECT public.test_inbox_assert((SELECT count(*)=1 AND bool_and(actor_id IS NULL) FROM public.inbox_notifications WHERE book_id='subscription-anonymous'),'anonymous chapter actor remains private');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
DELETE FROM public.author_follows WHERE author_id='10000000-0000-0000-0000-000000000002';
RESET ROLE;
INSERT INTO public.library(id,user_id,data) VALUES('subscription-after-unfollow','10000000-0000-0000-0000-000000000002','{"isPublished":true}');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE book_id='subscription-after-unfollow' AND recipient_id='10000000-0000-0000-0000-000000000003'),'unfollow stops new book alerts');

SET ROLE anon;
DO $$ BEGIN
    BEGIN PERFORM public.set_book_subscription('subscription-new',true);
        RAISE EXCEPTION 'Anonymous subscription allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM * FROM public.book_subscriptions;
        RAISE EXCEPTION 'Anonymous subscription read allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

CREATE TEMP TABLE reading_before_rerun AS SELECT count(*) AS count FROM public.inbox_notifications;
\ir ../../../supabase/live-site/supabase-book-subscriptions.sql
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications)=(SELECT count FROM reading_before_rerun),'rerun sends no alerts');
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.book_subscriptions WHERE book_id='subscription-anonymous'),'rerun preserves subscriptions');
DELETE FROM public.library WHERE id='subscription-anonymous';
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.book_subscriptions WHERE book_id='subscription-anonymous'),'deleted book clears subscriptions');
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.notification_books WHERE book_id='subscription-anonymous'),'deleted book retains dedupe ledger');
SELECT 'All reading notification checks passed' AS result;
