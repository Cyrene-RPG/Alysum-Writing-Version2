-- Alysum changelog and author announcements.
-- Run in the LIVE Supabase SQL Editor. Safe to re-run; preserves posts.
-- Uses existing public.users accounts and optional moderation tables.
BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scope text NOT NULL CHECK (scope IN ('site', 'author')),
    category text NOT NULL CHECK (category IN ('new', 'improved', 'fixed', 'announcement')),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 12000),
    book_id text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    CHECK ((status = 'published') = (published_at IS NOT NULL)),
    CHECK (scope <> 'site' OR book_id IS NULL)
);
CREATE INDEX IF NOT EXISTS announcements_public_idx
    ON public.announcements(scope, published_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS announcements_author_idx
    ON public.announcements(author_id, updated_at DESC, id DESC);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_read ON public.announcements;
CREATE POLICY announcements_read ON public.announcements
    FOR SELECT TO anon, authenticated
    USING (status = 'published' OR author_id = (SELECT auth.uid()));
-- All writes go through the permission-checked RPC below.
REVOKE ALL ON public.announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.announcements TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_publish_site_updates()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR to_regclass('public.moderation_staff') IS NULL THEN
        RETURN false;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.moderation_staff
        WHERE user_id = auth.uid() AND role = 'admin'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_publish_author_updates()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN false; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND account_type IN ('author', 'both')
    ) THEN RETURN false; END IF;
    IF to_regclass('public.author_moderation_status') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.author_moderation_status
            WHERE user_id = auth.uid()
                AND (account_suspended OR account_terminated OR publishing_revoked)
        ) THEN RETURN false; END IF;
    END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_announcement_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'canPublishSite', public.can_publish_site_updates(),
        'canPublishAuthor', public.can_publish_author_updates()
    );
$$;

CREATE OR REPLACE FUNCTION public.save_announcement(
    p_id uuid,
    p_scope text,
    p_category text,
    p_title text,
    p_body text,
    p_book_id text DEFAULT NULL,
    p_publish boolean DEFAULT false,
    p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.announcements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_existing public.announcements%ROWTYPE;
    v_exists boolean;
    v_title text := btrim(COALESCE(p_title, ''));
    v_body text := btrim(COALESCE(p_body, ''));
    v_book text := NULLIF(btrim(COALESCE(p_book_id, '')), '');
    v_now timestamptz := clock_timestamp();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to publish updates.'; END IF;
    IF p_id IS NULL THEN RAISE EXCEPTION 'Missing update id.'; END IF;
    IF p_scope IS NULL OR p_scope NOT IN ('site', 'author') THEN
        RAISE EXCEPTION 'Choose an update audience.';
    END IF;
    IF p_scope = 'site' AND NOT public.can_publish_site_updates() THEN
        RAISE EXCEPTION 'Only admin staff can publish Alysum updates.';
    END IF;
    IF p_scope = 'author' AND NOT public.can_publish_author_updates() THEN
        RAISE EXCEPTION 'An eligible author account is required to publish author updates.';
    END IF;
    IF p_category IS NULL OR p_category NOT IN ('new', 'improved', 'fixed', 'announcement') THEN
        RAISE EXCEPTION 'Choose a valid update category.';
    END IF;
    IF char_length(v_title) NOT BETWEEN 1 AND 160
        OR char_length(v_body) NOT BETWEEN 1 AND 12000 THEN
        RAISE EXCEPTION 'Enter a title (up to 160 characters) and update text (up to 12000 characters).';
    END IF;
    IF p_scope = 'site' AND v_book IS NOT NULL THEN
        RAISE EXCEPTION 'Book links belong to author updates.';
    END IF;
    IF v_book IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.library lib
        WHERE lib.id::text = v_book AND lib.user_id = v_user
            AND COALESCE(lib.data->>'isPublished', 'true') <> 'false'
            AND COALESCE(lib.data->>'isAnonymous', 'false') <> 'true'
    ) THEN
        RAISE EXCEPTION 'Choose one of your publicly listed books.';
    END IF;

    SELECT * INTO v_existing FROM public.announcements WHERE id = p_id FOR UPDATE;
    v_exists := FOUND;
    IF v_exists THEN
        IF v_existing.author_id <> v_user THEN
            RAISE EXCEPTION 'You can only edit your own updates.';
        END IF;
        IF v_existing.scope <> p_scope THEN
            RAISE EXCEPTION 'An update audience cannot change after its first save.';
        END IF;
        IF p_expected_updated_at IS NULL OR v_existing.updated_at <> p_expected_updated_at THEN
            RAISE EXCEPTION 'This update changed elsewhere. Reopen it from your saved updates before saving again.';
        END IF;
        RETURN QUERY UPDATE public.announcements
            SET category = p_category, title = v_title, body = v_body, book_id = v_book,
                status = CASE WHEN COALESCE(p_publish, false) OR v_existing.status = 'published'
                    THEN 'published' ELSE 'draft' END,
                published_at = CASE WHEN COALESCE(p_publish, false) OR v_existing.status = 'published'
                    THEN COALESCE(v_existing.published_at, v_now) ELSE NULL END,
                updated_at = v_now
            WHERE id = p_id
            RETURNING *;
    ELSE
        IF p_expected_updated_at IS NOT NULL THEN
            RAISE EXCEPTION 'Update not found. Reload your saved updates.';
        END IF;
        RETURN QUERY INSERT INTO public.announcements (
            id, author_id, scope, category, title, body, book_id, status, published_at,
            created_at, updated_at
        ) VALUES (
            p_id, v_user, p_scope, p_category, v_title, v_body, v_book,
            CASE WHEN COALESCE(p_publish, false) THEN 'published' ELSE 'draft' END,
            CASE WHEN COALESCE(p_publish, false) THEN v_now ELSE NULL END,
            v_now, v_now
        ) RETURNING *;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.can_publish_site_updates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_publish_author_updates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_announcement_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_announcement(uuid, text, text, text, text, text, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_publish_site_updates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_publish_author_updates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_announcement_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_announcement(uuid, text, text, text, text, text, boolean, timestamptz) TO authenticated;

COMMIT;
