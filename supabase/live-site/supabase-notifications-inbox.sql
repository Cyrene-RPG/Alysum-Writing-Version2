-- Private on-site inbox, preferences and delivery.
-- Leaves the legacy public.notifications beta-reading table untouched.
-- LIVE Supabase project. Apply after author follows + updates announcements.
-- Transactional and safe to rerun; never recreates existing user notifications.
BEGIN;

DO $$
BEGIN
    IF to_regclass('public.author_follows') IS NULL
        OR to_regclass('public.announcements') IS NULL THEN
        RAISE EXCEPTION 'Apply the author-follow and announcements SQL first.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    new_followers boolean NOT NULL DEFAULT true,
    author_announcements boolean NOT NULL DEFAULT true,
    site_updates boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.inbox_notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('follower', 'author_announcement', 'site_update')),
    actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    announcement_id uuid REFERENCES public.announcements(id) ON DELETE SET NULL,
    title text NOT NULL,
    message text NOT NULL,
    source_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    read_at timestamptz,
    UNIQUE(recipient_id, source_key)
);
CREATE INDEX IF NOT EXISTS inbox_notifications_recipient_idx
    ON public.inbox_notifications(recipient_id, id DESC);
CREATE INDEX IF NOT EXISTS inbox_notifications_unread_idx
    ON public.inbox_notifications(recipient_id, id DESC) WHERE read_at IS NULL;

