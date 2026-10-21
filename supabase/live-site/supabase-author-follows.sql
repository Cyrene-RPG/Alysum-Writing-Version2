-- Run once in Supabase → SQL Editor (safe to re-run).
-- Does not drag-and-drop: copy this whole file, paste, Run.
-- Author follow list for the reader end card. Does not change publish or library RLS.

CREATE TABLE IF NOT EXISTS public.author_follows (
  follower_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, author_id),
  CHECK (follower_id <> author_id)
);

CREATE INDEX IF NOT EXISTS author_follows_author_idx ON public.author_follows (author_id);

ALTER TABLE public.author_follows ENABLE ROW LEVEL SECURITY;

-- Private relationship rows; public counts never return follower identities.
DROP POLICY IF EXISTS author_follows_select_public ON public.author_follows;
DROP POLICY IF EXISTS author_follows_read_own_relationships ON public.author_follows;
CREATE POLICY author_follows_read_own_relationships ON public.author_follows
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) IN (follower_id,author_id));
REVOKE SELECT ON public.author_follows FROM PUBLIC,anon;
GRANT SELECT ON public.author_follows TO authenticated;
CREATE OR REPLACE FUNCTION public.get_author_follower_count(p_author_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*) FROM public.author_follows WHERE author_id=p_author_id;
$$;
REVOKE ALL ON FUNCTION public.get_author_follower_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_author_follower_count(uuid) TO anon,authenticated;


DROP POLICY IF EXISTS "author_follows_insert_own" ON public.author_follows;
CREATE POLICY "author_follows_insert_own" ON public.author_follows
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "author_follows_delete_own" ON public.author_follows;
CREATE POLICY "author_follows_delete_own" ON public.author_follows
  FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

GRANT SELECT ON public.author_follows TO authenticated;
GRANT INSERT, DELETE ON public.author_follows TO authenticated;
