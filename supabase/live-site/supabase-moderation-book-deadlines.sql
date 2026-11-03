-- Run after supabase-moderation-resolve-conversations.sql.
-- Official book/cover messages with a passed response date and no user reply
-- unpublish the listing from the Library. Studio manuscripts stay. Additive, transactional, safe to rerun.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.mc_call(text,jsonb)') IS NULL OR to_regclass('public.mc_threads') IS NULL OR to_regclass('public.mc_book_visibility') IS NULL THEN
  RAISE EXCEPTION 'Run the Moderation Center SQL first.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.mc_threads'::regclass AND attname='kind' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Run supabase-moderation-direct-messages.sql first.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.mc_threads'::regclass AND attname='resolved_at' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Run supabase-moderation-resolve-conversations.sql first.';
 END IF;
END $$;

ALTER TABLE public.mc_threads ADD COLUMN IF NOT EXISTS deadline_enforced_at timestamptz;
CREATE INDEX IF NOT EXISTS mc_threads_book_deadline_idx ON public.mc_threads(deadline,id)
 WHERE book_id IS NOT NULL AND deadline IS NOT NULL AND deadline_enforced_at IS NULL;

CREATE OR REPLACE FUNCTION public.mc_enforce_book_deadlines()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 thread public.mc_threads%ROWTYPE;
 hidden integer:=0;
 note text:='The requested response date passed without a reply. This book was unpublished from the Library. Your Studio copy and manuscript are unchanged. You can still reply here or submit an appeal ticket in Moderation Messages.';
 reason text:='No reply by the requested response date. Unpublished from the Library; Studio copy unchanged.';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('mc:book-deadlines',0));
 FOR thread IN
  SELECT t.* FROM public.mc_threads t
  WHERE t.book_id IS NOT NULL AND t.deadline IS NOT NULL AND t.deadline_enforced_at IS NULL
   AND t.resolved_at IS NULL AND coalesce(t.kind,'team') IS DISTINCT FROM 'direct'
   AND t.deadline<(clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date
   AND NOT EXISTS(SELECT 1 FROM public.mc_messages m WHERE m.thread_id=t.id AND m.side='user')
  FOR UPDATE OF t SKIP LOCKED
 LOOP
  IF EXISTS(SELECT 1 FROM public.library WHERE id::text=thread.book_id) THEN
   IF NOT EXISTS(SELECT 1 FROM public.mc_book_visibility WHERE book_id=thread.book_id AND visibility IN ('hidden','removed')) THEN
    INSERT INTO public.mc_book_visibility(book_id,visibility,reason,updated_by)
    VALUES(thread.book_id,'hidden',reason,NULL)
    ON CONFLICT(book_id) DO UPDATE SET visibility='hidden',reason=EXCLUDED.reason,updated_by=NULL,updated_at=clock_timestamp();
    IF to_regclass('public.library_book_moderation') IS NOT NULL THEN
     EXECUTE $q$INSERT INTO public.library_book_moderation(book_id,author_id,visibility,hidden_reason,auto_hidden)
      VALUES($1,$2,'hidden',$3,true)
      ON CONFLICT(book_id) DO UPDATE SET
       visibility=CASE WHEN public.library_book_moderation.visibility='removed' THEN public.library_book_moderation.visibility ELSE 'hidden' END,
       hidden_reason=CASE WHEN public.library_book_moderation.visibility='removed' THEN public.library_book_moderation.hidden_reason ELSE EXCLUDED.hidden_reason END,
       auto_hidden=CASE WHEN public.library_book_moderation.visibility='removed' THEN public.library_book_moderation.auto_hidden ELSE true END,
       updated_at=clock_timestamp()$q$ USING thread.book_id,thread.recipient_id,reason;
    END IF;
   END IF;
   INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(thread.id,NULL,'staff',note);
   INSERT INTO public.inbox_notifications(recipient_id,kind,title,message,source_key,moderation_thread_id)
   VALUES(thread.recipient_id,'moderation_message','Alysum Moderation: '||thread.subject,note,'moderation:deadline:'||thread.id,thread.id)
   ON CONFLICT DO NOTHING;
   INSERT INTO public.mc_audit(actor_id,action,target,details)
   VALUES(NULL,'Book unpublished after missed response date',thread.book_id,jsonb_build_object('thread',thread.id));
  END IF;
  UPDATE public.mc_threads SET deadline_enforced_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=thread.id;
  hidden:=hidden+1;
 END LOOP;
 RETURN hidden;
END $$;

REVOKE ALL ON FUNCTION public.mc_enforce_book_deadlines() FROM PUBLIC,anon,authenticated;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  IF to_regprocedure('cron.unschedule(text)') IS NOT NULL THEN
   PERFORM cron.unschedule('moderation-book-deadlines') FROM cron.job WHERE jobname='moderation-book-deadlines';
  ELSE
   PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='moderation-book-deadlines';
  END IF;
  PERFORM cron.schedule('moderation-book-deadlines','15 * * * *','SELECT public.mc_enforce_book_deadlines();');
 ELSE
  RAISE NOTICE 'Enable pg_cron, then rerun this migration to check missed book-message deadlines hourly.';
 END IF;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
