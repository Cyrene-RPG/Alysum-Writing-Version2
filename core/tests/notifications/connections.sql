-- Disposable notifications_test only.
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.test_inbox_assert((public.get_my_connections_summary()->>'following')::int=2,'following count is caller-scoped');
SELECT public.test_inbox_assert((public.get_my_connections_summary()->>'subscriptions')::int=3,'subscription count includes own unavailable books');
SELECT public.test_inbox_assert((SELECT count(*)=2 FROM public.list_my_connections('following')),'own followed authors');
SELECT public.test_inbox_assert((SELECT count(*)=0 FROM public.list_my_connections('followers')),'no other author followers');
SELECT public.test_inbox_assert((SELECT count(*)=3 FROM public.list_my_connections('subscriptions')),'own subscriptions only');
SELECT public.test_inbox_assert((SELECT count(*)=2 FROM public.author_follows),'raw following rows restricted to caller relationships');
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.list_my_connections('following','',1)),'page size');
SELECT public.test_inbox_assert((SELECT connection_id='10000000-0000-0000-0000-000000000006' FROM public.list_my_connections('following','10000000-0000-0000-0000-000000000001',1)),'stable following cursor');
SELECT public.test_inbox_assert((SELECT bool_and(display_name='Unavailable book' AND image_url='' AND author_id IS NULL AND NOT available)
    FROM public.list_my_connections('subscriptions') WHERE book_id IN ('connections-hidden','connections-draft')),'unavailable titles and owners remain hidden');
SELECT public.test_inbox_assert((SELECT bool_and(NOT (to_jsonb(c) ? 'email')) FROM public.list_my_connections('following') c),'email not returned');

DO $$ BEGIN
    BEGIN PERFORM public.remove_my_connection('following','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004');
        RAISE EXCEPTION 'Expected account mismatch rejection';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%account changed%' THEN RAISE; END IF; END;
END $$;
SELECT public.test_inbox_assert((public.get_my_connections_summary()->>'following')::int=2,'account mismatch does not mutate');
SELECT public.remove_my_connection('following','10000000-0000-0000-0000-000000000001',auth.uid());
SELECT public.test_inbox_assert((public.get_my_connections_summary()->>'following')::int=1,'unfollow updates own list');
SELECT public.remove_my_connection('subscriptions','connections-hidden',auth.uid());
SELECT public.test_inbox_assert((public.get_my_connections_summary()->>'subscriptions')::int=2,'hidden subscription can be removed');

SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
SELECT public.test_inbox_assert((SELECT count(*)=1 FROM public.list_my_connections('followers')),'author can see own remaining follower');
SELECT public.test_inbox_assert((SELECT connection_id='10000000-0000-0000-0000-000000000004' AND author_id IS NULL FROM public.list_my_connections('followers')),'reader follower is not given an author profile');
SELECT public.test_inbox_assert(public.get_author_follower_count(auth.uid())=1,'aggregate remains correct after unfollow');
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
SELECT public.test_inbox_assert((public.get_my_connections_summary()->>'following')::int=1,'another reader follow unaffected');
SELECT public.test_inbox_assert((public.get_my_connections_summary()->>'subscriptions')::int=1,'another reader subscription unaffected');
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT public.test_inbox_assert((SELECT count(*)=0 FROM public.author_follows),'unrelated user cannot inspect raw relationship rows');
SELECT public.test_inbox_assert((SELECT count(*)=0 FROM public.list_my_connections('following')),'unrelated account sees no other following list');
SELECT public.test_inbox_assert((SELECT count(*)=0 FROM public.list_my_connections('followers')),'unrelated account sees no other followers');
RESET ROLE;

SET ROLE anon;
SELECT public.test_inbox_assert(public.get_author_follower_count('10000000-0000-0000-0000-000000000001')=1,'public count exposes no identities');
DO $$ BEGIN
    BEGIN PERFORM * FROM public.author_follows; RAISE EXCEPTION 'Anonymous raw follows exposed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM * FROM public.list_my_connections('followers'); RAISE EXCEPTION 'Anonymous private lists exposed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.get_my_connections_summary(); RAISE EXCEPTION 'Anonymous summary exposed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
CREATE TEMP TABLE connections_notifications AS SELECT count(*) AS count FROM public.inbox_notifications;
\ir ../../../supabase/live-site/supabase-private-connections.sql
\ir ../../../supabase/live-site/supabase-author-follows.sql
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT public.test_inbox_assert((SELECT count(*)=0 FROM public.author_follows),'rerunning follow setup cannot reopen public lists');
RESET ROLE;
SELECT public.test_inbox_assert((SELECT count(*) FROM public.inbox_notifications)=(SELECT count FROM connections_notifications),'setup does not send notifications');
SELECT 'All private connection checks passed' AS result;