-- Private ledgers survive unfollows and preference changes.
CREATE TABLE IF NOT EXISTS public.notification_follow_pairs (
    follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY(follower_id, author_id)
);
CREATE TABLE IF NOT EXISTS public.notification_publications (
    announcement_id uuid PRIMARY KEY REFERENCES public.announcements(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.notification_rollout (
    id smallint PRIMARY KEY CHECK (id = 1),
    activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.inbox_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_follow_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inbox_notifications, public.notification_preferences,
    public.notification_follow_pairs, public.notification_publications,
    public.notification_rollout FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.inbox_notifications_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inbox_notifications, public.notification_preferences TO authenticated;

DROP POLICY IF EXISTS inbox_notifications_read_own ON public.inbox_notifications;
CREATE POLICY inbox_notifications_read_own ON public.inbox_notifications
    FOR SELECT TO authenticated USING (recipient_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS notification_preferences_read_own ON public.notification_preferences;
CREATE POLICY notification_preferences_read_own ON public.notification_preferences
    FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.get_inbox_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to open your inbox.'; END IF;
    RETURN (
        SELECT jsonb_build_object(
            'unreadCount', count(*) FILTER (WHERE read_at IS NULL),
            'latestId', COALESCE(max(id), 0)::text
        ) FROM public.inbox_notifications WHERE recipient_id = auth.uid()
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_inbox_notification_read(p_notification_id bigint, p_is_read boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use your inbox.'; END IF;
    IF p_is_read IS NULL THEN RAISE EXCEPTION 'Choose a read state.'; END IF;
    UPDATE public.inbox_notifications
        SET read_at = CASE WHEN p_is_read THEN COALESCE(read_at, clock_timestamp()) ELSE NULL END
        WHERE id = p_notification_id AND recipient_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Notification not found.'; END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_inbox_notifications_read(p_through_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use your inbox.'; END IF;
    IF p_through_id IS NULL OR p_through_id < 0 THEN RAISE EXCEPTION 'Invalid inbox position.'; END IF;
    UPDATE public.inbox_notifications SET read_at = clock_timestamp()
        WHERE recipient_id = auth.uid() AND read_at IS NULL AND id <= p_through_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_notification_preferences(
    p_new_followers boolean, p_author_announcements boolean, p_site_updates boolean
)
RETURNS SETOF public.notification_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to change notification preferences.'; END IF;
    IF p_new_followers IS NULL OR p_author_announcements IS NULL OR p_site_updates IS NULL THEN
        RAISE EXCEPTION 'Choose a setting for every notification category.';
    END IF;
    RETURN QUERY INSERT INTO public.notification_preferences(
        user_id, new_followers, author_announcements, site_updates
    ) VALUES (auth.uid(), p_new_followers, p_author_announcements, p_site_updates)
    ON CONFLICT (user_id) DO UPDATE SET
        new_followers = EXCLUDED.new_followers,
        author_announcements = EXCLUDED.author_announcements,
        site_updates = EXCLUDED.site_updates,
        updated_at = clock_timestamp()
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.deliver_follower_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
    INSERT INTO public.notification_follow_pairs(follower_id, author_id)
        VALUES (NEW.follower_id, NEW.author_id) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF NOT COALESCE((
        SELECT new_followers FROM public.notification_preferences WHERE user_id = NEW.author_id
    ), true) THEN RETURN NEW; END IF;
    SELECT COALESCE(NULLIF(btrim(display_name), ''), NULLIF(btrim(username), ''))
        INTO v_name FROM public.users WHERE id = NEW.follower_id;
    v_name := COALESCE(v_name, 'A reader');
    INSERT INTO public.inbox_notifications(recipient_id, kind, actor_id, title, message, source_key)
        VALUES (NEW.author_id, 'follower', NEW.follower_id, 'New follower',
            v_name || ' started following you.', 'follow:' || NEW.follower_id::text || ':' || NEW.author_id::text)
        ON CONFLICT (recipient_id, source_key) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.deliver_announcement_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
    IF NEW.status <> 'published' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'published' THEN RETURN NEW; END IF;
    END IF;
    INSERT INTO public.notification_publications(announcement_id)
        VALUES (NEW.id) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT COALESCE(NULLIF(btrim(display_name), ''), NULLIF(btrim(username), ''))
        INTO v_name FROM public.users WHERE id = NEW.author_id;
    v_name := COALESCE(v_name, 'An author');
    IF NEW.scope = 'author' THEN
        INSERT INTO public.inbox_notifications(
            recipient_id, kind, actor_id, announcement_id, title, message, source_key
        )
        SELECT f.follower_id, 'author_announcement', NEW.author_id, NEW.id,
            v_name || ' posted an announcement', left(NEW.title, 160), 'announcement:' || NEW.id::text
        FROM public.author_follows f
        LEFT JOIN public.notification_preferences p ON p.user_id = f.follower_id
        WHERE f.author_id = NEW.author_id AND f.follower_id <> NEW.author_id
            AND COALESCE(p.author_announcements, true)
        ON CONFLICT (recipient_id, source_key) DO NOTHING;
    ELSIF NEW.scope = 'site' THEN
        INSERT INTO public.inbox_notifications(
            recipient_id, kind, actor_id, announcement_id, title, message, source_key
        )
        SELECT p.user_id, 'site_update', NEW.author_id, NEW.id,
            'Alysum update', left(NEW.title, 160), 'announcement:' || NEW.id::text
        FROM public.notification_preferences p
        WHERE p.site_updates AND p.user_id <> NEW.author_id
        ON CONFLICT (recipient_id, source_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

-- Hold event-source writes briefly so baseline creation and trigger attachment
-- have one activation boundary. Nothing is sent for existing rows.
LOCK TABLE public.author_follows, public.announcements IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.notification_rollout WHERE id = 1) THEN
        INSERT INTO public.notification_follow_pairs(follower_id, author_id)
            SELECT follower_id, author_id FROM public.author_follows ON CONFLICT DO NOTHING;
        INSERT INTO public.notification_publications(announcement_id)
            SELECT id FROM public.announcements WHERE status = 'published' ON CONFLICT DO NOTHING;
        INSERT INTO public.notification_rollout(id) VALUES (1);
    END IF;
END;
$$;
DROP TRIGGER IF EXISTS notify_author_follow ON public.author_follows;
CREATE TRIGGER notify_author_follow AFTER INSERT ON public.author_follows
    FOR EACH ROW EXECUTE FUNCTION public.deliver_follower_notification();
DROP TRIGGER IF EXISTS notify_announcement_publication ON public.announcements;
CREATE TRIGGER notify_announcement_publication AFTER INSERT OR UPDATE OF status ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.deliver_announcement_notifications();

REVOKE ALL ON FUNCTION public.get_inbox_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_inbox_notification_read(bigint, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_inbox_notifications_read(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_notification_preferences(boolean, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deliver_follower_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deliver_announcement_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inbox_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_inbox_notification_read(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inbox_notifications_read(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_notification_preferences(boolean, boolean, boolean) TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inbox_notifications') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_notifications;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification_preferences') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
        END IF;
    END IF;
END;
$$;
COMMIT;
