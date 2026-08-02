-- Run once in Supabase → SQL Editor (safe to re-run).
-- Collab rooms: invite-only chapter editing with author-approved suggestions.
-- TEST BRANCH — apply before wiring collab-room.html to live data.
--
-- Model: collaborators edit live chapters; changes stored as pending suggestions
-- until the author accepts (merged into canon) or rejects.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.collab_chapter_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  chapter_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  invite_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_email text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collab_chapter_invites_book_idx
  ON public.collab_chapter_invites (book_id, chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS collab_chapter_invites_author_idx
  ON public.collab_chapter_invites (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.collab_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.collab_chapter_invites (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  chapter_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (invite_id, collaborator_id)
);

CREATE INDEX IF NOT EXISTS collab_memberships_collaborator_idx
  ON public.collab_memberships (collaborator_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS collab_memberships_chapter_idx
  ON public.collab_memberships (book_id, chapter_id, status);

CREATE TABLE IF NOT EXISTS public.collab_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.collab_memberships (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  chapter_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  base_content_hash text NOT NULL DEFAULT '',
  paragraph_index integer NOT NULL DEFAULT 0,
  change_type text NOT NULL DEFAULT 'replace'
    CHECK (change_type IN ('replace', 'insert', 'delete')),
  old_text text NOT NULL DEFAULT '',
  new_text text NOT NULL DEFAULT '',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS collab_suggestions_chapter_pending_idx
  ON public.collab_suggestions (book_id, chapter_id, status, submitted_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS collab_suggestions_author_idx
  ON public.collab_suggestions (author_id, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.collab_audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id text NOT NULL,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collab_audit_log_created_idx
  ON public.collab_audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_collab_chapter_author(p_book_id text, p_chapter_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.books b
    WHERE b.id::text = p_book_id
      AND b.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_collab_chapter_member(p_book_id text, p_chapter_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.collab_memberships m
    WHERE m.book_id = p_book_id
      AND m.chapter_id = p_chapter_id
      AND m.collaborator_id = auth.uid()
      AND m.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS (sketch — tighten before production)
-- ---------------------------------------------------------------------------

ALTER TABLE public.collab_chapter_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collab_invites_author_all" ON public.collab_chapter_invites;
CREATE POLICY "collab_invites_author_all" ON public.collab_chapter_invites
  FOR ALL
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "collab_memberships_select" ON public.collab_memberships;
CREATE POLICY "collab_memberships_select" ON public.collab_memberships
  FOR SELECT
  USING (collaborator_id = auth.uid() OR author_id = auth.uid());

DROP POLICY IF EXISTS "collab_suggestions_select" ON public.collab_suggestions;
CREATE POLICY "collab_suggestions_select" ON public.collab_suggestions
  FOR SELECT
  USING (collaborator_id = auth.uid() OR author_id = auth.uid());

DROP POLICY IF EXISTS "collab_suggestions_collaborator_insert" ON public.collab_suggestions;
CREATE POLICY "collab_suggestions_collaborator_insert" ON public.collab_suggestions
  FOR INSERT
  WITH CHECK (
    collaborator_id = auth.uid()
    AND public.is_collab_chapter_member(book_id, chapter_id)
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "collab_suggestions_author_update" ON public.collab_suggestions;
CREATE POLICY "collab_suggestions_author_update" ON public.collab_suggestions
  FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. RPC stubs (implement merge logic in a follow-up migration)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_collab_chapter_invite(
  p_book_id text,
  p_chapter_id text,
  p_invited_email text DEFAULT '',
  p_label text DEFAULT ''
)
RETURNS public.collab_chapter_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.collab_chapter_invites;
BEGIN
  IF NOT public.is_collab_chapter_author(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'not_author';
  END IF;

  INSERT INTO public.collab_chapter_invites (
    book_id, chapter_id, author_id, invited_email, label, expires_at
  )
  VALUES (
    p_book_id, p_chapter_id, auth.uid(), coalesce(p_invited_email, ''), coalesce(p_label, ''),
    now() + interval '1 year'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_collab_chapter_invite(p_token text)
RETURNS public.collab_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.collab_chapter_invites;
  v_row public.collab_memberships;
BEGIN
  SELECT * INTO v_invite
  FROM public.collab_chapter_invites
  WHERE invite_token = p_token
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  INSERT INTO public.collab_memberships (
    invite_id, book_id, chapter_id, author_id, collaborator_id
  )
  VALUES (
    v_invite.id, v_invite.book_id, v_invite.chapter_id, v_invite.author_id, auth.uid()
  )
  ON CONFLICT (invite_id, collaborator_id) DO UPDATE
    SET status = 'active', revoked_at = NULL
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- accept_collab_suggestion / reject_collab_suggestion RPCs:
-- merge into books.sections JSON on accept; log to collab_audit_log.
-- Wire from collab-rooms-api.js when moving off demo mode.

GRANT EXECUTE ON FUNCTION public.create_collab_chapter_invite(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_collab_chapter_invite(text) TO authenticated;
