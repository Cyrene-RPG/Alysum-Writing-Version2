-- Private Following, Followers, and Book subscriptions.
-- Run after book subscriptions. Transactional and safe to rerun.
BEGIN;
DO $$ BEGIN
    IF to_regclass('public.author_follows') IS NULL OR to_regclass('public.book_subscriptions') IS NULL THEN
        RAISE EXCEPTION 'Install author follows and book subscriptions first.';
    END IF;
END $$;
-- Private relationship rows; public counts never return follower identities.
DROP POLICY IF EXISTS author_follows_select_public ON public.author_follows;
DROP POLICY IF EXISTS author_follows_read_own_relationships ON public.author_follows;
CREATE POLICY author_follows_read_own_relationships ON public.author_follows
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) IN (follower_id,author_id));
REVOKE SELECT ON public.author_follows FROM PUBLIC,anon;
GRANT SELECT ON public.author_follows TO authenticated;
CREATE OR REPLACE FUNCTION public.get_author_follower_count(p_author_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*) FROM public.author_follows WHERE author_id=p_author_id;
$$;
REVOKE ALL ON FUNCTION public.get_author_follower_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_author_follower_count(uuid) TO anon,authenticated;

CREATE INDEX IF NOT EXISTS author_follows_private_followers_idx ON public.author_follows(author_id,follower_id);

CREATE OR REPLACE FUNCTION public.get_my_connections_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to see your connections.'; END IF;
    RETURN jsonb_build_object(
        'following',(SELECT count(*) FROM public.author_follows WHERE follower_id=auth.uid()),
        'followers',(SELECT count(*) FROM public.author_follows WHERE author_id=auth.uid()),
        'subscriptions',(SELECT count(*) FROM public.book_subscriptions WHERE subscriber_id=auth.uid())
    );
END;
$$;
CREATE OR REPLACE FUNCTION public.list_my_connections(p_kind text, p_after_id text DEFAULT '', p_limit integer DEFAULT 50)
RETURNS TABLE(
    connection_id text, display_name text, username text, image_url text,
    author_id uuid, book_id text, created_at timestamptz, available boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit integer := LEAST(100,GREATEST(1,COALESCE(p_limit,50)));
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to see your connections.'; END IF;
    IF p_kind='following' THEN
        RETURN QUERY SELECT f.author_id::text,
            COALESCE(NULLIF(u.display_name,''),NULLIF(u.username,''),'Author'),
            COALESCE(u.username,''),COALESCE(u.profile_image_url,''),f.author_id,NULL::text,f.created_at,true
        FROM public.author_follows f LEFT JOIN public.users u ON u.id=f.author_id
        WHERE f.follower_id=auth.uid() AND f.author_id::text>COALESCE(p_after_id,'')
        ORDER BY f.author_id::text LIMIT v_limit;
    ELSIF p_kind='followers' THEN
        RETURN QUERY SELECT f.follower_id::text,
            COALESCE(NULLIF(u.display_name,''),NULLIF(u.username,''),'Reader'),
            COALESCE(u.username,''),COALESCE(u.profile_image_url,''),
            CASE WHEN u.account_type IN ('author','both') THEN f.follower_id ELSE NULL END,
            NULL::text,f.created_at,true
        FROM public.author_follows f LEFT JOIN public.users u ON u.id=f.follower_id
        WHERE f.author_id=auth.uid() AND f.follower_id::text>COALESCE(p_after_id,'')
        ORDER BY f.follower_id::text LIMIT v_limit;
    ELSIF p_kind='subscriptions' THEN
        RETURN QUERY SELECT s.book_id,
            CASE WHEN visible.value THEN COALESCE(NULLIF(l.data->>'title',''),'Untitled book') ELSE 'Unavailable book' END,
            ''::text,
            CASE WHEN visible.value THEN COALESCE(l.data->>'coverUrl',l.data->>'cover_url','') ELSE '' END,
            NULL::uuid,s.book_id,s.created_at,visible.value
        FROM public.book_subscriptions s JOIN public.library l ON l.id=s.book_id
        CROSS JOIN LATERAL (SELECT
            COALESCE(l.data->>'isPublished','true')<>'false'
            AND NOT EXISTS(SELECT 1 FROM public.library_book_moderation m
                WHERE m.book_id=l.id AND m.visibility IN ('hidden','removed')) AS value) visible
        WHERE s.subscriber_id=auth.uid() AND s.book_id>COALESCE(p_after_id,'')
        ORDER BY s.book_id LIMIT v_limit;
    ELSE RAISE EXCEPTION 'Choose Following, Followers, or Subscriptions.';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_connections_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_my_connections(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_connections_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_connections(text,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.remove_my_connection(p_kind text,p_target_id text,p_expected_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_expected_user_id THEN
        RAISE EXCEPTION 'Your account changed. Reload and try again.';
    END IF;
    IF p_kind='following' THEN
        DELETE FROM public.author_follows WHERE follower_id=auth.uid() AND author_id::text=p_target_id;
    ELSIF p_kind='subscriptions' THEN PERFORM public.set_book_subscription(p_target_id,false);
    ELSE RAISE EXCEPTION 'This connection cannot be removed here.';
    END IF;
    RETURN true;
END;
$;
REVOKE ALL ON FUNCTION public.remove_my_connection(text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_my_connection(text,text,uuid) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
