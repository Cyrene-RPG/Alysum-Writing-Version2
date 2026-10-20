-- Integration checks for a disposable PostgreSQL notifications_test database.
\set ON_ERROR_STOP on
SELECT public.test_inbox_assert(current_database()='notifications_test','disposable database guard');
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications)=0,'no historical notification flood');
SELECT public.test_inbox_assert((SELECT count(*) FROM public.notification_follow_pairs)=1,'existing follow baseline recorded');
SELECT public.test_inbox_assert((SELECT count(*) FROM public.notifications WHERE id='legacy-beta-message')=1,'legacy notifications preserved');

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
INSERT INTO public.author_follows VALUES ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',now());
DELETE FROM public.author_follows WHERE follower_id=auth.uid();
INSERT INTO public.author_follows VALUES ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',now());
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications WHERE kind='follower')=1,'re-follow does not duplicate');
SELECT public.test_inbox_assert((SELECT message FROM public.inbox_notifications WHERE kind='follower')='Reader <One> started following you.','public name used without email');
SELECT set_config('test.other_notification_id',(SELECT min(id)::text FROM public.inbox_notifications),false);

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
SET ROLE authenticated;
DELETE FROM public.author_follows WHERE follower_id=auth.uid();
INSERT INTO public.author_follows VALUES ('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002',now());
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications)=1,'existing follows do not backfill after re-follow');

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT * FROM public.set_notification_preferences(false,true,false);
RESET ROLE;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
SET ROLE authenticated;
INSERT INTO public.author_follows VALUES ('10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002',now());
SELECT * FROM public.set_notification_preferences(true,false,false);
RESET ROLE;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT * FROM public.set_notification_preferences(true,true,false);
RESET ROLE;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
SET ROLE authenticated;
DELETE FROM public.author_follows WHERE follower_id=auth.uid();
INSERT INTO public.author_follows VALUES ('10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002',now());
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications WHERE kind='follower')=1,'muted follows are remembered without later duplicate');

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT * FROM public.save_announcement('20000000-0000-0000-0000-000000000002','author','announcement','Fresh post','No spoilers',NULL,false,NULL);
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications WHERE kind='author_announcement')=0,'draft has no notifications');
SET ROLE authenticated;
SELECT * FROM public.save_announcement('20000000-0000-0000-0000-000000000002','author','announcement','Fresh post','No spoilers',NULL,true,
    (SELECT updated_at FROM public.announcements WHERE id='20000000-0000-0000-0000-000000000002'));
SELECT * FROM public.save_announcement('20000000-0000-0000-0000-000000000002','author','announcement','Edited post','Edited text',NULL,false,
    (SELECT updated_at FROM public.announcements WHERE id='20000000-0000-0000-0000-000000000002'));
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications WHERE kind='author_announcement')=2,'only eligible followers notified once');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE recipient_id='10000000-0000-0000-0000-000000000005'),'author announcement opt-out respected');
UPDATE public.announcements SET status='draft',published_at=NULL WHERE id='20000000-0000-0000-0000-000000000001';
UPDATE public.announcements SET status='published',published_at=now() WHERE id='20000000-0000-0000-0000-000000000001';
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications WHERE kind='author_announcement')=2,'historical republish does not backfill');

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT * FROM public.save_announcement('20000000-0000-0000-0000-000000000003','site','new','Site news','Details',NULL,true,NULL);
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications WHERE kind='site_update')=0,'site notifications default off');
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
SELECT * FROM public.set_notification_preferences(true,true,true);
SELECT set_config('test.reader_snapshot',(public.get_inbox_summary()->>'latestId'),false);
RESET ROLE;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT * FROM public.save_announcement('20000000-0000-0000-0000-000000000004','site','fixed','New fix','Details',NULL,true,NULL);
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications WHERE kind='site_update')=1,'only opted-in users receive site updates');

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications)=2,'RLS exposes only the current inbox');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE recipient_id <> auth.uid()),'cross-account rows hidden');
SELECT public.mark_inbox_notifications_read(current_setting('test.reader_snapshot')::bigint);
SELECT public.test_inbox_assert((public.get_inbox_summary()->>'unreadCount')::integer=1,'mark all leaves later arrival unread');
SELECT public.set_inbox_notification_read(current_setting('test.reader_snapshot')::bigint,false);
SELECT public.test_inbox_assert((public.get_inbox_summary()->>'unreadCount')::integer=2,'mark unread persists');
DO $$ BEGIN
    BEGIN
        PERFORM public.set_inbox_notification_read(current_setting('test.other_notification_id')::bigint,true);
        RAISE EXCEPTION 'Cross-account read mutation unexpectedly allowed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'Notification not found.' THEN RAISE; END IF;
    END;
    BEGIN
        INSERT INTO public.inbox_notifications(recipient_id,kind,title,message,source_key)
            VALUES (auth.uid(),'follower','Forged','Fake','forged');
        RAISE EXCEPTION 'Direct insert unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        UPDATE public.inbox_notifications SET title='Forged';
        RAISE EXCEPTION 'Direct update unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        DELETE FROM public.inbox_notifications;
        RAISE EXCEPTION 'Direct delete unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        SELECT count(*) FROM public.notification_follow_pairs;
        RAISE EXCEPTION 'Private follower ledger exposed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
    BEGIN
        PERFORM public.get_inbox_summary();
        RAISE EXCEPTION 'Anonymous summary unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        SELECT count(*) FROM public.inbox_notifications;
        RAISE EXCEPTION 'Anonymous inbox unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT public.test_inbox_assert((SELECT read_at IS NULL FROM public.inbox_notifications WHERE id=current_setting('test.other_notification_id')::bigint),'other users read state unchanged');

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
DELETE FROM public.author_follows WHERE follower_id=auth.uid();
RESET ROLE;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT * FROM public.save_announcement('20000000-0000-0000-0000-000000000005','author','announcement','After unfollow','Details',NULL,true,NULL);
RESET ROLE;
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE recipient_id='10000000-0000-0000-0000-000000000003' AND announcement_id='20000000-0000-0000-0000-000000000005'),'unfollow stops future announcements');
DELETE FROM public.announcements WHERE id='20000000-0000-0000-0000-000000000004';
SELECT public.test_inbox_assert(EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind='site_update' AND announcement_id IS NULL),'deleted source leaves a safe unavailable notification');
CREATE TEMP TABLE inbox_count_before_rerun AS SELECT count(*) AS total FROM public.inbox_notifications;
\ir ../../../supabase/live-site/supabase-notifications-inbox.sql
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications)=(SELECT total FROM inbox_count_before_rerun),'rerunning migration preserves count');
SELECT public.test_inbox_assert((SELECT data->>'kind' FROM public.notifications WHERE id='legacy-beta-message')='beta-share','legacy table remains untouched');
SELECT 'All notification database checks passed' AS result;
