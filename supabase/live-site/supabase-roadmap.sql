-- Waypoint roadmap / bugs / suggestions.
-- Run on the LIVE project. Safe to re-run.
-- Do not run remake SQL against this project.

CREATE SEQUENCE IF NOT EXISTS public.roadmap_stub_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_roadmap_stub()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.roadmap_stub_seq')::integer;
$$;

GRANT EXECUTE ON FUNCTION public.next_roadmap_stub() TO authenticated;

-- ---------------------------------------------------------------------------
-- Reports (bugs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roadmap_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stub integer NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'normal'
    CHECK (severity IN ('minor', 'normal', 'major')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'ack', 'fixed')),
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_username text NOT NULL DEFAULT '',
  folder_name text NOT NULL DEFAULT '',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roadmap_reports_created_idx
  ON public.roadmap_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS roadmap_reports_author_idx
  ON public.roadmap_reports (author_id);

ALTER TABLE public.roadmap_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_reports_select" ON public.roadmap_reports;
CREATE POLICY "roadmap_reports_select" ON public.roadmap_reports
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "roadmap_reports_insert_own" ON public.roadmap_reports;
CREATE POLICY "roadmap_reports_insert_own" ON public.roadmap_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- Suggestions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roadmap_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stub integer NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'under-review'
    CHECK (status IN ('under-review', 'promoted')),
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_username text NOT NULL DEFAULT '',
  folder_name text NOT NULL DEFAULT '',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roadmap_suggestions_created_idx
  ON public.roadmap_suggestions (created_at DESC);
CREATE INDEX IF NOT EXISTS roadmap_suggestions_author_idx
  ON public.roadmap_suggestions (author_id);

ALTER TABLE public.roadmap_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_suggestions_select" ON public.roadmap_suggestions;
CREATE POLICY "roadmap_suggestions_select" ON public.roadmap_suggestions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "roadmap_suggestions_insert_own" ON public.roadmap_suggestions;
CREATE POLICY "roadmap_suggestions_insert_own" ON public.roadmap_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- Votes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roadmap_votes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('bug', 'suggestion')),
  target_stub integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_kind, target_stub)
);

ALTER TABLE public.roadmap_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_votes_select" ON public.roadmap_votes;
CREATE POLICY "roadmap_votes_select" ON public.roadmap_votes
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "roadmap_votes_insert_own" ON public.roadmap_votes;
CREATE POLICY "roadmap_votes_insert_own" ON public.roadmap_votes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "roadmap_votes_delete_own" ON public.roadmap_votes;
CREATE POLICY "roadmap_votes_delete_own" ON public.roadmap_votes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Replies on bugs and suggestions (shared stub sequence)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roadmap_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_stub integer NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_username text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roadmap_replies_bug_idx
  ON public.roadmap_replies (bug_stub, created_at);

ALTER TABLE public.roadmap_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_replies_select" ON public.roadmap_replies;
CREATE POLICY "roadmap_replies_select" ON public.roadmap_replies
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "roadmap_replies_insert_own" ON public.roadmap_replies;
CREATE POLICY "roadmap_replies_insert_own" ON public.roadmap_replies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- Quotas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.roadmap_report_quota()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_reset timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'limit', 3, 'reset_at', now());
  END IF;

  SELECT count(*)::integer
    INTO v_used
  FROM public.roadmap_reports
  WHERE author_id = auth.uid()
    AND created_at > now() - interval '1 hour';

  SELECT min(created_at) + interval '1 hour'
    INTO v_reset
  FROM public.roadmap_reports
  WHERE author_id = auth.uid()
    AND created_at > now() - interval '1 hour';

  RETURN jsonb_build_object(
    'used', v_used,
    'limit', 3,
    'reset_at', coalesce(v_reset, now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.roadmap_suggestion_quota()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_reset timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'used', 0,
      'limit', 1,
      'reset_at', date_trunc('day', timezone('utc', now())) + interval '1 day'
    );
  END IF;

  SELECT count(*)::integer
    INTO v_used
  FROM public.roadmap_suggestions
  WHERE author_id = auth.uid()
    AND created_at >= date_trunc('day', timezone('utc', now()));

  v_reset := date_trunc('day', timezone('utc', now())) + interval '1 day';

  RETURN jsonb_build_object('used', v_used, 'limit', 1, 'reset_at', v_reset);
END;
$$;

GRANT EXECUTE ON FUNCTION public.roadmap_report_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.roadmap_suggestion_quota() TO authenticated;

-- ---------------------------------------------------------------------------
-- Staging attachments (25MB each)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('roadmap-attachments', 'roadmap-attachments', true, 26214400)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 26214400;

DROP POLICY IF EXISTS "roadmap_attachments_public_read" ON storage.objects;
CREATE POLICY "roadmap_attachments_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'roadmap-attachments');

DROP POLICY IF EXISTS "roadmap_attachments_insert_own" ON storage.objects;
CREATE POLICY "roadmap_attachments_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "roadmap_attachments_update_own" ON storage.objects;
CREATE POLICY "roadmap_attachments_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "roadmap_attachments_delete_own" ON storage.objects;
CREATE POLICY "roadmap_attachments_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'roadmap-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
