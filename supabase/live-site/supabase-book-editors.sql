-- Book editors (live edit access). Safe to re-run.
-- Owner invites by link; invited account becomes an Editor (no Viewer role).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.book_share_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invited_email text NOT NULL DEFAULT '',
  invite_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS book_share_invites_book_idx
  ON public.book_share_invites (book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS book_share_invites_owner_idx
  ON public.book_share_invites (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.book_editors (
  book_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invited_email text NOT NULL DEFAULT '',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, user_id)
);

CREATE INDEX IF NOT EXISTS book_editors_user_idx ON public.book_editors (user_id);

ALTER TABLE public.book_share_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_editors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_share_invites_owner" ON public.book_share_invites;
CREATE POLICY "book_share_invites_owner" ON public.book_share_invites
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "book_editors_select_member" ON public.book_editors;
CREATE POLICY "book_editors_select_member" ON public.book_editors
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_editors.book_id AND b.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_share_invites TO authenticated;
GRANT SELECT ON public.book_editors TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper: owner or live editor (SECURITY DEFINER to avoid RLS recursion)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_book_owner_or_editor(p_book_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = p_book_id AND b.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.book_editors e
      WHERE e.book_id = p_book_id AND e.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_book_owner_or_editor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_book_owner_or_editor(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- books RLS — extra editor policies (owner policies stay in library-rls)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "books_select_editor" ON public.books;
CREATE POLICY "books_select_editor" ON public.books
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.book_editors e
      WHERE e.book_id = books.id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "books_update_editor" ON public.books;
CREATE POLICY "books_update_editor" ON public.books
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.book_editors e
      WHERE e.book_id = books.id AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.book_editors e
      WHERE e.book_id = books.id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "books_select_own" ON public.books;
DROP POLICY IF EXISTS "books_update_own" ON public.books;

CREATE POLICY "books_select_own" ON public.books
  FOR SELECT TO authenticated
  USING ((auth.uid())::text = user_id::text);

CREATE POLICY "books_update_own" ON public.books
  FOR UPDATE TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

CREATE OR REPLACE FUNCTION public.books_keep_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot transfer this book';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_keep_owner ON public.books;
CREATE TRIGGER books_keep_owner
  BEFORE UPDATE ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.books_keep_owner();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_book_editor_invite(
  p_book_id text,
  p_email text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books b WHERE b.id = p_book_id AND b.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Only the owner can invite editors';
  END IF;

  INSERT INTO public.book_share_invites (book_id, owner_id, invited_email)
  VALUES (p_book_id, v_uid, lower(trim(coalesce(p_email, ''))))
  RETURNING invite_token INTO v_token;

  RETURN jsonb_build_object(
    'token', v_token,
    'path', '/book-invite.html?token=' || v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_book_editor_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite public.book_share_invites%ROWTYPE;
  v_email text := '';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite
  FROM public.book_share_invites
  WHERE invite_token = p_token AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or no longer active';
  END IF;

  IF v_invite.owner_id = v_uid THEN
    RAISE EXCEPTION 'You already own this book';
  END IF;

  SELECT coalesce(email, '') INTO v_email FROM public.users WHERE id = v_uid;

  INSERT INTO public.book_editors (book_id, user_id, invited_email)
  VALUES (v_invite.book_id, v_uid, coalesce(nullif(v_invite.invited_email, ''), v_email))
  ON CONFLICT (book_id, user_id) DO NOTHING;

  UPDATE public.book_share_invites
  SET status = 'accepted'
  WHERE id = v_invite.id AND status = 'active';

  RETURN jsonb_build_object('book_id', v_invite.book_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_book_collaborators(p_book_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_owner_row jsonb;
  v_editors jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_book_owner_or_editor(p_book_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT user_id INTO v_owner FROM public.books WHERE id = p_book_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  SELECT jsonb_build_object(
    'user_id', u.id,
    'display_name', coalesce(nullif(u.display_name, ''), u.username, 'Owner'),
    'email', coalesce(u.email, ''),
    'role', 'owner',
    'is_you', u.id = v_uid
  )
  INTO v_owner_row
  FROM public.users u
  WHERE u.id = v_owner;

  IF v_owner_row IS NULL THEN
    v_owner_row := jsonb_build_object(
      'user_id', v_owner,
      'display_name', 'Owner',
      'email', '',
      'role', 'owner',
      'is_you', v_owner = v_uid
    );
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.accepted_at), '[]'::jsonb)
  INTO v_editors
  FROM (
    SELECT
      e.user_id,
      coalesce(nullif(u.display_name, ''), u.username, 'Editor') AS display_name,
      coalesce(u.email, e.invited_email, '') AS email,
      'editor'::text AS role,
      (e.user_id = v_uid) AS is_you,
      e.accepted_at
    FROM public.book_editors e
    LEFT JOIN public.users u ON u.id = e.user_id
    WHERE e.book_id = p_book_id
  ) x;

  RETURN jsonb_build_object(
    'owner', v_owner_row,
    'editors', v_editors,
    'is_owner', v_owner = v_uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_book_editor(
  p_book_id text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books b WHERE b.id = p_book_id AND b.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Only the owner can remove editors';
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot remove the owner';
  END IF;

  DELETE FROM public.book_editors
  WHERE book_id = p_book_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_book_editor_invite(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_book_editor_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_book_collaborators(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_book_editor(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_book_editor_invite(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_book_editor_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_book_collaborators(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_book_editor(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: book-covers (create bucket in Dashboard if INSERT fails)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "book_covers_select_public" ON storage.objects;
CREATE POLICY "book_covers_select_public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'book-covers');

DROP POLICY IF EXISTS "book_covers_write_editor" ON storage.objects;
CREATE POLICY "book_covers_write_editor" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'book-covers'
    AND public.is_book_owner_or_editor((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "book_covers_update_editor" ON storage.objects;
CREATE POLICY "book_covers_update_editor" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND public.is_book_owner_or_editor((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "book_covers_delete_editor" ON storage.objects;
CREATE POLICY "book_covers_delete_editor" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND public.is_book_owner_or_editor((storage.foldername(name))[1])
  );
