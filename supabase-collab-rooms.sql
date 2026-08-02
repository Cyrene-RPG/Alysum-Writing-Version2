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

CREATE TABLE IF NOT EXISTS public.collab_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  chapter_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  commenter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.collab_comments (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  paragraph_index integer NOT NULL DEFAULT 0,
  quote text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS collab_comments_chapter_idx
  ON public.collab_comments (book_id, chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.collab_live_drafts (
  book_id text NOT NULL,
  chapter_id text NOT NULL,
  html text NOT NULL DEFAULT '',
  base_content_hash text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  PRIMARY KEY (book_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS collab_live_drafts_updated_idx
  ON public.collab_live_drafts (updated_at DESC);

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
ALTER TABLE public.collab_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_live_drafts ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "collab_comments_select" ON public.collab_comments;
CREATE POLICY "collab_comments_select" ON public.collab_comments
  FOR SELECT
  USING (
    commenter_id = auth.uid()
    OR author_id = auth.uid()
    OR public.is_collab_chapter_member(book_id, chapter_id)
  );

DROP POLICY IF EXISTS "collab_comments_insert" ON public.collab_comments;
CREATE POLICY "collab_comments_insert" ON public.collab_comments
  FOR INSERT
  WITH CHECK (
    commenter_id = auth.uid()
    AND (
      public.is_collab_chapter_member(book_id, chapter_id)
      OR public.is_collab_chapter_author(book_id, chapter_id)
    )
  );

DROP POLICY IF EXISTS "collab_comments_update" ON public.collab_comments;
CREATE POLICY "collab_comments_update" ON public.collab_comments
  FOR UPDATE
  USING (author_id = auth.uid() OR commenter_id = auth.uid())
  WITH CHECK (author_id = auth.uid() OR commenter_id = auth.uid());

DROP POLICY IF EXISTS "collab_live_drafts_select" ON public.collab_live_drafts;
CREATE POLICY "collab_live_drafts_select" ON public.collab_live_drafts
  FOR SELECT
  USING (public.can_access_collab_chapter(book_id, chapter_id));

DROP POLICY IF EXISTS "collab_live_drafts_write" ON public.collab_live_drafts;
CREATE POLICY "collab_live_drafts_write" ON public.collab_live_drafts
  FOR ALL
  USING (public.can_access_collab_chapter(book_id, chapter_id))
  WITH CHECK (public.can_access_collab_chapter(book_id, chapter_id));

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

CREATE OR REPLACE FUNCTION public.can_access_collab_chapter(p_book_id text, p_chapter_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_collab_chapter_author(p_book_id, p_chapter_id)
      OR public.is_collab_chapter_member(p_book_id, p_chapter_id);
$$;

CREATE OR REPLACE FUNCTION public.get_collab_chapter(p_book_id text, p_chapter_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book public.books%ROWTYPE;
  v_ch jsonb;
  v_content text;
  v_draft public.collab_live_drafts%ROWTYPE;
BEGIN
  IF NOT public.can_access_collab_chapter(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT * INTO v_book
  FROM public.books b
  WHERE b.id::text = p_book_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'book_not_found';
  END IF;

  SELECT elem INTO v_ch
  FROM jsonb_array_elements(coalesce(v_book.sections, '{}'::jsonb)->'body') elem
  WHERE elem->>'id' = p_chapter_id
  LIMIT 1;

  IF v_ch IS NULL THEN
    RAISE EXCEPTION 'chapter_not_found';
  END IF;

  v_content := coalesce(v_ch->>'content', '');

  SELECT * INTO v_draft
  FROM public.collab_live_drafts d
  WHERE d.book_id = p_book_id
    AND d.chapter_id = p_chapter_id;

  RETURN jsonb_build_object(
    'book_id', p_book_id,
    'book_title', coalesce(v_book.title, 'Untitled'),
    'chapter_id', p_chapter_id,
    'chapter_title', coalesce(v_ch->>'title', 'Untitled chapter'),
    'content', v_content,
    'content_hash', md5(v_content),
    'is_author', public.is_collab_chapter_author(p_book_id, p_chapter_id),
    'live_html', coalesce(v_draft.html, v_content),
    'live_base_hash', coalesce(v_draft.base_content_hash, md5(v_content)),
    'live_updated_at', v_draft.updated_at,
    'live_updated_by', v_draft.updated_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_collab_invites_for_book(p_book_id text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.books b WHERE b.id::text = p_book_id AND b.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_author';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', i.id,
    'book_id', i.book_id,
    'chapter_id', i.chapter_id,
    'invite_token', i.invite_token,
    'invited_email', i.invited_email,
    'label', i.label,
    'status', i.status,
    'expires_at', i.expires_at,
    'created_at', i.created_at,
    'member_count', (
      SELECT count(*)::int
      FROM public.collab_memberships m
      WHERE m.invite_id = i.id AND m.status = 'active'
    ),
    'pending_suggestions', (
      SELECT count(*)::int
      FROM public.collab_suggestions s
      WHERE s.book_id = i.book_id
        AND s.chapter_id = i.chapter_id
        AND s.status = 'pending'
    )
  )
  FROM public.collab_chapter_invites i
  WHERE i.book_id = p_book_id
    AND i.author_id = auth.uid()
  ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_collab_chapter_invite(p_invite_id uuid)
RETURNS public.collab_chapter_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.collab_chapter_invites;
BEGIN
  UPDATE public.collab_chapter_invites
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_invite_id
    AND author_id = auth.uid()
    AND status = 'active'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  UPDATE public.collab_memberships
  SET status = 'revoked', revoked_at = now()
  WHERE invite_id = p_invite_id AND status = 'active';

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_collab_suggestions(p_book_id text, p_chapter_id text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_collab_chapter(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', s.id,
    'membership_id', s.membership_id,
    'book_id', s.book_id,
    'chapter_id', s.chapter_id,
    'author_id', s.author_id,
    'collaborator_id', s.collaborator_id,
    'status', s.status,
    'base_content_hash', s.base_content_hash,
    'paragraph_index', s.paragraph_index,
    'change_type', s.change_type,
    'old_text', s.old_text,
    'new_text', s.new_text,
    'submitted_at', s.submitted_at,
    'reviewed_at', s.reviewed_at,
    'collaborator_username', coalesce(u.username, ''),
    'collaborator_display_name', coalesce(u.display_name, '')
  )
  FROM public.collab_suggestions s
  LEFT JOIN public.users u ON u.id = s.collaborator_id
  WHERE s.book_id = p_book_id
    AND s.chapter_id = p_chapter_id
  ORDER BY s.submitted_at ASC, s.paragraph_index ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_collab_suggestions(
  p_book_id text,
  p_chapter_id text,
  p_base_content_hash text,
  p_suggestions jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.collab_memberships%ROWTYPE;
  v_ch jsonb;
  v_item jsonb;
  v_count integer := 0;
BEGIN
  IF NOT public.is_collab_chapter_member(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  SELECT * INTO v_membership
  FROM public.collab_memberships m
  WHERE m.book_id = p_book_id
    AND m.chapter_id = p_chapter_id
    AND m.collaborator_id = auth.uid()
    AND m.status = 'active'
  ORDER BY m.accepted_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  v_ch := public.get_collab_chapter(p_book_id, p_chapter_id);
  IF coalesce(v_ch->>'content_hash', '') <> coalesce(p_base_content_hash, '') THEN
    RAISE EXCEPTION 'stale_base_hash';
  END IF;

  IF jsonb_typeof(p_suggestions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_suggestions';
  END IF;

  -- Replace this collaborator's pending batch for this chapter snapshot (one submit = one review pass).
  DELETE FROM public.collab_suggestions
  WHERE book_id = p_book_id
    AND chapter_id = p_chapter_id
    AND collaborator_id = auth.uid()
    AND status = 'pending'
    AND base_content_hash = coalesce(p_base_content_hash, '');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_suggestions)
  LOOP
    IF coalesce(v_item->>'new_text', '') = coalesce(v_item->>'old_text', '') THEN
      CONTINUE;
    END IF;

    INSERT INTO public.collab_suggestions (
      membership_id, book_id, chapter_id, author_id, collaborator_id,
      base_content_hash, paragraph_index, change_type, old_text, new_text
    )
    VALUES (
      v_membership.id,
      p_book_id,
      p_chapter_id,
      v_membership.author_id,
      auth.uid(),
      coalesce(p_base_content_hash, ''),
      coalesce((v_item->>'paragraph_index')::int, 0),
      coalesce(nullif(v_item->>'change_type', ''), 'replace'),
      coalesce(v_item->>'old_text', ''),
      coalesce(v_item->>'new_text', '')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_collab_suggestion(
  p_suggestion_id uuid,
  p_action text
)
RETURNS public.collab_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.collab_suggestions%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_body jsonb;
  v_new_body jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_content text;
  v_found boolean := false;
BEGIN
  SELECT * INTO v_s
  FROM public.collab_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion_not_found';
  END IF;

  IF v_s.author_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_author';
  END IF;

  IF v_s.status <> 'pending' THEN
    RAISE EXCEPTION 'already_reviewed';
  END IF;

  IF p_action = 'accept' THEN
    SELECT * INTO v_book
    FROM public.books b
    WHERE b.id::text = v_s.book_id
      AND b.user_id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'book_not_found';
    END IF;

    v_body := coalesce(v_book.sections, '{}'::jsonb)->'body';
    IF jsonb_typeof(v_body) <> 'array' THEN
      v_body := '[]'::jsonb;
    END IF;

    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_body)
    LOOP
      IF v_elem->>'id' = v_s.chapter_id THEN
        v_found := true;
        v_content := coalesce(v_elem->>'content', '');
        IF v_s.change_type = 'insert' AND coalesce(v_s.old_text, '') = '' THEN
          v_content := v_content || v_s.new_text;
        ELSIF coalesce(v_s.old_text, '') <> '' AND position(v_s.old_text in v_content) > 0 THEN
          v_content := replace(v_content, v_s.old_text, coalesce(v_s.new_text, ''));
        ELSIF coalesce(v_s.old_text, '') <> '' AND v_s.new_text <> '' THEN
          v_content := replace(
            v_content,
            '<p>' || replace(replace(v_s.old_text, '<', '&lt;'), '>', '&gt;') || '</p>',
            v_s.new_text
          );
        END IF;
        v_elem := jsonb_set(v_elem, '{content}', to_jsonb(v_content), true);
      END IF;
      v_new_body := v_new_body || jsonb_build_array(v_elem);
    END LOOP;

    IF v_found THEN
      UPDATE public.books
      SET sections = jsonb_set(coalesce(sections, '{}'::jsonb), '{body}', v_new_body, true),
          updated = (extract(epoch from now()) * 1000)::bigint
      WHERE id::text = v_s.book_id
        AND user_id = auth.uid();

      INSERT INTO public.collab_live_drafts (
        book_id, chapter_id, html, base_content_hash, updated_at, updated_by
      )
      VALUES (
        v_s.book_id, v_s.chapter_id, v_content, md5(v_content), now(), auth.uid()
      )
      ON CONFLICT (book_id, chapter_id) DO UPDATE
      SET html = EXCLUDED.html,
          base_content_hash = EXCLUDED.base_content_hash,
          updated_at = now(),
          updated_by = auth.uid();
    END IF;

    UPDATE public.collab_suggestions
    SET status = 'accepted', reviewed_at = now(), reviewed_by = auth.uid()
    WHERE id = p_suggestion_id
    RETURNING * INTO v_s;
  ELSIF p_action = 'reject' THEN
    UPDATE public.collab_suggestions
    SET status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
    WHERE id = p_suggestion_id
    RETURNING * INTO v_s;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;

  INSERT INTO public.collab_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'collab_suggestions',
    p_suggestion_id::text,
    auth.uid(),
    p_action,
    jsonb_build_object('book_id', v_s.book_id, 'chapter_id', v_s.chapter_id)
  );

  RETURN v_s;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_collab_memberships()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', m.id,
    'book_id', m.book_id,
    'chapter_id', m.chapter_id,
    'author_id', m.author_id,
    'status', m.status,
    'accepted_at', m.accepted_at,
    'book_title', coalesce(b.title, 'Untitled'),
    'chapter_title', coalesce(ch.elem->>'title', 'Chapter'),
    'pending_suggestions', (
      SELECT count(*)::int
      FROM public.collab_suggestions s
      WHERE s.book_id = m.book_id
        AND s.chapter_id = m.chapter_id
        AND s.collaborator_id = m.collaborator_id
        AND s.status = 'pending'
    )
  )
  FROM public.collab_memberships m
  JOIN public.books b ON b.id::text = m.book_id
  LEFT JOIN LATERAL (
    SELECT elem
    FROM jsonb_array_elements(coalesce(b.sections, '{}'::jsonb)->'body') elem
    WHERE elem->>'id' = m.chapter_id
    LIMIT 1
  ) ch ON true
  WHERE m.collaborator_id = auth.uid()
    AND m.status = 'active'
  ORDER BY m.accepted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_collab_comments(p_book_id text, p_chapter_id text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_collab_chapter(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'book_id', c.book_id,
    'chapter_id', c.chapter_id,
    'author_id', c.author_id,
    'commenter_id', c.commenter_id,
    'parent_id', c.parent_id,
    'status', c.status,
    'paragraph_index', c.paragraph_index,
    'quote', c.quote,
    'body', c.body,
    'created_at', c.created_at,
    'resolved_at', c.resolved_at,
    'commenter_username', coalesce(u.username, ''),
    'commenter_display_name', coalesce(u.display_name, '')
  )
  FROM public.collab_comments c
  LEFT JOIN public.users u ON u.id = c.commenter_id
  WHERE c.book_id = p_book_id
    AND c.chapter_id = p_chapter_id
  ORDER BY c.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_collab_comment(
  p_book_id text,
  p_chapter_id text,
  p_paragraph_index integer,
  p_quote text,
  p_body text,
  p_parent_id uuid DEFAULT NULL
)
RETURNS public.collab_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
  v_row public.collab_comments;
BEGIN
  SELECT b.user_id INTO v_author
  FROM public.books b
  WHERE b.id::text = p_book_id;

  IF v_author IS NULL THEN
    RAISE EXCEPTION 'book_not_found';
  END IF;

  IF NOT public.can_access_collab_chapter(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  IF coalesce(trim(p_body), '') = '' THEN
    RAISE EXCEPTION 'empty_body';
  END IF;

  INSERT INTO public.collab_comments (
    book_id, chapter_id, author_id, commenter_id, parent_id,
    paragraph_index, quote, body
  )
  VALUES (
    p_book_id, p_chapter_id, v_author, auth.uid(), p_parent_id,
    coalesce(p_paragraph_index, 0), coalesce(p_quote, ''), trim(p_body)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_collab_comment(p_comment_id uuid, p_action text)
RETURNS public.collab_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.collab_comments;
BEGIN
  SELECT * INTO v_row FROM public.collab_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (
    v_row.author_id = auth.uid()
    OR v_row.commenter_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF p_action = 'resolve' THEN
    UPDATE public.collab_comments
    SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_comment_id
    RETURNING * INTO v_row;
  ELSIF p_action = 'reopen' THEN
    UPDATE public.collab_comments
    SET status = 'open', resolved_at = NULL, resolved_by = NULL
    WHERE id = p_comment_id
    RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_collab_live_draft(
  p_book_id text,
  p_chapter_id text,
  p_html text,
  p_base_content_hash text
)
RETURNS public.collab_live_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.collab_live_drafts;
BEGIN
  IF NOT public.can_access_collab_chapter(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  INSERT INTO public.collab_live_drafts (
    book_id, chapter_id, html, base_content_hash, updated_at, updated_by
  )
  VALUES (
    p_book_id,
    p_chapter_id,
    coalesce(p_html, ''),
    coalesce(p_base_content_hash, ''),
    now(),
    auth.uid()
  )
  ON CONFLICT (book_id, chapter_id) DO UPDATE
  SET html = EXCLUDED.html,
      base_content_hash = EXCLUDED.base_content_hash,
      updated_at = now(),
      updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_collab_chapter_suggestions(
  p_book_id text,
  p_chapter_id text,
  p_base_content_hash text,
  p_suggestions jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.collab_memberships%ROWTYPE;
  v_ch jsonb;
  v_item jsonb;
  v_count integer := 0;
BEGIN
  IF NOT public.can_access_collab_chapter(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  v_ch := public.get_collab_chapter(p_book_id, p_chapter_id);
  IF coalesce(v_ch->>'content_hash', '') <> coalesce(p_base_content_hash, '') THEN
    RAISE EXCEPTION 'stale_base_hash';
  END IF;

  SELECT * INTO v_membership
  FROM public.collab_memberships m
  WHERE m.book_id = p_book_id
    AND m.chapter_id = p_chapter_id
    AND m.collaborator_id = auth.uid()
    AND m.status = 'active'
  ORDER BY m.accepted_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF public.is_collab_chapter_author(p_book_id, p_chapter_id) THEN
      SELECT * INTO v_membership
      FROM public.collab_memberships m
      WHERE m.book_id = p_book_id
        AND m.chapter_id = p_chapter_id
        AND m.status = 'active'
      ORDER BY m.accepted_at DESC
      LIMIT 1;
      IF NOT FOUND THEN
        RETURN 0;
      END IF;
    ELSE
      RAISE EXCEPTION 'not_member';
    END IF;
  END IF;

  IF jsonb_typeof(p_suggestions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_suggestions';
  END IF;

  DELETE FROM public.collab_suggestions
  WHERE book_id = p_book_id
    AND chapter_id = p_chapter_id
    AND status = 'pending'
    AND base_content_hash = coalesce(p_base_content_hash, '');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_suggestions)
  LOOP
    IF coalesce(v_item->>'new_text', '') = coalesce(v_item->>'old_text', '') THEN
      CONTINUE;
    END IF;

    INSERT INTO public.collab_suggestions (
      membership_id, book_id, chapter_id, author_id, collaborator_id,
      base_content_hash, paragraph_index, change_type, old_text, new_text
    )
    VALUES (
      v_membership.id,
      p_book_id,
      p_chapter_id,
      v_membership.author_id,
      auth.uid(),
      coalesce(p_base_content_hash, ''),
      coalesce((v_item->>'paragraph_index')::int, 0),
      coalesce(nullif(v_item->>'change_type', ''), 'replace'),
      coalesce(v_item->>'old_text', ''),
      coalesce(v_item->>'new_text', '')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_collab_chapter_invite(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_collab_chapter_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_collab_chapter(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_collab_invites_for_book(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_collab_chapter_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_collab_suggestions(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_collab_suggestions(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_collab_suggestion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_collab_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_collab_comments(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_collab_comment(text, text, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_collab_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_collab_live_draft(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_collab_chapter_suggestions(text, text, text, jsonb) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.collab_chapter_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.collab_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.collab_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.collab_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.collab_live_drafts TO authenticated;

ALTER TABLE public.collab_suggestions REPLICA IDENTITY FULL;
ALTER TABLE public.collab_comments REPLICA IDENTITY FULL;
ALTER TABLE public.collab_live_drafts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_suggestions;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_comments;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_live_drafts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Collaborators can load the book in editor.html (read-only via app; RLS blocks UPDATE).
DROP POLICY IF EXISTS "books_select_collab_member" ON public.books;
CREATE POLICY "books_select_collab_member" ON public.books
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.collab_memberships m
      WHERE m.book_id = books.id::text
        AND m.collaborator_id = auth.uid()
        AND m.status = 'active'
    )
  );

