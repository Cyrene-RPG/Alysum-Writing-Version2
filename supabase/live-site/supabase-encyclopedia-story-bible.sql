-- New Story Bible. Additive: never reads or alters legacy Bible/blob records.
-- Install on a staging copy first. Requires live books + draft_parent_id migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.story_bibles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.story_bible_book_links (
 book_id text PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
 bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.story_bible_members (
 bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL CHECK(role IN ('editor','viewer')),
 PRIMARY KEY(bible_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.story_bible_entry_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80), fields jsonb NOT NULL DEFAULT '[]', sections jsonb NOT NULL DEFAULT '[]',
 revision integer NOT NULL DEFAULT 1, UNIQUE(bible_id,id)
);
CREATE TABLE IF NOT EXISTS public.story_bible_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE,
 type_id uuid NOT NULL, title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), aliases jsonb NOT NULL DEFAULT '[]', tags jsonb NOT NULL DEFAULT '[]',
 fields jsonb NOT NULL DEFAULT '{}', custom_fields jsonb NOT NULL DEFAULT '[]', sections jsonb NOT NULL DEFAULT '{}', portrait_path text,
 revision integer NOT NULL DEFAULT 1, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bible_id,id), FOREIGN KEY(bible_id,type_id) REFERENCES public.story_bible_entry_types(bible_id,id)
);
CREATE TABLE IF NOT EXISTS public.story_bible_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE,
 source_id uuid NOT NULL, target_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('reference','relationship')),
 label text NOT NULL DEFAULT '', reverse_label text NOT NULL DEFAULT '',
 FOREIGN KEY(bible_id,source_id) REFERENCES public.story_bible_entries(bible_id,id) ON DELETE CASCADE,
 FOREIGN KEY(bible_id,target_id) REFERENCES public.story_bible_entries(bible_id,id) ON DELETE CASCADE,
 UNIQUE(bible_id,source_id,target_id,kind,label)
);
CREATE TABLE IF NOT EXISTS public.story_bible_canon_facts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE,
 entry_id uuid NOT NULL, category text NOT NULL DEFAULT '', value text NOT NULL CHECK(length(value) BETWEEN 1 AND 10000),
 source_book_id text REFERENCES public.books(id) ON DELETE SET NULL, source_chapter_id text NOT NULL DEFAULT '', source_text text NOT NULL DEFAULT '', source_context text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(bible_id,entry_id) REFERENCES public.story_bible_entries(bible_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.story_bible_mentions (
 bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE, book_id text NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
 chapter_id text NOT NULL, entry_id uuid NOT NULL, occurrence integer NOT NULL, excerpt text NOT NULL DEFAULT '',
 PRIMARY KEY(bible_id,book_id,chapter_id,occurrence), FOREIGN KEY(bible_id,entry_id) REFERENCES public.story_bible_entries(bible_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.story_bible_entry_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bible_id uuid NOT NULL REFERENCES public.story_bibles(id) ON DELETE CASCADE,
 entry_id uuid NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(bible_id,entry_id) REFERENCES public.story_bible_entries(bible_id,id) ON DELETE CASCADE, UNIQUE(entry_id,revision)
);
CREATE INDEX IF NOT EXISTS story_bible_entries_directory_idx ON public.story_bible_entries(bible_id,type_id,title);
CREATE INDEX IF NOT EXISTS story_bible_connections_target_idx ON public.story_bible_connections(bible_id,target_id);
CREATE INDEX IF NOT EXISTS story_bible_mentions_entry_idx ON public.story_bible_mentions(bible_id,entry_id);

CREATE OR REPLACE FUNCTION public.get_story_bible_role(p_bible_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN b.owner_id=auth.uid() THEN 'owner' ELSE (SELECT m.role FROM public.story_bible_members m WHERE m.bible_id=b.id AND m.user_id=auth.uid()) END
 FROM public.story_bibles b WHERE b.id=p_bible_id AND auth.uid() IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public.require_story_bible_editor(p_bible_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF COALESCE(public.get_story_bible_role(p_bible_id),'') NOT IN ('owner','editor') THEN RAISE EXCEPTION 'You do not have permission to edit this Story Bible.' USING ERRCODE='42501'; END IF;
END; $$;
-- Read-only table access. All mutations go through checked, transactional RPCs.
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['story_bibles','story_bible_book_links','story_bible_members','story_bible_entry_types','story_bible_entries','story_bible_connections','story_bible_canon_facts','story_bible_mentions','story_bible_entry_versions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',name);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',name);
  EXECUTE format('DROP POLICY IF EXISTS story_bible_read ON public.%I',name);
  EXECUTE format('CREATE POLICY story_bible_read ON public.%I FOR SELECT TO authenticated USING (public.get_story_bible_role(%s) IS NOT NULL)',name,CASE WHEN name='story_bibles' THEN 'id' ELSE 'bible_id' END);
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.open_story_bible(p_book_id text,p_create boolean DEFAULT false,p_templates jsonb DEFAULT '[]') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE book public.books; root public.books; bible uuid; template jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use Story Bible.' USING ERRCODE='42501'; END IF;
 SELECT * INTO book FROM public.books WHERE id=p_book_id;
 IF NOT FOUND OR NOT (book.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.book_editors WHERE book_id=p_book_id AND user_id=auth.uid())) THEN RAISE EXCEPTION 'Book unavailable.' USING ERRCODE='42501'; END IF;
 -- Lock the root before resolving/creating links; concurrent opens create one Bible.
 SELECT * INTO root FROM public.books WHERE id=COALESCE(book.draft_parent_id,book.id) FOR UPDATE;
 IF NOT FOUND OR root.user_id<>book.user_id THEN RAISE EXCEPTION 'Could not confirm this draft’s parent book.'; END IF;
 SELECT bible_id INTO bible FROM public.story_bible_book_links WHERE book_id=root.id;
 IF bible IS NULL AND p_create THEN
  IF root.user_id<>auth.uid() THEN RAISE EXCEPTION 'The book owner must create its Story Bible.' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_templates)<>'array' OR jsonb_array_length(p_templates)>20 THEN RAISE EXCEPTION 'Invalid templates.'; END IF;
  INSERT INTO public.story_bibles(owner_id,title) VALUES(auth.uid(),left(root.title||' — Story Bible',240)) RETURNING id INTO bible;
  INSERT INTO public.story_bible_book_links(book_id,bible_id) VALUES(root.id,bible);
  FOR template IN SELECT value FROM jsonb_array_elements(p_templates) LOOP
   PERFORM public.save_story_bible_type(bible,NULL,0,template);
  END LOOP;
 END IF;
 IF bible IS NULL THEN RETURN NULL; END IF;
 IF public.get_story_bible_role(bible) IS NULL THEN RAISE EXCEPTION 'Ask the owner to grant you Story Bible access.' USING ERRCODE='42501'; END IF;
 IF root.user_id=auth.uid() THEN INSERT INTO public.story_bible_book_links(book_id,bible_id) VALUES(book.id,bible) ON CONFLICT(book_id) DO NOTHING; END IF;
 RETURN (SELECT to_jsonb(b)||jsonb_build_object('role',public.get_story_bible_role(bible)) FROM public.story_bibles b WHERE id=bible);
END; $$;

CREATE OR REPLACE FUNCTION public.save_story_bible_type(p_bible_id uuid,p_type_id uuid,p_revision integer,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.story_bible_entry_types; item jsonb; ids text[]; part text;
BEGIN
 IF public.get_story_bible_role(p_bible_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Only the owner can change category templates.' USING ERRCODE='42501'; END IF;
 IF length(trim(COALESCE(p_data->>'name',''))) NOT BETWEEN 1 AND 80 OR octet_length(p_data::text)>60000 THEN RAISE EXCEPTION 'Invalid category.'; END IF;
 FOREACH part IN ARRAY ARRAY['fields','sections'] LOOP
  IF jsonb_typeof(p_data->part) IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->part)>60 THEN RAISE EXCEPTION 'Invalid template sections or fields.'; END IF;
  ids=ARRAY[]::text[];
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->part) LOOP
   IF COALESCE(item->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' OR item->>'id'=ANY(ids) OR length(trim(COALESCE(item->>'label',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid field ID or label.'; END IF;
   ids=array_append(ids,item->>'id');
   IF part='fields' AND COALESCE(item->>'type','') NOT IN ('text','long-text','number','checkbox','choice','multiple-choice','date','reference') THEN RAISE EXCEPTION 'Invalid field type.'; END IF;
   IF item->>'type' IN ('choice','multiple-choice') AND (jsonb_typeof(item->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'options')>100) THEN RAISE EXCEPTION 'Invalid choice options.'; END IF;
  END LOOP;
 END LOOP;
 IF p_type_id IS NULL THEN
  INSERT INTO public.story_bible_entry_types(bible_id,name,fields,sections) VALUES(p_bible_id,trim(p_data->>'name'),p_data->'fields',p_data->'sections') RETURNING * INTO result;
 ELSE
  UPDATE public.story_bible_entry_types SET name=trim(p_data->>'name'),fields=p_data->'fields',sections=p_data->'sections',revision=revision+1 WHERE id=p_type_id AND bible_id=p_bible_id AND revision=p_revision RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'BIBLE_CONFLICT'; END IF;
 END IF;
 RETURN to_jsonb(result);
END; $$;

CREATE OR REPLACE FUNCTION public.save_story_bible_entry(p_bible_id uuid,p_entry_id uuid,p_revision integer,p_data jsonb,p_links jsonb DEFAULT '[]') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.story_bible_entries; previous public.story_bible_entries; target uuid; field_value jsonb; definition jsonb; targets uuid[]:=ARRAY[]::uuid[]; section jsonb; match text[];
BEGIN
 PERFORM public.require_story_bible_editor(p_bible_id);
 IF octet_length(p_data::text)>400000 OR length(trim(COALESCE(p_data->>'title',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid profile name or size.'; END IF;
 IF jsonb_typeof(p_data->'fields') IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'sections') IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'aliases') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'tags') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid profile fields.'; END IF;
 IF jsonb_array_length(p_data->'aliases')>30 OR jsonb_array_length(p_data->'tags')>30 THEN RAISE EXCEPTION 'Too many aliases or tags.'; END IF;
 IF jsonb_typeof(COALESCE(p_data->'custom_fields','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(COALESCE(p_data->'custom_fields','[]'))>60 THEN RAISE EXCEPTION 'Invalid custom fields.'; END IF;
 FOR definition IN SELECT value FROM jsonb_array_elements(COALESCE(p_data->'custom_fields','[]')) LOOP
  IF COALESCE(definition->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' OR length(COALESCE(definition->>'label','')) NOT BETWEEN 1 AND 100 OR definition->>'type' IS DISTINCT FROM 'text' THEN RAISE EXCEPTION 'Invalid additional field.'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.story_bible_entry_types WHERE id=(p_data->>'type_id')::uuid AND bible_id=p_bible_id) THEN RAISE EXCEPTION 'Category unavailable.'; END IF;
 IF NULLIF(p_data->>'portrait_path','') IS NOT NULL AND (split_part(p_data->>'portrait_path','/',1)<>p_bible_id::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='story-bible-portraits' AND name=p_data->>'portrait_path')) THEN RAISE EXCEPTION 'Portrait unavailable.'; END IF;
 -- Derive links on the server; caller-provided indexes are never authoritative.
 FOR section IN SELECT value FROM jsonb_each(p_data->'sections') LOOP
  IF jsonb_typeof(section)<>'string' THEN RAISE EXCEPTION 'Sections must contain text.'; END IF;
  FOR match IN SELECT regexp_matches(section #>> '{}','\[\[([a-fA-F0-9-]{36})(?:\|[^\]\n]*)?\]\]','g') LOOP targets=array_append(targets,match[1]::uuid); END LOOP;
 END LOOP;
 FOR definition IN SELECT value FROM public.story_bible_entry_types t,jsonb_array_elements(t.fields) WHERE t.id=(p_data->>'type_id')::uuid AND t.bible_id=p_bible_id LOOP
  field_value=p_data->'fields'->(definition->>'id');
  IF definition->>'type'='reference' AND NULLIF(field_value #>> '{}','') IS NOT NULL THEN targets=array_append(targets,(field_value #>> '{}')::uuid); END IF;
 END LOOP;
 FOREACH target IN ARRAY targets LOOP
  IF NOT EXISTS(SELECT 1 FROM public.story_bible_entries WHERE id=target AND bible_id=p_bible_id) THEN RAISE EXCEPTION 'A linked entry is unavailable in this Bible.'; END IF;
 END LOOP;
 IF p_revision=0 THEN
  INSERT INTO public.story_bible_entries(id,bible_id,type_id,title,aliases,tags,fields,custom_fields,sections,portrait_path) VALUES(COALESCE(p_entry_id,gen_random_uuid()),p_bible_id,(p_data->>'type_id')::uuid,trim(p_data->>'title'),p_data->'aliases',p_data->'tags',p_data->'fields',COALESCE(p_data->'custom_fields','[]'),p_data->'sections',NULLIF(p_data->>'portrait_path','')) ON CONFLICT(id) DO NOTHING RETURNING * INTO result;
  IF NOT FOUND THEN
   SELECT * INTO result FROM public.story_bible_entries WHERE id=p_entry_id AND bible_id=p_bible_id;
   IF NOT FOUND OR result.title<>trim(p_data->>'title') OR result.type_id<>(p_data->>'type_id')::uuid OR result.fields<>p_data->'fields' OR result.sections<>p_data->'sections' THEN RAISE EXCEPTION 'BIBLE_CONFLICT'; END IF;
   RETURN to_jsonb(result);
  END IF;
 ELSE
  SELECT * INTO previous FROM public.story_bible_entries WHERE id=p_entry_id AND bible_id=p_bible_id FOR UPDATE;
  IF NOT FOUND OR previous.revision<>p_revision THEN RAISE EXCEPTION 'BIBLE_CONFLICT'; END IF;
  INSERT INTO public.story_bible_entry_versions(bible_id,entry_id,revision,snapshot) VALUES(p_bible_id,p_entry_id,previous.revision,to_jsonb(previous));
  UPDATE public.story_bible_entries SET type_id=(p_data->>'type_id')::uuid,title=trim(p_data->>'title'),aliases=p_data->'aliases',tags=p_data->'tags',fields=p_data->'fields',custom_fields=COALESCE(p_data->'custom_fields','[]'),sections=p_data->'sections',portrait_path=NULLIF(p_data->>'portrait_path',''),revision=revision+1,updated_at=now(),archived_at=CASE WHEN COALESCE((p_data->>'archived')::boolean,false) THEN COALESCE(previous.archived_at,now()) ELSE NULL END WHERE id=p_entry_id AND bible_id=p_bible_id RETURNING * INTO result;
 END IF;
 DELETE FROM public.story_bible_connections WHERE bible_id=p_bible_id AND source_id=result.id AND kind='reference';
 INSERT INTO public.story_bible_connections(bible_id,source_id,target_id,kind) SELECT p_bible_id,result.id,target_id,'reference' FROM (SELECT DISTINCT unnest(targets) AS target_id) links ON CONFLICT DO NOTHING;
 RETURN to_jsonb(result);
END; $$;

CREATE OR REPLACE FUNCTION public.connect_story_bible_entries(p_bible_id uuid,p_source uuid,p_target uuid,p_label text,p_reverse text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.require_story_bible_editor(p_bible_id);
 IF p_source=p_target OR length(trim(p_label)) NOT BETWEEN 1 AND 100 OR length(p_reverse)>100 THEN RAISE EXCEPTION 'Choose two different entries and a short relationship label.'; END IF;
 INSERT INTO public.story_bible_connections(bible_id,source_id,target_id,kind,label,reverse_label) VALUES(p_bible_id,p_source,p_target,'relationship',trim(p_label),trim(p_reverse)) ON CONFLICT DO NOTHING;
END; $$;
CREATE OR REPLACE FUNCTION public.remove_story_bible_connection(p_bible_id uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.require_story_bible_editor(p_bible_id);
 DELETE FROM public.story_bible_connections WHERE id=p_id AND bible_id=p_bible_id AND kind='relationship';
END; $$;
CREATE OR REPLACE FUNCTION public.add_story_bible_fact(p_bible_id uuid,p_entry_id uuid,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.story_bible_canon_facts; fact_id uuid:=COALESCE(NULLIF(p_data->>'id','')::uuid,gen_random_uuid());
BEGIN
 PERFORM public.require_story_bible_editor(p_bible_id);
 IF length(COALESCE(p_data->>'category',''))>100 OR octet_length(p_data::text)>30000 THEN RAISE EXCEPTION 'Fact is too large.'; END IF;
 IF NULLIF(p_data->>'bookId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.books b JOIN public.story_bible_book_links l ON l.book_id=COALESCE(b.draft_parent_id,b.id) WHERE b.id=p_data->>'bookId' AND l.bible_id=p_bible_id AND (b.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.book_editors e WHERE e.book_id=b.id AND e.user_id=auth.uid()))) THEN RAISE EXCEPTION 'Source book unavailable.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.story_bible_canon_facts(id,bible_id,entry_id,category,value,source_book_id,source_chapter_id,source_text,source_context) VALUES(fact_id,p_bible_id,p_entry_id,COALESCE(p_data->>'category',''),trim(p_data->>'value'),NULLIF(p_data->>'bookId',''),COALESCE(p_data->>'chapterId',''),COALESCE(p_data->>'sourceText',''),COALESCE(p_data->>'sourceContext','')) ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO existing FROM public.story_bible_canon_facts WHERE id=fact_id;
  IF NOT FOUND OR existing.bible_id<>p_bible_id OR existing.entry_id<>p_entry_id OR existing.category<>COALESCE(p_data->>'category','') OR existing.value<>trim(p_data->>'value') OR existing.source_book_id IS DISTINCT FROM NULLIF(p_data->>'bookId','') OR existing.source_chapter_id<>COALESCE(p_data->>'chapterId','') OR existing.source_text<>COALESCE(p_data->>'sourceText','') THEN RAISE EXCEPTION 'This capture was already saved with different details. Close and select the passage again.'; END IF;
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.replace_story_bible_mentions(p_bible_id uuid,p_book_id text,p_chapter_id text,p_mentions jsonb,p_expected_updated bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.require_story_bible_editor(p_bible_id);
 IF NOT EXISTS(SELECT 1 FROM public.books b JOIN public.story_bible_book_links l ON l.book_id=COALESCE(b.draft_parent_id,b.id) WHERE b.id=p_book_id AND l.bible_id=p_bible_id AND (b.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.book_editors e WHERE e.book_id=b.id AND e.user_id=auth.uid()))) THEN RAISE EXCEPTION 'Book unavailable.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_mentions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_mentions)>5000 OR length(p_chapter_id)>200 THEN RAISE EXCEPTION 'Invalid mentions.'; END IF;
 -- Serialize chapter indexing even when there are currently zero mentions.
 PERFORM 1 FROM public.books WHERE id=p_book_id AND updated=p_expected_updated FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'The manuscript changed; appearance indexing will retry after the next save.'; END IF;
 DELETE FROM public.story_bible_mentions WHERE bible_id=p_bible_id AND book_id=p_book_id AND (p_chapter_id='*' OR chapter_id=p_chapter_id);
 INSERT INTO public.story_bible_mentions(bible_id,book_id,chapter_id,entry_id,occurrence,excerpt) SELECT p_bible_id,p_book_id,CASE WHEN p_chapter_id='*' THEN left(value->>'chapterId',200) ELSE p_chapter_id END,(value->>'entryId')::uuid,ordinality::integer,left(COALESCE(value->>'excerpt',''),240) FROM jsonb_array_elements(p_mentions) WITH ORDINALITY;
END; $$;
CREATE OR REPLACE FUNCTION public.set_story_bible_member(p_bible_id uuid,p_email text,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE member uuid; owner uuid;
BEGIN
 IF public.get_story_bible_role(p_bible_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Only the owner can change access.' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN ('editor','viewer','remove') THEN RAISE EXCEPTION 'Invalid role.'; END IF;
 SELECT id INTO member FROM auth.users WHERE lower(email)=lower(trim(p_email));
 SELECT owner_id INTO owner FROM public.story_bibles WHERE id=p_bible_id;
 IF member IS NULL OR member=owner THEN RAISE EXCEPTION 'Choose another existing Alysum account.'; END IF;
 IF p_role='remove' THEN DELETE FROM public.story_bible_members WHERE bible_id=p_bible_id AND user_id=member;
 ELSE INSERT INTO public.story_bible_members(bible_id,user_id,role) VALUES(p_bible_id,member,p_role) ON CONFLICT(bible_id,user_id) DO UPDATE SET role=EXCLUDED.role; END IF;
END; $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('story-bible-portraits','story-bible-portraits',false,5242880,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
-- Invalid object paths return NULL, rather than casting arbitrary bucket paths to UUID.
CREATE OR REPLACE FUNCTION public.story_bible_portrait_id(p_path text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$ BEGIN RETURN split_part(p_path,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END; $$;
DROP POLICY IF EXISTS story_bible_portrait_read ON storage.objects;
CREATE POLICY story_bible_portrait_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='story-bible-portraits' AND public.get_story_bible_role(public.story_bible_portrait_id(name)) IS NOT NULL);
DROP POLICY IF EXISTS story_bible_portrait_insert ON storage.objects;
CREATE POLICY story_bible_portrait_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='story-bible-portraits' AND public.get_story_bible_role(public.story_bible_portrait_id(name)) IN ('owner','editor'));
-- No public access, overwrites, or client deletes. Old portraits are retained for version recovery.
DO $$ DECLARE routine record; BEGIN
 FOR routine IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_story_bible_role','require_story_bible_editor','open_story_bible','save_story_bible_type','save_story_bible_entry','connect_story_bible_entries','remove_story_bible_connection','add_story_bible_fact','replace_story_bible_mentions','set_story_bible_member','story_bible_portrait_id') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',routine.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',routine.signature);
 END LOOP;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
