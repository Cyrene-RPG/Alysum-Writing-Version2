-- Run once in Supabase → SQL Editor (safe to re-run).
-- Publish cooldowns: 7-day account age before any publish, 30-day gap between new library listings.
-- Apply after supabase-library-rls.sql and supabase-library-reports.sql (uses is_moderation_staff).

-- ---------------------------------------------------------------------------
-- 1. Track last *new* library listing per author
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_new_book_published_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Staff-reviewed bypass tickets (30-day interval only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.publish_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id text NOT NULL,
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  staff_note text NOT NULL DEFAULT '' CHECK (char_length(staff_note) <= 2000),
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS publish_approval_requests_status_idx
  ON public.publish_approval_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS publish_approval_requests_user_idx
  ON public.publish_approval_requests (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS publish_approval_requests_pending_uidx
  ON public.publish_approval_requests (user_id, book_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_account_created_at(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.created_at FROM public.users u WHERE u.id = p_user_id),
    (SELECT au.created_at FROM auth.users au WHERE au.id = p_user_id),
    now()
  );
$$;

CREATE OR REPLACE FUNCTION public.publish_is_new_library_listing(p_book_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.library lib
    WHERE lib.id::text = p_book_id::text
  );
$$;

CREATE OR REPLACE FUNCTION public.publish_cooldown_allows(p_user_id uuid, p_book_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_created timestamptz;
  v_last_new_book timestamptz;
  v_has_bypass boolean;
BEGIN
  IF p_user_id IS NULL OR p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RETURN false;
  END IF;

  IF auth.uid() = p_user_id AND public.is_moderation_staff() THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.author_moderation_status ams
    WHERE ams.user_id = p_user_id
      AND (
        ams.publishing_revoked = true
        OR ams.account_suspended = true
        OR ams.account_terminated = true
        OR (ams.publishing_suspended_until IS NOT NULL AND ams.publishing_suspended_until > now())
      )
  ) THEN
    RETURN false;
  END IF;

  v_account_created := public.user_account_created_at(p_user_id);
  IF now() < v_account_created + interval '7 days' THEN
    RETURN false;
  END IF;

  IF NOT public.publish_is_new_library_listing(p_book_id) THEN
    RETURN true;
  END IF;

  SELECT u.last_new_book_published_at INTO v_last_new_book
  FROM public.users u
  WHERE u.id = p_user_id;

  IF v_last_new_book IS NULL OR now() >= v_last_new_book + interval '30 days' THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.publish_approval_requests par
    WHERE par.user_id = p_user_id
      AND par.book_id = p_book_id
      AND par.status = 'approved'
      AND par.consumed_at IS NULL
  ) INTO v_has_bypass;

  RETURN v_has_bypass;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_publish_eligibility(p_book_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account_created timestamptz;
  v_account_eligible_at timestamptz;
  v_last_new_book timestamptz;
  v_interval_eligible_at timestamptz;
  v_is_new_listing boolean;
  v_account_blocked boolean;
  v_interval_blocked boolean;
  v_pending_request record;
  v_approved_bypass boolean;
  v_allowed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RAISE EXCEPTION 'Missing book id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id::text = p_book_id::text
      AND b.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Book not found or not owned by you';
  END IF;

  v_is_new_listing := public.publish_is_new_library_listing(p_book_id);
  v_account_created := public.user_account_created_at(v_user_id);
  v_account_eligible_at := v_account_created + interval '7 days';
  v_account_blocked := now() < v_account_eligible_at;

  SELECT u.last_new_book_published_at INTO v_last_new_book
  FROM public.users u
  WHERE u.id = v_user_id;

  v_interval_eligible_at := COALESCE(v_last_new_book, v_account_created) + interval '30 days';
  v_interval_blocked := v_is_new_listing
    AND v_last_new_book IS NOT NULL
    AND now() < v_interval_eligible_at;

  SELECT EXISTS (
    SELECT 1
    FROM public.publish_approval_requests par
    WHERE par.user_id = v_user_id
      AND par.book_id = p_book_id
      AND par.status = 'approved'
      AND par.consumed_at IS NULL
  ) INTO v_approved_bypass;

  SELECT par.id, par.status, par.created_at, par.reviewed_at, par.staff_note
  INTO v_pending_request
  FROM public.publish_approval_requests par
  WHERE par.user_id = v_user_id
    AND par.book_id = p_book_id
    AND par.status = 'pending'
  ORDER BY par.created_at DESC
  LIMIT 1;

  v_allowed := public.publish_cooldown_allows(v_user_id, p_book_id);

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'isNewListing', v_is_new_listing,
    'accountCooldown', jsonb_build_object(
      'active', v_account_blocked,
      'eligibleAt', v_account_eligible_at,
      'daysRemaining', CASE
        WHEN v_account_blocked THEN ceil(extract(epoch FROM (v_account_eligible_at - now())) / 86400.0)
        ELSE 0
      END
    ),
    'bookIntervalCooldown', jsonb_build_object(
      'active', v_interval_blocked AND NOT v_approved_bypass,
      'eligibleAt', CASE WHEN v_last_new_book IS NULL THEN NULL ELSE v_interval_eligible_at END,
      'daysRemaining', CASE
        WHEN v_interval_blocked AND NOT v_approved_bypass
          THEN ceil(extract(epoch FROM (v_interval_eligible_at - now())) / 86400.0)
        ELSE 0
      END
    ),
    'approvedBypass', v_approved_bypass,
    'pendingRequest', CASE
      WHEN v_pending_request.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_pending_request.id,
        'status', v_pending_request.status,
        'createdAt', v_pending_request.created_at,
        'reviewedAt', v_pending_request.reviewed_at,
        'staffNote', v_pending_request.staff_note
      )
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_publish_approval_request(
  p_book_id text,
  p_message text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_message text := left(trim(coalesce(p_message, '')), 2000);
  v_last_new_book timestamptz;
  v_request_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RAISE EXCEPTION 'Missing book id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id::text = p_book_id::text
      AND b.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Book not found or not owned by you';
  END IF;

  IF NOT public.publish_is_new_library_listing(p_book_id) THEN
    RAISE EXCEPTION 'Approval tickets only apply to publishing a new book listing';
  END IF;

  IF now() < public.user_account_created_at(v_user_id) + interval '7 days' THEN
    RAISE EXCEPTION 'Your account must be at least 7 days old before requesting publish approval';
  END IF;

  SELECT u.last_new_book_published_at INTO v_last_new_book
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_last_new_book IS NULL OR now() >= v_last_new_book + interval '30 days' THEN
    RAISE EXCEPTION 'You are not in the 30-day new-book waiting period';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.publish_approval_requests par
    WHERE par.user_id = v_user_id
      AND par.book_id = p_book_id
      AND par.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending approval request for this book';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.publish_approval_requests par
    WHERE par.user_id = v_user_id
      AND par.book_id = p_book_id
      AND par.status = 'approved'
      AND par.consumed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'You already have an approved bypass for this book';
  END IF;

  INSERT INTO public.publish_approval_requests (user_id, book_id, message)
  VALUES (v_user_id, p_book_id, v_message)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_list_publish_approvals(
  p_status text DEFAULT 'pending'
)
RETURNS SETOF public.publish_approval_requests
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT par.*
  FROM public.publish_approval_requests par
  WHERE p_status IS NULL
     OR p_status = 'all'
     OR par.status = p_status
  ORDER BY par.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_review_publish_approval(
  p_request_id uuid,
  p_approve boolean,
  p_staff_note text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid := auth.uid();
  v_note text := left(trim(coalesce(p_staff_note, '')), 2000);
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.publish_approval_requests par
  SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
    reviewed_at = now(),
    reviewed_by = v_staff_id,
    staff_note = v_note
  WHERE par.id = p_request_id
    AND par.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already reviewed';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Track new listings + consume bypass tickets
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.library_track_new_book_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      last_new_book_published_at = now(),
      updated_at = now()
    WHERE id = NEW.user_id;

    UPDATE public.publish_approval_requests
    SET consumed_at = now()
    WHERE user_id = NEW.user_id
      AND book_id = NEW.id::text
      AND status = 'approved'
      AND consumed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS library_track_new_book_publish_trg ON public.library;
CREATE TRIGGER library_track_new_book_publish_trg
  AFTER INSERT ON public.library
  FOR EACH ROW
  EXECUTE FUNCTION public.library_track_new_book_publish();

-- ---------------------------------------------------------------------------
-- 5. Enforce cooldown on new library inserts (updates/republishes stay allowed)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "library_insert_owner" ON public.library;
CREATE POLICY "library_insert_owner" ON public.library
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid())::text = user_id::text
    AND EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id::text = library.id::text
        AND b.user_id::text = (auth.uid())::text
    )
    AND public.publish_cooldown_allows(auth.uid(), library.id::text)
  );

