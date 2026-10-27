-- Run after supabase-book-hiatus.sql and the existing inbox migrations.
-- Uses the already enabled pg_cron extension. Safe to rerun.
BEGIN;
CREATE TABLE IF NOT EXISTS public.book_reminders (
    book_id text PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    goal text NOT NULL DEFAULT 'update' CHECK(goal IN ('update','post')),
    cadence text NOT NULL DEFAULT 'weekly' CHECK(cadence IN ('weekly','biweekly','monthly','days')),
    every_days integer NOT NULL DEFAULT 7 CHECK(every_days BETWEEN 1 AND 365),
    timezone text NOT NULL,
    anchor_local timestamp NOT NULL,
    next_due timestamptz NOT NULL,
    period_start timestamptz NOT NULL DEFAULT now(),
    last_edit_at timestamptz,
    last_post_at timestamptz,
    popup_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_reminders_due_idx ON public.book_reminders(next_due) WHERE enabled;
ALTER TABLE public.book_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_reminders FROM PUBLIC,anon,authenticated;
-- Inbox book_id references Library; writing reminders also support unpublished drafts.
ALTER TABLE public.inbox_notifications ADD COLUMN IF NOT EXISTS reminder_book_id text REFERENCES public.books(id) ON DELETE SET NULL;
ALTER TABLE public.inbox_notifications ADD COLUMN IF NOT EXISTS reminder_popup_seen_at timestamptz;
DO $$ DECLARE rule text; BEGIN
    SELECT pg_get_expr(conbin,conrelid) INTO rule FROM pg_constraint
    WHERE conrelid='public.inbox_notifications'::regclass AND conname='inbox_notifications_kind_check';
    IF rule IS NULL THEN RAISE EXCEPTION 'Install the inbox migrations first.'; END IF;
    IF position('book_reminder' IN rule)=0 THEN
        ALTER TABLE public.inbox_notifications DROP CONSTRAINT inbox_notifications_kind_check;
        EXECUTE 'ALTER TABLE public.inbox_notifications ADD CONSTRAINT inbox_notifications_kind_check CHECK (('||rule||') OR kind=''book_reminder'')';
    END IF;
END $$;

-- Calculate from the original local anchor, preserving wall time over DST and
-- restoring the original day after a short month (Jan 31 -> Feb 28 -> Mar 31).
CREATE OR REPLACE FUNCTION public.next_book_reminder_time(p_anchor timestamp,p_timezone text,p_cadence text,p_days integer,p_after timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE k integer; step_days integer; local_after timestamp:=p_after AT TIME ZONE p_timezone; candidate timestamptz;
BEGIN
    IF p_cadence='monthly' THEN
        k:=greatest(0,(extract(year FROM local_after)::integer-extract(year FROM p_anchor)::integer)*12+extract(month FROM local_after)::integer-extract(month FROM p_anchor)::integer);
    ELSE
        step_days:=CASE p_cadence WHEN 'weekly' THEN 7 WHEN 'biweekly' THEN 14 ELSE p_days END;
        IF step_days IS NULL OR step_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Invalid reminder interval.'; END IF;
        k:=greatest(0,floor((local_after::date-p_anchor::date)::numeric/step_days)::integer);
    END IF;
    LOOP
        candidate:=(p_anchor+CASE WHEN p_cadence='monthly' THEN make_interval(months=>k) ELSE make_interval(days=>k*step_days) END) AT TIME ZONE p_timezone;
        IF candidate>p_after THEN RETURN candidate; END IF;
        k:=k+1;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_book_reminder(p_book_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.books WHERE id=p_book_id AND user_id=auth.uid()) THEN
        RAISE EXCEPTION 'Only the author can manage this book’s reminders.';
    END IF;
    SELECT jsonb_build_object('enabled',r.enabled,'goal',r.goal,'cadence',r.cadence,'everyDays',r.every_days,
        'timezone',r.timezone,'firstDueLocal',to_char(r.anchor_local,'YYYY-MM-DD"T"HH24:MI'),
        'nextDue',r.next_due,'popupEnabled',r.popup_enabled) INTO result FROM public.book_reminders r WHERE r.book_id=p_book_id AND r.owner_id=auth.uid();
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_book_reminder(p_book_id text,p_enabled boolean,p_goal text,p_cadence text,p_every_days integer,p_timezone text,p_first_due_local timestamp,p_popup_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE due timestamptz; previous public.book_reminders%rowtype;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.books WHERE id=p_book_id AND user_id=auth.uid()) THEN
        RAISE EXCEPTION 'Only the author can manage this book’s reminders.';
    END IF;
    IF p_enabled IS NULL OR p_popup_enabled IS NULL OR p_goal IS NULL OR p_goal NOT IN ('update','post')
       OR p_cadence IS NULL OR p_cadence NOT IN ('weekly','biweekly','monthly','days')
       OR p_every_days IS NULL OR p_every_days NOT BETWEEN 1 AND 365 OR p_first_due_local IS NULL OR NOT isfinite(p_first_due_local) THEN
        RAISE EXCEPTION 'Choose valid reminder settings.';
    END IF;
    IF p_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
        RAISE EXCEPTION 'Choose a valid timezone, such as America/Los_Angeles.';
    END IF;
    IF (p_first_due_local AT TIME ZONE p_timezone) AT TIME ZONE p_timezone <> p_first_due_local THEN
        RAISE EXCEPTION 'That local time does not exist because of daylight saving. Choose another time.';
    END IF;
    SELECT * INTO previous FROM public.book_reminders WHERE book_id=p_book_id FOR UPDATE;
    -- Saving unchanged settings or switching off does not require a new future date.
    IF p_enabled AND (previous.book_id IS NULL OR NOT previous.enabled OR previous.anchor_local IS DISTINCT FROM p_first_due_local
        OR previous.timezone IS DISTINCT FROM p_timezone OR previous.cadence IS DISTINCT FROM p_cadence
        OR previous.every_days IS DISTINCT FROM p_every_days OR previous.goal IS DISTINCT FROM p_goal)
        AND p_first_due_local AT TIME ZONE p_timezone <= now() THEN
        RAISE EXCEPTION 'Choose a first reminder date and time in the future.';
    END IF;
    due:=public.next_book_reminder_time(p_first_due_local,p_timezone,p_cadence,p_every_days,now());
    INSERT INTO public.book_reminders AS r(book_id,owner_id,enabled,goal,cadence,every_days,timezone,anchor_local,next_due,popup_enabled)
    VALUES(p_book_id,auth.uid(),p_enabled,p_goal,p_cadence,p_every_days,p_timezone,p_first_due_local,due,p_popup_enabled)
    ON CONFLICT(book_id) DO UPDATE SET owner_id=excluded.owner_id,enabled=excluded.enabled,goal=excluded.goal,cadence=excluded.cadence,
        every_days=excluded.every_days,timezone=excluded.timezone,anchor_local=excluded.anchor_local,next_due=excluded.next_due,
        popup_enabled=excluded.popup_enabled,period_start=now(),updated_at=clock_timestamp();
    -- A settings change supersedes old alerts without deleting inbox history.
    UPDATE public.inbox_notifications SET read_at=coalesce(read_at,clock_timestamp())
    WHERE reminder_book_id=p_book_id AND recipient_id=auth.uid() AND kind='book_reminder';
    RETURN public.get_book_reminder(p_book_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.track_book_reminder_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF auth.uid() IS DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME='books' THEN
        IF NEW.updated IS DISTINCT FROM OLD.updated THEN
            UPDATE public.book_reminders SET last_edit_at=clock_timestamp() WHERE book_id=NEW.id;
        END IF;
    ELSE
        IF TG_OP='UPDATE' THEN
            IF NEW.data->'updated' IS NOT DISTINCT FROM OLD.data->'updated' THEN RETURN NEW; END IF;
        END IF;
        IF coalesce(NEW.data->>'isPublished','true')='true' THEN
            UPDATE public.book_reminders SET last_post_at=clock_timestamp() WHERE book_id=NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS track_book_reminder_activity ON public.books;
CREATE TRIGGER track_book_reminder_activity AFTER UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.track_book_reminder_activity();
DROP TRIGGER IF EXISTS track_listing_reminder_activity ON public.library;
CREATE TRIGGER track_listing_reminder_activity AFTER INSERT OR UPDATE ON public.library FOR EACH ROW EXECUTE FUNCTION public.track_book_reminder_activity();

CREATE OR REPLACE FUNCTION public.deliver_book_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; activity timestamptz; delivered integer:=0;
BEGIN
    FOR item IN SELECT r.*,b.user_id,b.title,b.publish_meta,l.data,a.on_hiatus
        FROM public.book_reminders r JOIN public.books b ON b.id=r.book_id
        LEFT JOIN public.library l ON l.id=b.id LEFT JOIN public.book_inactivity a ON a.book_id=b.id
        WHERE r.enabled AND r.owner_id=b.user_id AND r.next_due<=now() FOR UPDATE OF r SKIP LOCKED
    LOOP
        activity:=CASE WHEN item.goal='post' THEN item.last_post_at ELSE greatest(item.last_edit_at,item.last_post_at) END;
        IF NOT public.is_book_marked_complete(item.data,item.publish_meta) AND NOT coalesce(item.on_hiatus,false)
           AND (item.data IS NULL OR public.mc_visible(item.book_id)) AND item.user_id IS NOT NULL
           AND (activity IS NULL OR activity<=item.period_start) THEN
            INSERT INTO public.inbox_notifications(recipient_id,kind,reminder_book_id,title,message,source_key)
            VALUES(item.user_id,'book_reminder',item.book_id,'Time for your book update',
                'Your reminder for “'||left(coalesce(nullif(item.title,''),'Untitled'),160)||'” is due. You haven’t '||
                CASE WHEN item.goal='post' THEN 'posted an update' ELSE 'updated or posted' END||' since this reminder period began. Open your book when you’re ready.',
                'book-reminder:'||item.book_id||':'||extract(epoch FROM item.next_due)::text)
            ON CONFLICT(recipient_id,source_key) DO NOTHING;
            delivered:=delivered+1;
        END IF;
        -- Advance even when skipped. Never send a backlog of missed alerts.
        UPDATE public.book_reminders SET period_start=now(),next_due=public.next_book_reminder_time(item.anchor_local,item.timezone,item.cadence,item.every_days,now()) WHERE book_id=item.book_id;
    END LOOP;
    RETURN delivered;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_book_reminder_notification_target(p_notification_id bigint)
RETURNS TABLE(book_id text,goal text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT b.id,r.goal FROM public.inbox_notifications n JOIN public.books b ON b.id=n.reminder_book_id
    JOIN public.book_reminders r ON r.book_id=b.id
    WHERE n.id=p_notification_id AND n.kind='book_reminder' AND n.recipient_id=auth.uid() AND b.user_id=auth.uid() AND r.owner_id=auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.claim_book_reminder_popup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item public.inbox_notifications%rowtype;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NULL; END IF;
    SELECT n.* INTO item FROM public.inbox_notifications n JOIN public.book_reminders r ON r.book_id=n.reminder_book_id
    JOIN public.books b ON b.id=r.book_id LEFT JOIN public.library l ON l.id=b.id LEFT JOIN public.book_inactivity a ON a.book_id=b.id
    WHERE n.recipient_id=auth.uid() AND b.user_id=auth.uid() AND r.owner_id=auth.uid() AND n.kind='book_reminder'
      AND n.read_at IS NULL AND n.reminder_popup_seen_at IS NULL AND r.enabled AND r.popup_enabled
      AND NOT public.is_book_marked_complete(l.data,b.publish_meta) AND NOT coalesce(a.on_hiatus,false)
      AND (l.id IS NULL OR public.mc_visible(l.id))
      AND coalesce(CASE WHEN r.goal='post' THEN r.last_post_at ELSE greatest(r.last_edit_at,r.last_post_at) END,'-infinity'::timestamptz)<=n.created_at
    ORDER BY n.id DESC LIMIT 1 FOR UPDATE OF n SKIP LOCKED;
    IF NOT FOUND THEN RETURN NULL; END IF;
    UPDATE public.inbox_notifications SET reminder_popup_seen_at=clock_timestamp() WHERE id=item.id;
    RETURN jsonb_build_object('id',item.id::text,'kind',item.kind,'title',item.title,'message',item.message,'created_at',item.created_at,'read_at',item.read_at);
END;
$$;
REVOKE ALL ON FUNCTION public.next_book_reminder_time(timestamp,text,text,integer,timestamptz),public.track_book_reminder_activity(),
 public.get_book_reminder(text),public.save_book_reminder(text,boolean,text,text,integer,text,timestamp,boolean),
 public.deliver_book_reminders(),public.get_book_reminder_notification_target(bigint),public.claim_book_reminder_popup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_book_reminder(text),public.save_book_reminder(text,boolean,text,text,integer,text,timestamp,boolean),
 public.get_book_reminder_notification_target(bigint),public.claim_book_reminder_popup() TO authenticated;
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
        RAISE NOTICE 'Enable pg_cron and rerun this migration to activate reminders.';
    ELSE
        PERFORM cron.schedule('per-book-reminders','* * * * *','SELECT public.deliver_book_reminders();');
    END IF;
END $$;
COMMIT;
