SELECT public.assert_audio(current_database()='audiobook_test','disposable database required');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
SELECT public.save_audiobook(NULL,'{"title":"Audio edition","linked_book_id":"written"}')->>'id' AS audiobook_id \gset
SELECT set_config('test.audiobook_id',:'audiobook_id',false);
SELECT public.assert_audio((SELECT count(*)=1 FROM public.audiobooks),'owner can read private draft');
DO $$ BEGIN
 BEGIN PERFORM public.save_audiobook(NULL,'{"title":"Bad link","linked_book_id":"other"}');RAISE EXCEPTION 'Other owner linked';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%you own%' THEN RAISE;END IF;END;
 BEGIN INSERT INTO public.audiobooks(owner_id,title) VALUES(auth.uid(),'Raw');RAISE EXCEPTION 'Raw insert allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('audiobook-recordings',auth.uid()::text||'/'||current_setting('test.audiobook_id')||'/20000000-0000-0000-0000-000000000001.mp3','{"size":10,"mimetype":"audio/mpeg"}');RAISE EXCEPTION 'Upload without rights';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT public.save_audiobook(:'audiobook_id','{"title":"Audio edition","linked_book_id":"written","narrator":"Narrator","credits":"Production","rights_confirmed":true}');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('audiobook-recordings',auth.uid()::text||'/'||:'audiobook_id'||'/20000000-0000-0000-0000-000000000001.mp3','{"size":10,"mimetype":"audio/mpeg"}');
SELECT auth.uid()::text||'/'||:'audiobook_id'||'/20000000-0000-0000-0000-000000000001.mp3' AS recording_path \gset
SELECT public.add_audiobook_track(:'audiobook_id',jsonb_build_object('title','Chapter 1','duration_seconds',60,'size_bytes',10,'storage_path',:'recording_path'))->>'id' AS track_id \gset
SELECT set_config('test.track_id',:'track_id',false);
SELECT public.assert_audio((SELECT count(*)=1 FROM public.audiobook_tracks),'owner reads recording');
SELECT public.assert_audio((SELECT count(*)=1 FROM storage.objects),'owner reads private storage object');
DO $$ BEGIN
 BEGIN PERFORM public.add_audiobook_track(current_setting('test.audiobook_id')::uuid,'{"title":"Fake","storage_path":"other/path/file.mp3","duration_seconds":60,"size_bytes":10}');RAISE EXCEPTION 'Forged path';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%path does not belong%' THEN RAISE;END IF;END;
END $$;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT public.assert_audio((SELECT count(*)=0 FROM public.audiobooks),'other owner cannot read audiobook');
SELECT public.assert_audio((SELECT count(*)=0 FROM public.audiobook_tracks),'other owner cannot read tracks');
SELECT public.assert_audio((SELECT count(*)=0 FROM storage.objects),'other owner cannot read recording files');
DO $$ BEGIN
 BEGIN PERFORM public.save_audiobook(current_setting('test.audiobook_id')::uuid,'{"title":"Hijack"}');RAISE EXCEPTION 'Hijack allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%not available%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.remove_audiobook_track(current_setting('test.track_id')::uuid);RAISE EXCEPTION 'Other owner removed recording';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%not available%' THEN RAISE;END IF;END;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('audiobook-recordings','10000000-0000-0000-0000-000000000001/'||current_setting('test.audiobook_id')||'/20000000-0000-0000-0000-000000000002.mp3');RAISE EXCEPTION 'Other owner upload';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
CREATE TEMP TABLE before_rerun AS SELECT * FROM public.books;
\ir ../../../supabase/live-site/supabase-audiobooks.sql
SELECT public.assert_audio((SELECT count(*)=1 FROM public.audiobook_tracks),'rerun preserves recordings');
SELECT public.assert_audio(NOT EXISTS((SELECT * FROM public.books EXCEPT SELECT * FROM before_rerun) UNION ALL (SELECT * FROM before_rerun EXCEPT SELECT * FROM public.books)),'written books unchanged');
SELECT public.assert_audio((SELECT public=false FROM storage.buckets WHERE id='audiobook-recordings'),'bucket remains private');
SET ROLE anon;
SELECT public.assert_audio((SELECT count(*)=0 FROM storage.objects),'anonymous cannot read audio files');
DO $$ BEGIN
 BEGIN PERFORM public.save_audiobook(NULL,'{"title":"Anonymous"}');RAISE EXCEPTION 'Anonymous save';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET ROLE authenticated;SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
SELECT public.remove_audiobook_track(:'track_id');
SELECT public.assert_audio((SELECT count(*)=0 FROM public.audiobook_tracks),'owner removes track metadata');
DELETE FROM storage.objects WHERE name=:'recording_path';
SELECT public.assert_audio((SELECT count(*)=0 FROM storage.objects),'owner cleans up recording');
RESET ROLE;
SELECT 'Audiobook permission checks passed';
