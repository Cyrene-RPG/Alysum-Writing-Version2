-- Private audiobook drafts, separate from written books. Safe to rerun.
-- Prepared for the audiobook feature branch. Do not run until rollout is requested.
BEGIN;
CREATE TABLE IF NOT EXISTS public.audiobooks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 linked_book_id text REFERENCES public.books(id) ON DELETE SET NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=6000),
 narrator text NOT NULL DEFAULT '' CHECK(length(narrator)<=200),
 credits text NOT NULL DEFAULT '' CHECK(length(credits)<=2000),
 rights_confirmed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audiobooks_owner_idx ON public.audiobooks(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS public.audiobook_tracks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 audiobook_id uuid NOT NULL REFERENCES public.audiobooks(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 storage_path text NOT NULL UNIQUE,
 duration_seconds double precision NOT NULL CHECK(duration_seconds>0 AND duration_seconds<=86400),
 size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=52428800),
 position integer NOT NULL CHECK(position>=0),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(audiobook_id,position)
);
ALTER TABLE public.audiobooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audiobook_tracks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audiobooks,public.audiobook_tracks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.audiobooks,public.audiobook_tracks TO authenticated;

CREATE OR REPLACE FUNCTION public.owns_audiobook(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.audiobooks WHERE id=p_id AND owner_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.can_upload_audiobook(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.audiobooks WHERE id=p_id AND owner_id=auth.uid() AND rights_confirmed);
$$;
REVOKE ALL ON FUNCTION public.owns_audiobook(uuid),public.can_upload_audiobook(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owns_audiobook(uuid),public.can_upload_audiobook(uuid) TO authenticated;
DROP POLICY IF EXISTS audiobooks_owner_read ON public.audiobooks;
CREATE POLICY audiobooks_owner_read ON public.audiobooks FOR SELECT TO authenticated USING(owner_id=auth.uid());
DROP POLICY IF EXISTS audiobook_tracks_owner_read ON public.audiobook_tracks;
CREATE POLICY audiobook_tracks_owner_read ON public.audiobook_tracks FOR SELECT TO authenticated USING(public.owns_audiobook(audiobook_id));

CREATE OR REPLACE FUNCTION public.save_audiobook(p_id uuid,p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_book text:=NULLIF(p_details->>'linked_book_id','');v_row public.audiobooks%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to save an audiobook.'; END IF;
 IF p_details IS NULL OR jsonb_typeof(p_details)<>'object' OR COALESCE(length(trim(p_details->>'title')),0) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Give the audiobook a title using 1–200 characters.';
 END IF;
 IF v_book IS NOT NULL THEN
  -- Editors cannot attach an audio edition to someone else''s written book.
  PERFORM 1 FROM public.books WHERE id=v_book AND user_id=v_uid FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a written book that you own, or create a standalone audiobook.'; END IF;
 END IF;
 IF p_id IS NOT NULL THEN
  PERFORM 1 FROM public.audiobooks WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This audiobook is not available to your account.'; END IF;
  UPDATE public.audiobooks SET title=trim(p_details->>'title'),description=COALESCE(p_details->>'description',''),
   narrator=trim(COALESCE(p_details->>'narrator','')),credits=trim(COALESCE(p_details->>'credits','')),
   rights_confirmed=COALESCE((p_details->>'rights_confirmed')::boolean,false),linked_book_id=v_book,updated_at=clock_timestamp()
   WHERE id=p_id RETURNING * INTO v_row;
 ELSE
  INSERT INTO public.audiobooks(owner_id,linked_book_id,title,description,narrator,credits,rights_confirmed)
   VALUES(v_uid,v_book,trim(p_details->>'title'),COALESCE(p_details->>'description',''),trim(COALESCE(p_details->>'narrator','')),
    trim(COALESCE(p_details->>'credits','')),COALESCE((p_details->>'rights_confirmed')::boolean,false)) RETURNING * INTO v_row;
 END IF;
 RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_audiobook_track(p_audiobook_id uuid,p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_book public.audiobooks%ROWTYPE;v_track public.audiobook_tracks%ROWTYPE;v_path text:=p_details->>'storage_path';
 v_position integer;v_size bigint;v_mime text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to upload a recording.'; END IF;
 SELECT * INTO v_book FROM public.audiobooks WHERE id=p_audiobook_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This audiobook is not available to your account.'; END IF;
 IF NOT v_book.rights_confirmed THEN RAISE EXCEPTION 'Confirm your permission to share these recordings first.'; END IF;
 IF v_path IS NULL OR v_path !~ ('^'||auth.uid()::text||'/'||p_audiobook_id::text||'/[a-f0-9-]{36}[.](mp3|m4a|ogg|wav|webm)$') THEN
  RAISE EXCEPTION 'The recording path does not belong to this audiobook.';
 END IF;
 SELECT (metadata->>'size')::bigint,metadata->>'mimetype' INTO v_size,v_mime FROM storage.objects
  WHERE bucket_id='audiobook-recordings' AND name=v_path;
 IF NOT FOUND OR v_size IS NULL OR v_size<1 OR v_size>52428800 OR v_size IS DISTINCT FROM (p_details->>'size_bytes')::bigint
  OR v_mime IS NULL OR v_mime NOT IN ('audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm') THEN
  RAISE EXCEPTION 'Could not verify the uploaded recording. Try the upload again.';
 END IF;
 SELECT COALESCE(max(position)+1,0) INTO v_position FROM public.audiobook_tracks WHERE audiobook_id=p_audiobook_id;
 INSERT INTO public.audiobook_tracks(audiobook_id,title,storage_path,duration_seconds,size_bytes,position)
  VALUES(p_audiobook_id,trim(p_details->>'title'),v_path,(p_details->>'duration_seconds')::double precision,v_size,v_position) RETURNING * INTO v_track;
 UPDATE public.audiobooks SET updated_at=clock_timestamp() WHERE id=p_audiobook_id;
 RETURN to_jsonb(v_track);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_audiobook_track(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_book uuid;v_path text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to remove a recording.'; END IF;
 SELECT t.audiobook_id INTO v_book FROM public.audiobook_tracks t JOIN public.audiobooks a ON a.id=t.audiobook_id
  WHERE t.id=p_id AND a.owner_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'This recording is not available to your account.'; END IF;
 PERFORM 1 FROM public.audiobooks WHERE id=v_book AND owner_id=auth.uid() FOR UPDATE;
 DELETE FROM public.audiobook_tracks WHERE id=p_id AND audiobook_id=v_book RETURNING storage_path INTO v_path;
 IF NOT FOUND THEN RAISE EXCEPTION 'This recording has already been removed. Reload the audiobook.'; END IF;
 UPDATE public.audiobooks SET updated_at=clock_timestamp() WHERE id=v_book;
 RETURN jsonb_build_object('storage_path',v_path);
END;
$$;
REVOKE ALL ON FUNCTION public.save_audiobook(uuid,jsonb),public.add_audiobook_track(uuid,jsonb),public.remove_audiobook_track(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_audiobook(uuid,jsonb),public.add_audiobook_track(uuid,jsonb),public.remove_audiobook_track(uuid) TO authenticated;

-- Private storage: no public URLs, no anonymous policy, no overwrite permission.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('audiobook-recordings','audiobook-recordings',false,52428800,ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE OR REPLACE FUNCTION public.owns_audiobook_object(p_path text,p_upload boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_parts text[]:=string_to_array(p_path,'/');v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR array_length(v_parts,1)<>3 OR v_parts[1] IS DISTINCT FROM auth.uid()::text
  OR v_parts[2] !~ '^[a-f0-9-]{36}$' OR v_parts[3] !~ '^[a-f0-9-]{36}[.](mp3|m4a|ogg|wav|webm)$' THEN RETURN false; END IF;
 BEGIN v_id:=v_parts[2]::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN CASE WHEN p_upload THEN public.can_upload_audiobook(v_id) ELSE public.owns_audiobook(v_id) END;
END;
$$;
REVOKE ALL ON FUNCTION public.owns_audiobook_object(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owns_audiobook_object(text,boolean) TO authenticated;
DROP POLICY IF EXISTS audiobook_recordings_read ON storage.objects;
CREATE POLICY audiobook_recordings_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='audiobook-recordings' AND public.owns_audiobook_object(name,false));
DROP POLICY IF EXISTS audiobook_recordings_insert ON storage.objects;
CREATE POLICY audiobook_recordings_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='audiobook-recordings' AND public.owns_audiobook_object(name,true));
DROP POLICY IF EXISTS audiobook_recordings_delete ON storage.objects;
CREATE POLICY audiobook_recordings_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='audiobook-recordings' AND public.owns_audiobook_object(name,false));
COMMIT;
NOTIFY pgrst,'reload schema';
