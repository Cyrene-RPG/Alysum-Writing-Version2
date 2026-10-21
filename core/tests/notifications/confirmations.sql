-- DISPOSABLE notifications_test database only, after reading.sql.
SELECT public.test_inbox_assert(current_database()='notifications_test','disposable database required');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind IN ('follow_confirmation','subscription_confirmation')),'no historical confirmations');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.set_reading_notification_preferences(false,false,false,false,false);
DELETE FROM public.author_follows WHERE author_id='10000000-0000-0000-0000-000000000006';
INSERT INTO public.author_follows VALUES(auth.uid(),'10000000-0000-0000-0000-000000000006',now()) ON CONFLICT DO NOTHING;
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='follow_confirmation' AND recipient_id=auth.uid()),'follow receipt goes to follower, including with delivery preferences off');
SELECT public.test_inbox_assert((SELECT bool_and(actor_id='10000000-0000-0000-0000-000000000006') FROM public.inbox_notifications WHERE kind='follow_confirmation'),'follow receipt identifies followed author');
INSERT INTO public.author_follows VALUES(auth.uid(),'10000000-0000-0000-0000-000000000006',now()) ON CONFLICT DO NOTHING;
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='follow_confirmation'),'follow retry does not duplicate');
DELETE FROM public.author_follows WHERE author_id='10000000-0000-0000-0000-000000000006';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='follow_confirmation'),'unfollow does not create a confirmation');
INSERT INTO public.author_follows VALUES(auth.uid(),'10000000-0000-0000-0000-000000000006',now()) ON CONFLICT DO NOTHING;
SELECT public.test_inbox_assert((SELECT count(*)=2 FROM public.inbox_notifications WHERE kind='follow_confirmation'),'new follow action gets a fresh receipt');

SELECT public.set_book_subscription('subscription-old',true);
SELECT public.set_book_subscription('subscription-old',true);
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='subscription_confirmation'),'subscription retries do not duplicate');
SELECT public.test_inbox_assert((SELECT book_id='subscription-old' FROM public.get_reading_notification_target(
    (SELECT max(id) FROM public.inbox_notifications WHERE kind='subscription_confirmation'))),'subscription receipt opens book');
SELECT max(id) AS confirmation_id FROM public.inbox_notifications WHERE kind='subscription_confirmation' \gset
SELECT public.set_book_subscription('subscription-old',false);
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.inbox_notifications WHERE kind='subscription_confirmation'),'unsubscribe does not create a receipt');
SELECT public.set_book_subscription('subscription-old',true);
SELECT public.test_inbox_assert((SELECT count(*)=2 FROM public.inbox_notifications WHERE kind='subscription_confirmation'),'resubscribe gets one fresh receipt');
SELECT public.test_inbox_assert(NOT has_function_privilege('authenticated','public.confirm_author_follow()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.confirm_book_subscription()','EXECUTE'),'trigger delivery cannot be invoked directly');

SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.inbox_notifications WHERE kind IN ('follow_confirmation','subscription_confirmation')),'receipts are private');
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.get_reading_notification_target(:'confirmation_id'::bigint)),'other user cannot resolve receipt');
RESET ROLE;
INSERT INTO public.library_book_moderation VALUES('subscription-old','hidden');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.test_inbox_assert(NOT EXISTS(SELECT 1 FROM public.get_reading_notification_target(:'confirmation_id'::bigint)),'hidden book cannot be opened through confirmation');
RESET ROLE;
DELETE FROM public.library_book_moderation WHERE book_id='subscription-old';

CREATE TEMP TABLE confirmations_before_rerun AS SELECT count(*) AS count FROM public.inbox_notifications;
\ir ../../../supabase/live-site/supabase-book-subscriptions.sql
\ir ../../../supabase/live-site/supabase-notification-confirmations.sql
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications)=(SELECT count FROM confirmations_before_rerun),'both setup scripts can rerun without resending receipts');
SELECT public.test_inbox_assert((SELECT count(*)=2 FROM public.inbox_notifications WHERE kind='subscription_confirmation' AND recipient_id='10000000-0000-0000-0000-000000000003'),'rerun preserves receipts');
SELECT 'All confirmation checks passed' AS result;
