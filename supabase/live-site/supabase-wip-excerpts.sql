-- Test-branch feature. Apply to the chosen Supabase test project before using reading links.
-- Stores only the selected plain-text snapshot; does not alter manuscript or Library permissions.
CREATE TABLE IF NOT EXISTS public.wip_excerpts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  author text NOT NULL DEFAULT '' CHECK (char_length(author) <= 80),
  excerpt text NOT NULL CHECK (char_length(excerpt) BETWEEN 1 AND 150000),
  word_count integer NOT NULL CHECK (word_count BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
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
  IF char_length(v_text) < 1 OR char_length(v_text) > 150000 THEN RAISE EXCEPTION 'Choose a section of up to 150,000 characters'; END IF;
  v_words := cardinality(regexp_split_to_array(v_text, '\s+'));
  IF v_words > 20000 THEN RAISE EXCEPTION 'Choose a section of up to 20,000 words'; END IF;
  IF char_length(coalesce(p_title,'')) > 160 OR char_length(coalesce(p_author,'')) > 80 THEN RAISE EXCEPTION 'Shorten the title or author name'; END IF;
  -- Serialize per-owner creation to enforce the active-link cap under concurrent requests.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  IF (SELECT count(*) FROM public.wip_excerpts WHERE owner_id = auth.uid() AND revoked_at IS NULL) >= 100 THEN RAISE EXCEPTION 'Disable an old reading link before creating another'; END IF;
  INSERT INTO public.wip_excerpts(book_id, owner_id, title, author, excerpt, word_count)
  VALUES(p_book_id, auth.uid(), coalesce(nullif(btrim(p_title),''),'Untitled section'), coalesce(btrim(p_author),''), v_text, v_words) RETURNING * INTO v_row;
  RETURN jsonb_build_object('id',v_row.id,'token',v_row.token,'title',v_row.title,'author',v_row.author,'word_count',v_row.word_count,'created_at',v_row.created_at,'revoked_at',v_row.revoked_at);
END; $$;

CREATE OR REPLACE FUNCTION public.list_wip_excerpts(p_book_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(items)), '[]'::jsonb) FROM (
   SELECT id,token,title,author,word_count,created_at,revoked_at FROM public.wip_excerpts
   WHERE owner_id = auth.uid() AND book_id = p_book_id
   ORDER BY (revoked_at IS NULL) DESC, created_at DESC LIMIT 100
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
REVOKE ALL ON FUNCTION public.create_wip_excerpt(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_wip_excerpts(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_wip_excerpt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_wip_excerpt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_wip_excerpt(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_wip_excerpts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wip_excerpt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_wip_excerpt(uuid) TO authenticated;
