-- Reading-link storage. Run in the Supabase project used by the site.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
-- Stores only the selected plain-text snapshot; does not alter manuscript or Library permissions.
CREATE TABLE IF NOT EXISTS public.wip_excerpts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  author text NOT NULL DEFAULT '' CHECK (char_length(author) <= 80),
  excerpt text NOT NULL,
  word_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE public.wip_excerpts ADD COLUMN IF NOT EXISTS source_chapters text[] NOT NULL DEFAULT ARRAY[]::text[];
-- Replace the original checks on existing installations as well as new ones.
ALTER TABLE public.wip_excerpts
  DROP CONSTRAINT IF EXISTS wip_excerpts_excerpt_check,
  DROP CONSTRAINT IF EXISTS wip_excerpts_word_count_check;
ALTER TABLE public.wip_excerpts
  ADD CONSTRAINT wip_excerpts_excerpt_check CHECK (char_length(excerpt) BETWEEN 1 AND 3000000),
  ADD CONSTRAINT wip_excerpts_word_count_check CHECK (word_count BETWEEN 1 AND 500000);
CREATE INDEX IF NOT EXISTS wip_excerpts_owner_book_idx ON public.wip_excerpts(owner_id, book_id, created_at DESC);
ALTER TABLE public.wip_excerpts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wip_excerpts FROM anon, authenticated;
GRANT SELECT ON public.wip_excerpts TO authenticated;
DROP POLICY IF EXISTS wip_excerpts_owner_select ON public.wip_excerpts;
CREATE POLICY wip_excerpts_owner_select ON public.wip_excerpts FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_wip_excerpt(p_book_id text, p_title text, p_author text, p_excerpt text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_row public.wip_excerpts; v_words integer; v_text text := btrim(coalesce(p_excerpt, ''), E' \n\r\t');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to create a reading link'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.books WHERE id = p_book_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner can share a section from this book';
  END IF;
  IF char_length(v_text) < 1 OR char_length(v_text) > 3000000 THEN RAISE EXCEPTION 'Choose a section of up to 3,000,000 characters'; END IF;
  v_words := cardinality(regexp_split_to_array(v_text, '\s+'));
  IF v_words > 500000 THEN RAISE EXCEPTION 'Choose a section of up to 500,000 words'; END IF;
  IF char_length(coalesce(p_title,'')) > 160 OR char_length(coalesce(p_author,'')) > 80 THEN RAISE EXCEPTION 'Shorten the title or author name'; END IF;
  -- Serialize per-owner creation to enforce the active-link cap under concurrent requests.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  IF (SELECT count(*) FROM public.wip_excerpts WHERE owner_id = auth.uid() AND revoked_at IS NULL) >= 100 THEN RAISE EXCEPTION 'Disable an old reading link before creating another'; END IF;
  INSERT INTO public.wip_excerpts(book_id, owner_id, title, author, excerpt, word_count)
  VALUES(p_book_id, auth.uid(), coalesce(nullif(btrim(p_title),''),'Untitled section'), coalesce(btrim(p_author),''), v_text, v_words) RETURNING * INTO v_row;
  RETURN jsonb_build_object('id',v_row.id,'token',v_row.token,'title',v_row.title,'author',v_row.author,'word_count',v_row.word_count,'created_at',v_row.created_at,'revoked_at',v_row.revoked_at);
END; $$;

-- Keep the original four-argument RPC available to cached editors.
CREATE OR REPLACE FUNCTION public.create_wip_excerpt(p_book_id text, p_title text, p_author text, p_excerpt text, p_sources text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved jsonb;
BEGIN
  IF cardinality(p_sources) IS DISTINCT FROM cardinality(string_to_array(p_excerpt, E'\n\f\n')) THEN
    RAISE EXCEPTION 'Chapter references do not match the shared pages';
  END IF;
  saved := public.create_wip_excerpt(p_book_id, p_title, p_author, p_excerpt);
  UPDATE public.wip_excerpts SET source_chapters = p_sources
    WHERE id = (saved->>'id')::uuid AND owner_id = auth.uid();
  RETURN saved;
END; $$;

CREATE OR REPLACE FUNCTION public.update_wip_excerpt_page(p_id uuid, p_page integer, p_expected text, p_text text, p_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parts text[];
  updated_text text;
  words integer;
BEGIN
  SELECT string_to_array(excerpt, E'\n\f\n') INTO parts FROM public.wip_excerpts
    WHERE id = p_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reading link unavailable'; END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND cardinality(parts)
     OR parts[p_page] IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'This page changed. Reopen Update chapters and try again.';
  END IF;
  IF p_text IS NULL OR p_text !~ '\S' OR strpos(p_text, E'\n\f\n') > 0 THEN
    RAISE EXCEPTION 'Choose text for one page';
  END IF;
  parts[p_page] := p_text;
  updated_text := array_to_string(parts, E'\n\f\n');
  IF char_length(updated_text) > 3000000 THEN RAISE EXCEPTION 'Reading links allow up to 3,000,000 characters'; END IF;
  words := cardinality(regexp_split_to_array(updated_text, '\s+'));
  IF words > 500000 THEN RAISE EXCEPTION 'Reading links allow up to 500,000 words'; END IF;
  -- Keep one-based positions even for old links with no references.
  UPDATE public.wip_excerpts SET excerpt = updated_text, word_count = words,
    source_chapters = ARRAY(SELECT CASE WHEN n = p_page THEN p_source ELSE source_chapters[n] END
                            FROM generate_series(1, cardinality(parts)) AS n ORDER BY n)
    WHERE id = p_id AND owner_id = auth.uid();
END; $$;
REVOKE ALL ON FUNCTION public.create_wip_excerpt(text,text,text,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_wip_excerpt(text,text,text,text,text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.update_wip_excerpt_page(uuid,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_wip_excerpt_page(uuid,integer,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_wip_excerpts(p_book_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(items)), '[]'::jsonb) FROM (
   SELECT id,token,title,author,word_count,created_at,revoked_at FROM public.wip_excerpts
   WHERE owner_id = auth.uid() AND book_id = p_book_id
   ORDER BY (revoked_at IS NULL) DESC, created_at DESC
 ) items;
$$;

CREATE OR REPLACE FUNCTION public.get_wip_excerpt(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('title',title,'author',author,'excerpt',excerpt,'word_count',word_count,'created_at',created_at)
 FROM public.wip_excerpts WHERE token = p_token AND revoked_at IS NULL AND p_token ~ '^[a-f0-9]{48}$' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.revoke_wip_excerpt(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.wip_excerpts SET revoked_at = coalesce(revoked_at,now()) WHERE id = p_id AND owner_id = auth.uid();
 RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.restore_wip_excerpt(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_revoked_at timestamptz;
BEGIN
  IF v_owner IS NULL THEN RETURN false; END IF;
  -- Use the same lock as link creation so both operations share the active cap.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  SELECT revoked_at INTO v_revoked_at FROM public.wip_excerpts
    WHERE id = p_id AND owner_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_revoked_at IS NULL THEN RETURN true; END IF;
  IF (SELECT count(*) FROM public.wip_excerpts WHERE owner_id = v_owner AND revoked_at IS NULL) >= 100 THEN
    RAISE EXCEPTION 'Disable another reading link before re-enabling this one';
  END IF;
  UPDATE public.wip_excerpts SET revoked_at = NULL WHERE id = p_id AND owner_id = v_owner;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.restore_wip_excerpt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_wip_excerpt(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_wip_excerpt(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_wip_excerpts(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_wip_excerpt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_wip_excerpt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_wip_excerpt(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_wip_excerpts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wip_excerpt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_wip_excerpt(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
