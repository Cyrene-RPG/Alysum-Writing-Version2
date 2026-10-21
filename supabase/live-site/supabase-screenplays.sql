-- Private screenplay drafts and immutable revisions. Additive; safe to rerun.
-- Preview works without applying this. Apply only when preparing the main rollout.
BEGIN;
CREATE TABLE IF NOT EXISTS public.screenplays (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=5000000),
 version integer NOT NULL CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screenplays_owner_idx ON public.screenplays(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS public.screenplay_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),screenplay_id uuid NOT NULL REFERENCES public.screenplays(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,version integer NOT NULL,
 request_id uuid NOT NULL,document jsonb NOT NULL,label text NOT NULL DEFAULT '' CHECK(length(label)<=200),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(screenplay_id,version),UNIQUE(screenplay_id,request_id)
);
ALTER TABLE public.screenplays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenplay_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.screenplays,public.screenplay_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.screenplays,public.screenplay_revisions TO authenticated;
DROP POLICY IF EXISTS screenplay_owner_read ON public.screenplays;
CREATE POLICY screenplay_owner_read ON public.screenplays FOR SELECT TO authenticated USING(owner_id=auth.uid());
DROP POLICY IF EXISTS screenplay_revision_owner_read ON public.screenplay_revisions;
CREATE POLICY screenplay_revision_owner_read ON public.screenplay_revisions FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE OR REPLACE FUNCTION public.save_screenplay(p_id uuid,p_expected_version integer,p_document jsonb,p_request_id uuid,p_label text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_row public.screenplays%ROWTYPE;v_prior public.screenplay_revisions%ROWTYPE;v_block jsonb;v_run jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to save a screenplay.';END IF;
 IF p_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 THEN RAISE EXCEPTION 'Invalid screenplay save request.';END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR p_document->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(p_document->'version') IS DISTINCT FROM 'number'
  OR COALESCE(length(trim(p_document->>'title')),0) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(p_document->'blocks') IS DISTINCT FROM 'array' OR octet_length(p_document::text)>5000000 THEN RAISE EXCEPTION 'Invalid screenplay document.';END IF;
 IF jsonb_array_length(p_document->'blocks') NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Invalid screenplay element count.';END IF;
 FOR v_block IN SELECT value FROM jsonb_array_elements(p_document->'blocks') LOOP
  IF jsonb_typeof(v_block)<>'object' OR COALESCE(v_block->>'type','') NOT IN ('scene','action','character','dialogue','parenthetical','transition','shot')
   OR COALESCE(length(v_block->>'id'),0) NOT BETWEEN 1 AND 80 OR jsonb_typeof(v_block->'runs') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid screenplay element.';END IF;
  FOR v_run IN SELECT value FROM jsonb_array_elements(v_block->'runs') LOOP
   IF jsonb_typeof(v_run)<>'object' OR jsonb_typeof(v_run->'text') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid screenplay text.';END IF;
  END LOOP;
 END LOOP;
 -- Serialize creation and saves, including retries after a lost response.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO v_row FROM public.screenplays WHERE id=p_id FOR UPDATE;
 IF FOUND AND v_row.owner_id<>v_uid THEN RAISE EXCEPTION 'This screenplay is not available to your account.';END IF;
 SELECT * INTO v_prior FROM public.screenplay_revisions WHERE screenplay_id=p_id AND request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.owner_id<>v_uid OR v_prior.document<>p_document THEN RAISE EXCEPTION 'This save request cannot be reused.';END IF;
  RETURN jsonb_build_object('id',p_id,'owner_id',v_uid,'title',v_prior.document->>'title','document',v_prior.document,'version',v_prior.version,'updated_at',v_prior.created_at);
 END IF;
 IF COALESCE(v_row.version,0)<>p_expected_version THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='This screenplay changed in another tab or device.';END IF;
 IF v_row.id IS NULL THEN
  INSERT INTO public.screenplays(id,owner_id,title,document,version) VALUES(p_id,v_uid,trim(p_document->>'title'),p_document,1) RETURNING * INTO v_row;
 ELSE
  UPDATE public.screenplays SET title=trim(p_document->>'title'),document=p_document,version=version+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO v_row;
 END IF;
 INSERT INTO public.screenplay_revisions(screenplay_id,owner_id,version,request_id,document,label) VALUES(p_id,v_uid,v_row.version,p_request_id,p_document,COALESCE(p_label,''));
 -- Named drafts are retained; recent autosaves cover the latest 100 versions.
 DELETE FROM public.screenplay_revisions WHERE screenplay_id=p_id AND label='' AND version<=v_row.version-100;
 RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.save_screenplay(uuid,integer,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_screenplay(uuid,integer,jsonb,uuid,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