-- ---------------------------------------------------------------------------
-- 6. RLS for approval requests
-- ---------------------------------------------------------------------------

ALTER TABLE public.publish_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "publish_approval_select_own" ON public.publish_approval_requests;
CREATE POLICY "publish_approval_select_own" ON public.publish_approval_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_moderation_staff()
  );

DROP POLICY IF EXISTS "publish_approval_insert_own" ON public.publish_approval_requests;
CREATE POLICY "publish_approval_insert_own" ON public.publish_approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.publish_approval_requests TO authenticated;

REVOKE ALL ON FUNCTION public.user_account_created_at(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_is_new_library_listing(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_cooldown_allows(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_publish_eligibility(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_publish_approval_request(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_list_publish_approvals(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_review_publish_approval(uuid, boolean, text) TO authenticated;

-- Backfill last_new_book_published_at for existing authors
UPDATE public.users u
SET last_new_book_published_at = sub.max_published
FROM (
  SELECT
    lib.user_id,
    max(
      COALESCE(
        CASE
          WHEN coalesce(lib.data->>'publishedAt', '') ~ '^[0-9]+$'
            THEN to_timestamp((lib.data->>'publishedAt')::bigint / 1000.0)
          ELSE NULL
        END,
        lib.created_at
      )
    ) AS max_published
  FROM public.library lib
  WHERE lib.user_id IS NOT NULL
  GROUP BY lib.user_id
) sub
WHERE u.id = sub.user_id
  AND u.last_new_book_published_at IS NULL;
