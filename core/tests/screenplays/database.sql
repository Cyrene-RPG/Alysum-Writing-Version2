SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.save_screenplay('20000000-0000-0000-0000-000000000001',0,'{"version":1,"title":"Private script","blocks":[{"id":"scene","type":"scene","runs":[{"text":"INT. ROOM - DAY"}]}]}','30000000-0000-0000-0000-000000000001','First draft');
-- Retrying the exact same operation is idempotent even with the old base version.
SELECT public.save_screenplay('20000000-0000-0000-0000-000000000001',0,'{"version":1,"title":"Private script","blocks":[{"id":"scene","type":"scene","runs":[{"text":"INT. ROOM - DAY"}]}]}','30000000-0000-0000-0000-000000000001','First draft');
DO $$ BEGIN
 IF (SELECT version FROM public.screenplays LIMIT 1)<>1 OR (SELECT count(*) FROM public.screenplay_revisions)<>1 THEN RAISE EXCEPTION 'Retry created duplicate revision';END IF;
 BEGIN PERFORM public.save_screenplay('20000000-0000-0000-0000-000000000001',0,'{"version":1,"title":"Stale","blocks":[{"id":"a","type":"action","runs":[]}]}','30000000-0000-0000-0000-000000000002','');RAISE EXCEPTION 'Stale save succeeded';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN UPDATE public.screenplays SET title='Direct update';RAISE EXCEPTION 'Direct write succeeded';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.screenplays)<>0 OR (SELECT count(*) FROM public.screenplay_revisions)<>0 THEN RAISE EXCEPTION 'Another account can read script';END IF;
 BEGIN PERFORM public.save_screenplay('20000000-0000-0000-0000-000000000001',1,'{"version":1,"title":"Attack","blocks":[{"id":"a","type":"action","runs":[]}]}','30000000-0000-0000-0000-000000000003','');RAISE EXCEPTION 'Another account can write script';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Another account can write script' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.save_screenplay(NULL,0,'{}',NULL,'');RAISE EXCEPTION 'Anonymous execution succeeded';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM public.screenplays;RAISE EXCEPTION 'Anonymous read succeeded';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT 'PASS screenplay privacy, write isolation, version conflicts and retry idempotence';
