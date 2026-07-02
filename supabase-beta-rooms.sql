-- Run once in Supabase → SQL Editor (safe to re-run).
-- Beta rooms: unpublished manuscript snapshots, invites, threaded feedback, audit log.
-- Test branch feature — apply before using beta-room-manage.html / beta-room.html.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.beta_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT 'Untitled',
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  chapter_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  word_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_snapshots_book_id_idx ON public.beta_snapshots (book_id);
CREATE INDEX IF NOT EXISTS beta_snapshots_author_id_idx ON public.beta_snapshots (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.manuscript_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.beta_snapshots (id) ON DELETE CASCADE,
  reader_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked', 'expired')),
  invite_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_email text NOT NULL DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '{"read":true,"comment":true}'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS manuscript_shares_book_id_idx ON public.manuscript_shares (book_id);
CREATE INDEX IF NOT EXISTS manuscript_shares_author_id_idx ON public.manuscript_shares (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS manuscript_shares_reader_id_idx ON public.manuscript_shares (reader_id)
  WHERE reader_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS manuscript_shares_one_active_reader_idx
  ON public.manuscript_shares (snapshot_id, reader_id)
  WHERE status = 'active' AND reader_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.beta_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.manuscript_shares (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  thread_type text NOT NULL DEFAULT 'general'
    CHECK (thread_type IN ('general', 'chapter', 'inline')),
  chapter_id text NOT NULL DEFAULT '',
  anchor_quote text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_threads_share_id_idx ON public.beta_threads (share_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS beta_threads_general_per_share_idx
  ON public.beta_threads (share_id)
  WHERE thread_type = 'general';

CREATE TABLE IF NOT EXISTS public.beta_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.beta_threads (id) ON DELETE CASCADE,
  share_id uuid NOT NULL REFERENCES public.manuscript_shares (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 8000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS beta_messages_thread_id_idx ON public.beta_messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS beta_messages_share_id_idx ON public.beta_messages (share_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.beta_audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id text NOT NULL,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_audit_log_created_idx ON public.beta_audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_beta_share_participant(p_share_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.manuscript_shares ms
    WHERE ms.id = p_share_id
      AND ms.status = 'active'
      AND (ms.expires_at IS NULL OR ms.expires_at > now())
      AND (
        ms.author_id = auth.uid()
        OR ms.reader_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.beta_snapshot_visible(p_snapshot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.beta_snapshots s
    WHERE s.id = p_snapshot_id
      AND (
        s.author_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.manuscript_shares ms
          WHERE ms.snapshot_id = s.id
            AND ms.status = 'active'
            AND (ms.expires_at IS NULL OR ms.expires_at > now())
            AND ms.reader_id = auth.uid()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RPCs (authors + readers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_beta_snapshot(
  p_book_id text,
  p_chapter_ids jsonb DEFAULT '[]'::jsonb,
  p_label text DEFAULT ''
)
RETURNS public.beta_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_book public.books%ROWTYPE;
  v_sections jsonb;
  v_body jsonb;
  v_filtered jsonb := '[]'::jsonb;
  v_ch jsonb;
  v_ids jsonb;
  v_words integer := 0;
  v_row public.beta_snapshots;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_book
  FROM public.books
  WHERE id::text = p_book_id
    AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'book_not_found';
  END IF;

  v_sections := COALESCE(v_book.sections, '{}'::jsonb);
  v_body := COALESCE(v_sections->'body', '[]'::jsonb);
  v_ids := COALESCE(p_chapter_ids, '[]'::jsonb);

  IF jsonb_array_length(v_ids) = 0 THEN
    v_filtered := v_body;
  ELSE
    FOR v_ch IN SELECT value FROM jsonb_array_elements(v_body)
    LOOP
      IF v_ids ? (v_ch->>'id') THEN
        v_filtered := v_filtered || jsonb_build_array(v_ch);
      END IF;
    END LOOP;
  END IF;

  IF jsonb_array_length(v_filtered) = 0 THEN
    RAISE EXCEPTION 'no_chapters_selected';
  END IF;

  FOR v_ch IN SELECT value FROM jsonb_array_elements(v_filtered)
  LOOP
    v_words := v_words + COALESCE((v_ch->>'words')::integer, 0);
  END LOOP;

  INSERT INTO public.beta_snapshots (
    book_id,
    author_id,
    label,
    title,
    sections,
    chapter_ids,
    word_count
  )
  VALUES (
    p_book_id,
    v_uid,
    COALESCE(NULLIF(trim(p_label), ''), ''),
    COALESCE(NULLIF(trim(v_book.title), ''), 'Untitled'),
    jsonb_set(v_sections, '{body}', v_filtered, true),
    CASE
      WHEN jsonb_array_length(v_ids) = 0 THEN (
        SELECT COALESCE(jsonb_agg(elem->>'id'), '[]'::jsonb)
        FROM jsonb_array_elements(v_filtered) AS elem
      )
      ELSE v_ids
    END,
    v_words
  )
  RETURNING * INTO v_row;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'beta_snapshots',
    v_row.id::text,
    v_uid,
    'create',
    jsonb_build_object('book_id', p_book_id, 'label', p_label)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manuscript_invite(
  p_book_id text,
  p_snapshot_id uuid,
  p_invited_email text DEFAULT ''
)
RETURNS public.manuscript_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_snapshot public.beta_snapshots%ROWTYPE;
  v_row public.manuscript_shares;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_snapshot
  FROM public.beta_snapshots
  WHERE id = p_snapshot_id
    AND book_id = p_book_id
    AND author_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot_not_found';
  END IF;

  INSERT INTO public.manuscript_shares (
    book_id,
    author_id,
    snapshot_id,
    invited_email,
    expires_at
  )
  VALUES (
    p_book_id,
    v_uid,
    p_snapshot_id,
    COALESCE(trim(p_invited_email), ''),
    now() + interval '365 days'
  )
  RETURNING * INTO v_row;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'manuscript_shares',
    v_row.id::text,
    v_uid,
    'invite_created',
    jsonb_build_object('book_id', p_book_id, 'snapshot_id', p_snapshot_id)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_manuscript_invite(p_token text)
RETURNS public.manuscript_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.manuscript_shares;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  SELECT * INTO v_row
  FROM public.manuscript_shares
  WHERE invite_token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_row.status = 'revoked' THEN
    RAISE EXCEPTION 'invite_revoked';
  END IF;

  -- Invite links keep working after acceptance (and for author preview).
  IF v_row.status = 'active' THEN
    IF v_row.author_id = v_uid OR v_row.reader_id = v_uid THEN
      IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
        RAISE EXCEPTION 'invite_expired';
      END IF;
      RETURN v_row;
    END IF;
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_row.status = 'expired' THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  -- Author can open a pending invite to preview the waiting room.
  IF v_row.author_id = v_uid THEN
    RETURN v_row;
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    UPDATE public.manuscript_shares SET status = 'expired' WHERE id = v_row.id;
    RAISE EXCEPTION 'invite_expired';
  END IF;

  UPDATE public.manuscript_shares
  SET
    reader_id = v_uid,
    status = 'active',
    accepted_at = now(),
    expires_at = NULL
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'manuscript_shares',
    v_row.id::text,
    v_uid,
    'invite_accepted',
    jsonb_build_object('book_id', v_row.book_id)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_manuscript_invite(p_share_id uuid)
RETURNS public.manuscript_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.manuscript_shares;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.manuscript_shares
  WHERE id = p_share_id
    AND author_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_not_found';
  END IF;

  IF v_row.status = 'revoked' THEN
    RAISE EXCEPTION 'invite_revoked';
  END IF;

  IF v_row.status = 'expired' THEN
    UPDATE public.manuscript_shares
    SET status = 'pending', expires_at = now() + interval '365 days', revoked_at = NULL
    WHERE id = p_share_id
    RETURNING * INTO v_row;
  ELSIF v_row.status = 'pending' THEN
    UPDATE public.manuscript_shares
    SET expires_at = now() + interval '365 days'
    WHERE id = p_share_id
    RETURNING * INTO v_row;
  ELSIF v_row.status = 'active' THEN
    UPDATE public.manuscript_shares
    SET expires_at = NULL
    WHERE id = p_share_id
    RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'share_not_found';
  END IF;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'manuscript_shares',
    v_row.id::text,
    v_uid,
    'invite_extended',
    jsonb_build_object('status', v_row.status, 'expires_at', v_row.expires_at)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_manuscript_share(p_share_id uuid)
RETURNS public.manuscript_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.manuscript_shares;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.manuscript_shares
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_share_id
    AND author_id = v_uid
    AND status IN ('pending', 'active')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_not_found';
  END IF;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'manuscript_shares',
    v_row.id::text,
    v_uid,
    'revoked',
    '{}'::jsonb
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.is_beta_share_participant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.beta_snapshot_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_beta_snapshot(text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manuscript_invite(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_manuscript_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.extend_manuscript_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_manuscript_share(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_beta_share_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_snapshot_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_beta_snapshot(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manuscript_invite(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_manuscript_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_manuscript_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_manuscript_share(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.beta_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manuscript_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_snapshots_select_visible" ON public.beta_snapshots;
CREATE POLICY "beta_snapshots_select_visible" ON public.beta_snapshots
  FOR SELECT TO authenticated
  USING (public.beta_snapshot_visible(id));

DROP POLICY IF EXISTS "beta_snapshots_insert_author" ON public.beta_snapshots;
CREATE POLICY "beta_snapshots_insert_author" ON public.beta_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "manuscript_shares_select_participant" ON public.manuscript_shares;
CREATE POLICY "manuscript_shares_select_participant" ON public.manuscript_shares
  FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR reader_id = auth.uid());

DROP POLICY IF EXISTS "beta_threads_select_participant" ON public.beta_threads;
CREATE POLICY "beta_threads_select_participant" ON public.beta_threads
  FOR SELECT TO authenticated
  USING (public.is_beta_share_participant(share_id));

DROP POLICY IF EXISTS "beta_messages_select_participant" ON public.beta_messages;
CREATE POLICY "beta_messages_select_participant" ON public.beta_messages
  FOR SELECT TO authenticated
  USING (public.is_beta_share_participant(share_id));

DROP POLICY IF EXISTS "beta_messages_insert_participant" ON public.beta_messages;
CREATE POLICY "beta_messages_insert_participant" ON public.beta_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_beta_share_participant(share_id)
  );

DROP POLICY IF EXISTS "beta_messages_soft_delete_moderator" ON public.beta_messages;
CREATE POLICY "beta_messages_soft_delete_moderator" ON public.beta_messages
  FOR UPDATE TO authenticated
  USING (
    public.is_beta_share_participant(share_id)
    AND deleted_at IS NULL
  )
  WITH CHECK (
    deleted_by = auth.uid()
    AND deleted_at IS NOT NULL
  );

GRANT SELECT ON public.beta_snapshots TO authenticated;
GRANT SELECT ON public.manuscript_shares TO authenticated;
GRANT SELECT ON public.beta_threads TO authenticated;
GRANT SELECT, UPDATE ON public.beta_messages TO authenticated;

-- Audit log: writers only (no client reads in v1)
-- No SELECT policy → authenticated cannot read audit rows.

-- ---------------------------------------------------------------------------
-- 5. Audit triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.beta_messages_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
    VALUES (
      'beta_messages',
      NEW.id::text,
      NEW.sender_id,
      'insert',
      jsonb_build_object('share_id', NEW.share_id, 'thread_id', NEW.thread_id, 'body_len', char_length(NEW.body))
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
    VALUES (
      'beta_messages',
      NEW.id::text,
      NEW.deleted_by,
      'soft_delete',
      jsonb_build_object('share_id', NEW.share_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS beta_messages_audit_trg ON public.beta_messages;
CREATE TRIGGER beta_messages_audit_trg
  AFTER INSERT OR UPDATE ON public.beta_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.beta_messages_audit_trigger();

-- ---------------------------------------------------------------------------
-- 5b. Per-reader DM threads (text-style beta feedback)
-- ---------------------------------------------------------------------------

ALTER TABLE public.beta_threads
  ADD COLUMN IF NOT EXISTS reader_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.beta_threads DROP CONSTRAINT IF EXISTS beta_threads_thread_type_check;
ALTER TABLE public.beta_threads ADD CONSTRAINT beta_threads_thread_type_check
  CHECK (thread_type IN ('general', 'chapter', 'inline', 'dm'));

DROP INDEX IF EXISTS beta_threads_general_per_share_idx;
CREATE UNIQUE INDEX IF NOT EXISTS beta_threads_dm_per_reader_share_idx
  ON public.beta_threads (share_id, reader_id)
  WHERE thread_type = 'dm' AND reader_id IS NOT NULL;

-- Migrate legacy single "general" threads into per-reader DMs where possible.
UPDATE public.beta_threads t
SET
  thread_type = 'dm',
  reader_id = ms.reader_id
FROM public.manuscript_shares ms
WHERE t.share_id = ms.id
  AND t.thread_type = 'general'
  AND ms.reader_id IS NOT NULL
  AND t.reader_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_or_create_beta_dm_thread(
  p_share_id uuid,
  p_reader_id uuid DEFAULT NULL
)
RETURNS public.beta_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_share public.manuscript_shares;
  v_reader uuid;
  v_thread public.beta_threads;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_share
  FROM public.manuscript_shares
  WHERE id = p_share_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_not_found';
  END IF;

  IF v_share.status <> 'active' THEN
    RAISE EXCEPTION 'share_not_active';
  END IF;

  IF v_share.expires_at IS NOT NULL AND v_share.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF v_share.author_id = v_uid THEN
    v_reader := p_reader_id;
    IF v_reader IS NULL THEN
      RAISE EXCEPTION 'reader_id_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.manuscript_shares ms
      WHERE ms.book_id = v_share.book_id
        AND ms.author_id = v_uid
        AND ms.reader_id = v_reader
        AND ms.status = 'active'
        AND (ms.expires_at IS NULL OR ms.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'reader_not_on_share';
    END IF;
  ELSIF v_share.reader_id = v_uid THEN
    v_reader := v_uid;
  ELSE
    RAISE EXCEPTION 'not_participant';
  END IF;

  SELECT * INTO v_thread
  FROM public.beta_threads
  WHERE share_id = p_share_id
    AND thread_type = 'dm'
    AND reader_id = v_reader;

  IF FOUND THEN
    RETURN v_thread;
  END IF;

  INSERT INTO public.beta_threads (share_id, book_id, author_id, thread_type, reader_id)
  VALUES (p_share_id, v_share.book_id, v_share.author_id, 'dm', v_reader)
  RETURNING * INTO v_thread;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'beta_threads',
    v_thread.id::text,
    v_uid,
    'dm_thread_created',
    jsonb_build_object('share_id', p_share_id, 'reader_id', v_reader)
  );

  RETURN v_thread;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_beta_dm_thread(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5c. Beta room safety — blocks, reports, 18+ attestation, guarded send
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  context text NOT NULL DEFAULT 'beta_room',
  share_id uuid REFERENCES public.manuscript_shares (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_id <> blocked_id),
  UNIQUE (blocker_id, blocked_id, context)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON public.user_blocks (blocker_id, context);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id, context);

CREATE TABLE IF NOT EXISTS public.beta_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.beta_messages (id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.beta_threads (id) ON DELETE SET NULL,
  share_id uuid REFERENCES public.manuscript_shares (id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) > 0),
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_message_reports_created_idx
  ON public.beta_message_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS public.beta_messaging_attestations (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  attested_at timestamptz NOT NULL DEFAULT now(),
  context text NOT NULL DEFAULT 'beta_room_18plus'
);

CREATE OR REPLACE FUNCTION public.beta_users_are_blocked(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_a IS NOT NULL
    AND p_user_b IS NOT NULL
    AND p_user_a <> p_user_b
    AND EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE ub.context = 'beta_room'
        AND (
          (ub.blocker_id = p_user_a AND ub.blocked_id = p_user_b)
          OR (ub.blocker_id = p_user_b AND ub.blocked_id = p_user_a)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.has_beta_messaging_attestation(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.beta_messaging_attestations a
    WHERE a.user_id = p_user_id
      AND a.context = 'beta_room_18plus'
  );
$$;

CREATE OR REPLACE FUNCTION public.attest_beta_messaging_18plus()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.beta_messaging_attestations (user_id, attested_at, context)
  VALUES (v_uid, now(), 'beta_room_18plus')
  ON CONFLICT (user_id) DO UPDATE
  SET attested_at = now(), context = 'beta_room_18plus';
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_beta_messaging_attestation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.beta_messaging_attestations
  WHERE user_id = auth.uid()
    AND context = 'beta_room_18plus';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_beta_user_blocked(p_other_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.beta_users_are_blocked(auth.uid(), p_other_id);
$$;

CREATE OR REPLACE FUNCTION public.block_beta_user(
  p_blocked_id uuid,
  p_share_id uuid DEFAULT NULL
)
RETURNS public.user_blocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_blocks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_blocked_id IS NULL OR p_blocked_id = v_uid THEN
    RAISE EXCEPTION 'invalid_block_target';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id, context, share_id)
  VALUES (v_uid, p_blocked_id, 'beta_room', p_share_id)
  ON CONFLICT (blocker_id, blocked_id, context) DO UPDATE
  SET share_id = COALESCE(EXCLUDED.share_id, public.user_blocks.share_id)
  RETURNING * INTO v_row;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'user_blocks',
    v_row.id::text,
    v_uid,
    'block_user',
    jsonb_build_object('blocked_id', p_blocked_id, 'share_id', p_share_id)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_beta_user(p_blocked_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM public.user_blocks
  WHERE blocker_id = v_uid
    AND blocked_id = p_blocked_id
    AND context = 'beta_room';
END;
$$;

CREATE OR REPLACE FUNCTION public.report_beta_user(
  p_reported_user_id uuid,
  p_reason text,
  p_details text DEFAULT '',
  p_message_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_share_id uuid DEFAULT NULL
)
RETURNS public.beta_message_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.beta_message_reports;
  v_reason text := left(trim(coalesce(p_reason, '')), 120);
  v_details text := left(trim(coalesce(p_details, '')), 2000);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_reported_user_id IS NULL OR p_reported_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid_report_target';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  INSERT INTO public.beta_message_reports (
    reporter_id,
    reported_user_id,
    message_id,
    thread_id,
    share_id,
    reason,
    details
  )
  VALUES (
    v_uid,
    p_reported_user_id,
    p_message_id,
    p_thread_id,
    p_share_id,
    v_reason,
    v_details
  )
  RETURNING * INTO v_row;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'beta_message_reports',
    v_row.id::text,
    v_uid,
    'report_user',
    jsonb_build_object(
      'reported_user_id', p_reported_user_id,
      'message_id', p_message_id,
      'thread_id', p_thread_id,
      'share_id', p_share_id,
      'reason', v_reason
    )
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_beta_message(
  p_thread_id uuid,
  p_share_id uuid,
  p_body text
)
RETURNS public.beta_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_thread public.beta_threads;
  v_share public.manuscript_shares;
  v_body text := trim(coalesce(p_body, ''));
  v_other uuid;
  v_recent_count integer;
  v_row public.beta_messages;
  v_sender_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 8000 THEN
    RAISE EXCEPTION 'invalid_message_body';
  END IF;

  IF v_body ~ '<[^>]+>' THEN
    RAISE EXCEPTION 'text_only_messages';
  END IF;

  IF NOT public.has_beta_messaging_attestation(v_uid) THEN
    RAISE EXCEPTION 'age_attestation_required';
  END IF;

  SELECT * INTO v_thread
  FROM public.beta_threads
  WHERE id = p_thread_id
    AND share_id = p_share_id
    AND thread_type = 'dm';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread_not_found';
  END IF;

  SELECT * INTO v_share
  FROM public.manuscript_shares
  WHERE id = p_share_id;

  IF NOT FOUND OR v_share.status <> 'active' THEN
    RAISE EXCEPTION 'share_not_active';
  END IF;

  IF NOT public.is_beta_share_participant(p_share_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF v_share.author_id = v_uid THEN
    v_other := v_thread.reader_id;
  ELSIF v_thread.reader_id = v_uid THEN
    v_other := v_share.author_id;
  ELSE
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF v_other IS NULL THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF public.beta_users_are_blocked(v_uid, v_other) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;

  SELECT count(*)::integer INTO v_recent_count
  FROM public.beta_messages
  WHERE sender_id = v_uid
    AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 60 THEN
    RAISE EXCEPTION 'rate_limit_exceeded';
  END IF;

  IF v_share.author_id = v_uid THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.beta_messages m
      WHERE m.thread_id = p_thread_id
        AND m.sender_id = v_thread.reader_id
        AND m.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'reader_must_message_first';
    END IF;
  END IF;

  INSERT INTO public.beta_messages (thread_id, share_id, sender_id, body)
  VALUES (p_thread_id, p_share_id, v_uid, v_body)
  RETURNING * INTO v_row;

  SELECT coalesce(nullif(trim(u.display_name), ''), nullif(trim(u.username), ''), 'Someone')
  INTO v_sender_name
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_other <> v_uid THEN
    INSERT INTO public.notifications (id, user_id, read, data)
    VALUES (
      'beta_room_msg_' || v_row.id::text,
      v_other,
      false,
      jsonb_build_object(
        'type', 'beta_room_message',
        'senderUid', v_uid::text,
        'senderName', coalesce(v_sender_name, 'Someone'),
        'shareId', p_share_id::text,
        'threadId', p_thread_id::text,
        'messageId', v_row.id::text,
        'bookTitle', coalesce((
          SELECT bs.title
          FROM public.beta_snapshots bs
          WHERE bs.id = v_share.snapshot_id
        ), 'Manuscript'),
        'preview', left(v_body, 240),
        'createdAt', (extract(epoch from now()) * 1000)::bigint
      )
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;

-- Authors can only open existing DM threads; readers create on first message.
CREATE OR REPLACE FUNCTION public.get_or_create_beta_dm_thread(
  p_share_id uuid,
  p_reader_id uuid DEFAULT NULL
)
RETURNS public.beta_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_share public.manuscript_shares;
  v_reader uuid;
  v_thread public.beta_threads;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_share
  FROM public.manuscript_shares
  WHERE id = p_share_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_not_found';
  END IF;

  IF v_share.status <> 'active' THEN
    RAISE EXCEPTION 'share_not_active';
  END IF;

  IF v_share.expires_at IS NOT NULL AND v_share.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF v_share.author_id = v_uid THEN
    v_reader := p_reader_id;
    IF v_reader IS NULL THEN
      RAISE EXCEPTION 'reader_id_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.manuscript_shares ms
      WHERE ms.book_id = v_share.book_id
        AND ms.author_id = v_uid
        AND ms.reader_id = v_reader
        AND ms.status = 'active'
        AND (ms.expires_at IS NULL OR ms.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'reader_not_on_share';
    END IF;

    IF public.beta_users_are_blocked(v_uid, v_reader) THEN
      RAISE EXCEPTION 'user_blocked';
    END IF;

    SELECT * INTO v_thread
    FROM public.beta_threads
    WHERE share_id = p_share_id
      AND thread_type = 'dm'
      AND reader_id = v_reader;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'thread_not_found';
    END IF;

    RETURN v_thread;
  ELSIF v_share.reader_id = v_uid THEN
    v_reader := v_uid;
  ELSE
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF public.beta_users_are_blocked(v_share.author_id, v_reader) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;

  SELECT * INTO v_thread
  FROM public.beta_threads
  WHERE share_id = p_share_id
    AND thread_type = 'dm'
    AND reader_id = v_reader;

  IF FOUND THEN
    RETURN v_thread;
  END IF;

  INSERT INTO public.beta_threads (share_id, book_id, author_id, thread_type, reader_id)
  VALUES (p_share_id, v_share.book_id, v_share.author_id, 'dm', v_reader)
  RETURNING * INTO v_thread;

  INSERT INTO public.beta_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (
    'beta_threads',
    v_thread.id::text,
    v_uid,
    'dm_thread_created',
    jsonb_build_object('share_id', p_share_id, 'reader_id', v_reader)
  );

  RETURN v_thread;
END;
$$;

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_messaging_attestations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_blocks_select_own" ON public.user_blocks;
CREATE POLICY "user_blocks_select_own" ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "user_blocks_insert_own" ON public.user_blocks;
CREATE POLICY "user_blocks_insert_own" ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "user_blocks_delete_own" ON public.user_blocks;
CREATE POLICY "user_blocks_delete_own" ON public.user_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "beta_message_reports_insert_own" ON public.beta_message_reports;
CREATE POLICY "beta_message_reports_insert_own" ON public.beta_message_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "beta_messaging_attestations_select_own" ON public.beta_messaging_attestations;
CREATE POLICY "beta_messaging_attestations_select_own" ON public.beta_messaging_attestations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "beta_messages_insert_participant" ON public.beta_messages;
-- Messages are inserted only through send_beta_message (SECURITY DEFINER).

GRANT SELECT ON public.user_blocks TO authenticated;
GRANT SELECT, DELETE ON public.user_blocks TO authenticated;
GRANT INSERT ON public.beta_message_reports TO authenticated;
GRANT SELECT ON public.beta_messaging_attestations TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_beta_messaging_attestation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attest_beta_messaging_18plus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_beta_messaging_attestation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_beta_user_blocked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_beta_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_beta_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_beta_user(uuid, text, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_beta_message(uuid, uuid, text) TO authenticated;

REVOKE INSERT ON public.beta_messages FROM authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notifications — ensure table exists, then beta room insert policy
-- (Copied from supabase-base-schema.sql + supabase-sibling-tables.sql so this
--  file can run standalone when notifications was never migrated.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON public.notifications (user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert_beta_share_reader" ON public.notifications;
CREATE POLICY "notifications_insert_beta_share_reader" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    data IS NOT NULL
    AND coalesce(data->>'readerUid', '') = (auth.uid())::text
  );

DROP POLICY IF EXISTS "notifications_update_beta_share_reader" ON public.notifications;
CREATE POLICY "notifications_update_beta_share_reader" ON public.notifications
  FOR UPDATE TO authenticated
  USING (coalesce(data->>'readerUid', '') = (auth.uid())::text)
  WITH CHECK (coalesce(data->>'readerUid', '') = (auth.uid())::text);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "notifications_insert_beta_room" ON public.notifications;
CREATE POLICY "notifications_insert_beta_room" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    data IS NOT NULL
    AND coalesce(data->>'type', '') IN ('beta_room_invite', 'beta_room_message')
    AND coalesce(data->>'senderUid', '') = (auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 7. Backfill — lengthen existing invites (safe to re-run)
-- ---------------------------------------------------------------------------

UPDATE public.manuscript_shares
SET expires_at = now() + interval '365 days'
WHERE status = 'pending'
  AND (expires_at IS NULL OR expires_at < now() + interval '300 days');

UPDATE public.manuscript_shares
SET expires_at = NULL
WHERE status = 'active';

-- Optional shelf sync on users (beta-rooms.html hub)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beta_room_shelf jsonb NOT NULL DEFAULT '{}'::jsonb;
