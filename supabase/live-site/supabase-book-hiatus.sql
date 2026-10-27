-- Apply after the inbox, book subscriptions, and Moderation Center migrations.
-- Enable pg_cron in Supabase first. Safe to rerun; activity and reminders are preserved.
BEGIN;
CREATE TABLE IF NOT EXISTS public.book_inactivity (
    book_id text PRIMARY KEY REFERENCES public.library(id) ON DELETE CASCADE,
    last_author_update timestamptz NOT NULL,
    on_hiatus boolean NOT NULL DEFAULT false,
    last_reminded_update timestamptz
);
ALTER TABLE public.book_inactivity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_inactivity FROM PUBLIC, anon, authenticated;

-- Extend the current check without removing other notification categories.
DO $$ DECLARE rule text; BEGIN
    SELECT pg_get_expr(conbin,conrelid) INTO rule FROM pg_constraint
        WHERE conrelid='public.inbox_notifications'::regclass AND conname='inbox_notifications_kind_check';
    IF rule IS NULL THEN RAISE EXCEPTION 'Install the inbox migrations first.'; END IF;
    IF position('book_inactivity' IN rule)=0 THEN
        ALTER TABLE public.inbox_notifications DROP CONSTRAINT inbox_notifications_kind_check;
        EXECUTE 'ALTER TABLE public.inbox_notifications ADD CONSTRAINT inbox_notifications_kind_check CHECK (('||rule||') OR kind=''book_inactivity'')';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_book_marked_complete(p_listing jsonb, p_meta jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
    SELECT coalesce(p_meta->>'complete','false')='true'
        OR coalesce(p_listing->>'complete','false')='true'
        OR lower(coalesce(p_listing->>'serializationStatus',p_listing->>'serialization_status','')) IN ('complete','completed','finished');
$$;

INSERT INTO public.book_inactivity(book_id,last_author_update)
SELECT l.id, greatest(
    to_timestamp(coalesce(b.updated,b.created,0)/1000.0),
    CASE WHEN jsonb_typeof(l.data->'updated')='number' THEN to_timestamp((l.data->>'updated')::numeric/1000.0) END
) FROM public.library l JOIN public.books b ON b.id=l.id
ON CONFLICT(book_id) DO NOTHING;

-- Only an authenticated author save counts as activity. Reader statistics, scheduled
-- releases, moderation, and choosing hiatus do not move the author timestamp.
CREATE OR REPLACE FUNCTION public.track_book_author_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF auth.uid() IS DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME='library' THEN
        IF TG_OP='UPDATE' THEN
            IF NEW.data->'updated' IS NOT DISTINCT FROM OLD.data->'updated' THEN RETURN NEW; END IF;
        END IF;
    ELSE
        IF NEW.updated IS NOT DISTINCT FROM OLD.updated THEN RETURN NEW; END IF;
    END IF;
    INSERT INTO public.book_inactivity AS a(book_id,last_author_update)
        SELECT NEW.id,clock_timestamp() WHERE EXISTS(SELECT 1 FROM public.library WHERE id=NEW.id)
        ON CONFLICT(book_id) DO UPDATE SET last_author_update=excluded.last_author_update;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS track_book_author_activity ON public.books;
CREATE TRIGGER track_book_author_activity AFTER UPDATE ON public.books
    FOR EACH ROW EXECUTE FUNCTION public.track_book_author_activity();
DROP TRIGGER IF EXISTS track_listing_author_activity ON public.library;
CREATE TRIGGER track_listing_author_activity AFTER INSERT OR UPDATE ON public.library
    FOR EACH ROW EXECUTE FUNCTION public.track_book_author_activity();

CREATE OR REPLACE FUNCTION public.get_book_hiatus(p_book_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT jsonb_build_object('isOnHiatus',a.on_hiatus AND NOT public.is_book_marked_complete(l.data,b.publish_meta),
        'lastAuthorUpdate',a.last_author_update,
        'isComplete',public.is_book_marked_complete(l.data,b.publish_meta),
        'canManage',coalesce(l.user_id=auth.uid() AND b.user_id=auth.uid(),false))
    FROM public.library l JOIN public.books b ON b.id=l.id JOIN public.book_inactivity a ON a.book_id=l.id
    WHERE l.id=p_book_id AND (l.user_id=auth.uid() OR (
        coalesce(l.data->>'isPublished','true')='true' AND public.mc_visible(l.id)));
$$;

CREATE OR REPLACE FUNCTION public.set_book_hiatus(p_book_id text,p_on_hiatus boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE complete boolean;
BEGIN
    IF auth.uid() IS NULL OR p_on_hiatus IS NULL THEN RAISE EXCEPTION 'Sign in and choose a hiatus status.'; END IF;
    SELECT public.is_book_marked_complete(l.data,b.publish_meta) INTO complete
        FROM public.library l JOIN public.books b ON b.id=l.id
        WHERE l.id=p_book_id AND l.user_id=auth.uid() AND b.user_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Only the author can change this book’s hiatus status.'; END IF;
    IF complete AND p_on_hiatus THEN RAISE EXCEPTION 'Completed books cannot be put on hiatus.'; END IF;
    UPDATE public.book_inactivity SET on_hiatus=p_on_hiatus WHERE book_id=p_book_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'This book’s activity is not available.'; END IF;
    RETURN public.get_book_hiatus(p_book_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_book_inactivity_notification_target(p_notification_id bigint)
RETURNS TABLE(book_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT l.id FROM public.inbox_notifications n JOIN public.library l ON l.id=n.book_id
    WHERE n.id=p_notification_id AND n.kind='book_inactivity' AND n.recipient_id=auth.uid() AND l.user_id=auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.deliver_book_inactivity_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; delivered integer:=0;
BEGIN
    FOR item IN SELECT a.book_id,a.last_author_update,l.user_id,l.data->>'title' AS title
        FROM public.book_inactivity a JOIN public.library l ON l.id=a.book_id JOIN public.books b ON b.id=l.id
        WHERE a.last_author_update < now()-interval '30 days' AND NOT a.on_hiatus
          AND a.last_reminded_update IS DISTINCT FROM a.last_author_update
          AND NOT public.is_book_marked_complete(l.data,b.publish_meta)
          AND l.user_id=b.user_id AND l.user_id IS NOT NULL
          AND coalesce(l.data->>'isPublished','true')='true' AND public.mc_visible(l.id)
        FOR UPDATE OF a SKIP LOCKED
    LOOP
        INSERT INTO public.inbox_notifications(recipient_id,kind,book_id,title,message,source_key)
        VALUES(item.user_id,'book_inactivity',item.book_id,'Has your book gone on hiatus?',
            'It has been more than 30 days since you last updated “'||left(coalesce(nullif(item.title,''),'Untitled'),160)||'”. Would you like to put it on hiatus? Open this reminder to review its status.',
            'book-inactivity:'||item.book_id||':'||extract(epoch FROM item.last_author_update)::text)
        ON CONFLICT(recipient_id,source_key) DO NOTHING;
        UPDATE public.book_inactivity SET last_reminded_update=item.last_author_update WHERE book_id=item.book_id;
        delivered:=delivered+1;
    END LOOP;
    RETURN delivered;
END;
$$;
REVOKE ALL ON FUNCTION public.is_book_marked_complete(jsonb,jsonb),public.track_book_author_activity(),
    public.deliver_book_inactivity_notifications(),public.get_book_hiatus(text),public.set_book_hiatus(text,boolean),
    public.get_book_inactivity_notification_target(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_book_hiatus(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_book_hiatus(text,boolean),public.get_book_inactivity_notification_target(bigint) TO authenticated;

-- No browser session is needed. Install/update exactly one hourly job.
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
        PERFORM cron.schedule('book-inactivity-reminders','0 * * * *','SELECT public.deliver_book_inactivity_notifications();');
    ELSE
        RAISE NOTICE 'Enable pg_cron, then rerun this migration to activate hourly inactivity reminders.';
    END IF;
END $$;
COMMIT;
