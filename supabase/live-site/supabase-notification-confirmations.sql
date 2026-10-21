-- On-site receipts for new follows and book subscriptions.
-- Apply after supabase-book-subscriptions.sql. Safe to rerun; no historical receipts.
BEGIN;
DO $$ BEGIN
    IF to_regclass('public.book_subscriptions') IS NULL THEN
        RAISE EXCEPTION 'Install the book subscriptions SQL first.';
    END IF;
END $$;
ALTER TABLE public.inbox_notifications DROP CONSTRAINT IF EXISTS inbox_notifications_kind_check;
ALTER TABLE public.inbox_notifications ADD CONSTRAINT inbox_notifications_kind_check
    CHECK(kind IN ('follower','author_announcement','site_update','new_book','new_chapter','follow_confirmation','subscription_confirmation'));

CREATE OR REPLACE FUNCTION public.confirm_author_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
    SELECT left(COALESCE(NULLIF(display_name,''),NULLIF(username,''),'this author'),100)
        INTO v_name FROM public.users WHERE id=NEW.author_id;
    INSERT INTO public.inbox_notifications(recipient_id,kind,actor_id,title,message,source_key)
        VALUES(NEW.follower_id,'follow_confirmation',NEW.author_id,'Following confirmed',
            'You’re now following ' || COALESCE(v_name,'this author') || '.',
            'follow_confirmation:' || gen_random_uuid()::text);
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.confirm_book_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text;
BEGIN
    SELECT left(COALESCE(NULLIF(data->>'title',''),'this book'),160) INTO v_title
        FROM public.library WHERE id=NEW.book_id;
    INSERT INTO public.inbox_notifications(recipient_id,kind,book_id,title,message,source_key)
        VALUES(NEW.subscriber_id,'subscription_confirmation',NEW.book_id,'Subscription confirmed',
            'You’re subscribed to ' || COALESCE(v_title,'this book') || '. Manage chapter alerts in your inbox preferences.',
            'subscription_confirmation:' || gen_random_uuid()::text);
    RETURN NEW;
END;
$$;

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


LOCK TABLE public.author_follows, public.book_subscriptions IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS confirm_author_follow ON public.author_follows;
CREATE TRIGGER confirm_author_follow AFTER INSERT ON public.author_follows
    FOR EACH ROW EXECUTE FUNCTION public.confirm_author_follow();
DROP TRIGGER IF EXISTS confirm_book_subscription ON public.book_subscriptions;
CREATE TRIGGER confirm_book_subscription AFTER INSERT ON public.book_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.confirm_book_subscription();
REVOKE ALL ON FUNCTION public.confirm_author_follow() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_book_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_reading_notification_target(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_reading_notification_target(bigint) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
