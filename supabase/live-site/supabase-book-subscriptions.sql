-- Free book subscriptions and on-site publication notifications.
-- Apply AFTER supabase-notifications-inbox.sql. Safe to rerun; no historical alerts.
BEGIN;
DO $$ BEGIN
    IF to_regclass('public.inbox_notifications') IS NULL
        OR to_regclass('public.library_book_moderation') IS NULL THEN
        RAISE EXCEPTION 'Install the inbox and Library moderation SQL first.';
    END IF;
END $$;

ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS new_books boolean NOT NULL DEFAULT true;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS new_chapters boolean NOT NULL DEFAULT true;
ALTER TABLE public.inbox_notifications ADD COLUMN IF NOT EXISTS book_id text REFERENCES public.library(id) ON DELETE SET NULL;
ALTER TABLE public.inbox_notifications ADD COLUMN IF NOT EXISTS chapter_id text;
ALTER TABLE public.inbox_notifications DROP CONSTRAINT IF EXISTS inbox_notifications_kind_check;
ALTER TABLE public.inbox_notifications ADD CONSTRAINT inbox_notifications_kind_check
    CHECK(kind IN ('follower','author_announcement','site_update','new_book','new_chapter','follow_confirmation','subscription_confirmation'));

CREATE TABLE IF NOT EXISTS public.book_subscriptions (
    subscriber_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id text NOT NULL REFERENCES public.library(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(subscriber_id, book_id)
);
CREATE INDEX IF NOT EXISTS book_subscriptions_book_idx ON public.book_subscriptions(book_id, subscriber_id);
-- These private ledgers intentionally survive deletion/recreation of a listing.
CREATE TABLE IF NOT EXISTS public.notification_books (book_id text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public.notification_chapters (
    book_id text NOT NULL, chapter_id text NOT NULL, PRIMARY KEY(book_id, chapter_id)
);
CREATE TABLE IF NOT EXISTS public.notification_reading_rollout (
    id smallint PRIMARY KEY CHECK(id = 1), activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.book_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reading_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_subscriptions, public.notification_books, public.notification_chapters,
    public.notification_reading_rollout FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.book_subscriptions TO authenticated;
DROP POLICY IF EXISTS book_subscriptions_read_own ON public.book_subscriptions;
CREATE POLICY book_subscriptions_read_own ON public.book_subscriptions FOR SELECT TO authenticated
    USING(subscriber_id = (SELECT auth.uid()));

-- Only released IDs with a corresponding chapter count as publication.
-- The explicit release list excludes scheduled chapters and unselected chapters.
CREATE OR REPLACE FUNCTION public.notification_released_chapters(p_data jsonb)
RETURNS TABLE(chapter_id text, title text) LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT DISTINCT ON (c->>'id') c->>'id', left(COALESCE(NULLIF(c->>'title',''),'Untitled chapter'),160)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_data->'chapters') = 'array'
        THEN p_data->'chapters' ELSE '[]'::jsonb END) AS c
    WHERE COALESCE(c->>'id','') <> ''
        AND (jsonb_typeof(COALESCE(p_data->'publishedChapterIds',p_data->'published_chapter_ids')) IS DISTINCT FROM 'array'
            OR COALESCE(p_data->'publishedChapterIds',p_data->'published_chapter_ids') ? (c->>'id'))
        AND CASE WHEN COALESCE(c->>'wordCount',c->>'word_count') ~ '^[0-9]+([.][0-9]+)?$'
            THEN COALESCE(c->>'wordCount',c->>'word_count')::numeric >= 500 ELSE true END
    ORDER BY c->>'id';
$$;

CREATE OR REPLACE FUNCTION public.set_book_subscription(p_book_id text, p_subscribed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid; v_data jsonb;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to subscribe to a book.'; END IF;
    IF p_subscribed IS NULL THEN RAISE EXCEPTION 'Choose a subscription state.'; END IF;
    IF NOT p_subscribed THEN
        DELETE FROM public.book_subscriptions WHERE subscriber_id = auth.uid() AND book_id = p_book_id;
        RETURN false;
    END IF;
    SELECT user_id, data INTO v_owner, v_data FROM public.library WHERE id = p_book_id FOR SHARE;
    IF NOT FOUND OR v_data->>'isPublished' = 'false'
        OR EXISTS(SELECT 1 FROM public.library_book_moderation WHERE book_id = p_book_id AND visibility IN ('hidden','removed')) THEN
        RAISE EXCEPTION 'This book is not available for subscriptions.';
    END IF;
    IF v_owner = auth.uid() THEN RAISE EXCEPTION 'You cannot subscribe to your own book.'; END IF;
    INSERT INTO public.book_subscriptions(subscriber_id, book_id) VALUES(auth.uid(),p_book_id)
        ON CONFLICT DO NOTHING;
    RETURN true;
END;
$$;

-- Keep the existing three-setting RPC for older clients. It leaves these two settings alone.
CREATE OR REPLACE FUNCTION public.set_reading_notification_preferences(
    p_new_followers boolean, p_author_announcements boolean, p_site_updates boolean,
    p_new_books boolean, p_new_chapters boolean
) RETURNS SETOF public.notification_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to change preferences.'; END IF;
    IF p_new_followers IS NULL OR p_author_announcements IS NULL OR p_site_updates IS NULL
        OR p_new_books IS NULL OR p_new_chapters IS NULL THEN RAISE EXCEPTION 'Choose every preference.'; END IF;
    RETURN QUERY INSERT INTO public.notification_preferences AS p
        (user_id,new_followers,author_announcements,site_updates,new_books,new_chapters)
        VALUES(auth.uid(),p_new_followers,p_author_announcements,p_site_updates,p_new_books,p_new_chapters)
        ON CONFLICT(user_id) DO UPDATE SET new_followers=excluded.new_followers,
            author_announcements=excluded.author_announcements,site_updates=excluded.site_updates,
            new_books=excluded.new_books,new_chapters=excluded.new_chapters,updated_at=clock_timestamp()
        RETURNING p.*;
END;
$$;

-- Resolve only the caller's inbox entry; never expose a hidden or unpublished target.
CREATE OR REPLACE FUNCTION public.get_reading_notification_target(p_notification_id bigint)
RETURNS TABLE(book_id text, chapter_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT l.id, n.chapter_id FROM public.inbox_notifications n
    JOIN public.library l ON l.id = n.book_id
    WHERE n.id = p_notification_id AND n.recipient_id = auth.uid()
        AND n.kind IN ('new_book','new_chapter','subscription_confirmation')
        AND COALESCE(l.data->>'isPublished','true') <> 'false'
        AND NOT EXISTS(SELECT 1 FROM public.library_book_moderation m WHERE m.book_id=l.id AND m.visibility IN ('hidden','removed'))
        AND (n.kind<>'new_chapter' OR EXISTS(SELECT 1 FROM public.notification_released_chapters(l.data) c WHERE c.chapter_id=n.chapter_id));
$$;

CREATE OR REPLACE FUNCTION public.deliver_reading_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_book_is_new boolean; v_chapter record; v_title text; v_actor uuid; v_visible boolean;
BEGIN
    IF NEW.data->>'isPublished' = 'false' THEN RETURN NEW; END IF;
    v_title := left(COALESCE(NULLIF(NEW.data->>'title',''),'Untitled book'),160);
    v_actor := CASE WHEN NEW.data->>'isAnonymous' = 'true' OR NEW.data->>'is_anonymous' = 'true'
        THEN NULL ELSE NEW.user_id END;
    v_visible := NOT EXISTS(SELECT 1 FROM public.library_book_moderation WHERE book_id=NEW.id AND visibility IN ('hidden','removed'));
    INSERT INTO public.notification_books(book_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
    v_book_is_new := FOUND;
    IF v_book_is_new AND v_visible AND v_actor IS NOT NULL THEN
        INSERT INTO public.inbox_notifications(recipient_id,kind,actor_id,book_id,title,message,source_key)
        SELECT f.follower_id,'new_book',v_actor,NEW.id,'New book from an author you follow',v_title,
            jsonb_build_array('new_book',NEW.id)::text
        FROM public.author_follows f LEFT JOIN public.notification_preferences p ON p.user_id=f.follower_id
        WHERE f.author_id=NEW.user_id AND f.follower_id<>NEW.user_id AND COALESCE(p.new_books,true)
        ON CONFLICT(recipient_id,source_key) DO NOTHING;
    END IF;
    FOR v_chapter IN
        INSERT INTO public.notification_chapters(book_id,chapter_id)
            SELECT NEW.id,c.chapter_id FROM public.notification_released_chapters(NEW.data) c
            ON CONFLICT DO NOTHING RETURNING chapter_id
    LOOP
        IF v_visible THEN
            INSERT INTO public.inbox_notifications(recipient_id,kind,actor_id,book_id,chapter_id,title,message,source_key)
            SELECT s.subscriber_id,'new_chapter',v_actor,NEW.id,v_chapter.chapter_id,
                'New chapter in ' || v_title,c.title,jsonb_build_array('new_chapter',NEW.id,v_chapter.chapter_id)::text
            FROM public.book_subscriptions s
            LEFT JOIN public.notification_preferences p ON p.user_id=s.subscriber_id
            CROSS JOIN public.notification_released_chapters(NEW.data) c
            WHERE s.book_id=NEW.id AND s.subscriber_id IS DISTINCT FROM NEW.user_id
                AND c.chapter_id=v_chapter.chapter_id AND COALESCE(p.new_chapters,true)
            ON CONFLICT(recipient_id,source_key) DO NOTHING;
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

-- Capture the baseline and install the trigger atomically.
LOCK TABLE public.library IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.notification_reading_rollout WHERE id=1) THEN
        INSERT INTO public.notification_books(book_id)
            SELECT id FROM public.library WHERE COALESCE(data->>'isPublished','true') <> 'false'
            ON CONFLICT DO NOTHING;
        INSERT INTO public.notification_chapters(book_id,chapter_id)
            SELECT l.id,c.chapter_id FROM public.library l CROSS JOIN LATERAL public.notification_released_chapters(l.data) c
            WHERE COALESCE(l.data->>'isPublished','true') <> 'false' ON CONFLICT DO NOTHING;
        INSERT INTO public.notification_reading_rollout(id) VALUES(1);
    END IF;
END $$;
DROP TRIGGER IF EXISTS notify_library_publication ON public.library;
CREATE TRIGGER notify_library_publication AFTER INSERT OR UPDATE OF data,user_id ON public.library
    FOR EACH ROW EXECUTE FUNCTION public.deliver_reading_notifications();

REVOKE ALL ON FUNCTION public.notification_released_chapters(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.deliver_reading_notifications() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_book_subscription(text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_reading_notification_preferences(boolean,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_reading_notification_target(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_book_subscription(text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reading_notification_preferences(boolean,boolean,boolean,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reading_notification_target(bigint) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
