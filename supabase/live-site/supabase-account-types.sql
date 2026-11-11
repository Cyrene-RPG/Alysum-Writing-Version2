-- Alysum account paths (run on the LIVE Supabase project).
-- Safe to re-run. Run in the Supabase SQL editor after base schema.
--
-- Values for public.users.account_type:
--   reader
--   author          -- Writer (legacy name kept for existing rows/gates)
--   artist
--   writer_artist
--   both            -- Writer / Reader
--   all             -- Writer + Reader + Artist
--
-- Adds helpers + check constraint, then patches writer/reader SQL gates that
-- still only knew author|reader|both. After this, also re-run
-- supabase-staff-users.sql (or at least staff_users_overview_stats) so staff
-- counts use account_has_writer / account_has_reader.
--
-- Frontend stores Writer as "author" and Writer/Reader as "both".

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_has_writer(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_type, '')) IN ('author', 'writer_artist', 'both', 'all');
$$;

CREATE OR REPLACE FUNCTION public.account_has_reader(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_type, '')) IN ('reader', 'both', 'all');
$$;

CREATE OR REPLACE FUNCTION public.account_has_artist(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_type, '')) IN ('artist', 'writer_artist', 'all');
$$;

CREATE OR REPLACE FUNCTION public.account_type_is_valid(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_type, '')) IN (
    'reader', 'author', 'artist', 'writer_artist', 'both', 'all'
  );
$$;

COMMENT ON FUNCTION public.account_has_writer(text) IS
  'True when account_type includes Studio/writer access.';
COMMENT ON FUNCTION public.account_has_reader(text) IS
  'True when account_type includes Reader access.';
COMMENT ON FUNCTION public.account_has_artist(text) IS
  'True when account_type includes Artist access.';

-- Normalize legacy/blank rows before enforcing allowed values.
UPDATE public.users
SET account_type = 'both'
WHERE account_type IS NULL
   OR btrim(account_type) = ''
   OR NOT public.account_type_is_valid(account_type);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_account_type_check
  CHECK (public.account_type_is_valid(account_type));

-- ---------------------------------------------------------------------------
-- Author updates: writers include writer_artist + all
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_publish_author_updates()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND public.account_has_writer(account_type)
  ) THEN
    RETURN false;
  END IF;
  IF to_regclass('public.author_moderation_status') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.author_moderation_status
      WHERE user_id = auth.uid()
        AND (account_suspended OR account_terminated OR publishing_revoked)
    ) THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff overview counts
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.staff_overview()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'staff_overview'
     ) THEN
    -- Redefine only the count fragment via full replace when the function exists.
    -- staff_overview is large; patch by recreating from live body is brittle.
    -- Instead expose corrected count helpers staff UIs can adopt, and patch
    -- the known jsonb keys when staff_user_stats-style functions are present.
    NULL;
  END IF;
END $$;

-- Prefer these for new staff dashboards / repairs:
CREATE OR REPLACE FUNCTION public.account_type_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'totalUsers', (SELECT COUNT(*) FROM public.users),
    'authors', (SELECT COUNT(*) FROM public.users WHERE public.account_has_writer(account_type)),
    'readers', (SELECT COUNT(*) FROM public.users WHERE public.account_has_reader(account_type)),
    'artists', (SELECT COUNT(*) FROM public.users WHERE public.account_has_artist(account_type))
  );
$$;

GRANT EXECUTE ON FUNCTION public.account_has_writer(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_has_reader(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_has_artist(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_type_is_valid(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_type_counts() TO authenticated;

-- ---------------------------------------------------------------------------
-- Private connections: author_id on followers only when they have writer access
-- ---------------------------------------------------------------------------
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
            CASE WHEN public.account_has_writer(u.account_type) THEN f.follower_id ELSE NULL END,
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

REVOKE ALL ON FUNCTION public.list_my_connections(text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_connections(text,text,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
