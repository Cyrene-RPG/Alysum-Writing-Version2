-- Replaced by supabase-publish-cooldown-off.sql (no account wait).
-- Keep this file only as history. Do not run it against live until cooldowns return.

CREATE OR REPLACE FUNCTION public.publish_cooldown_allows(p_user_id uuid, p_book_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_created timestamptz;
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

  IF public.publish_has_approved_bypass(p_user_id, p_book_id) THEN
    RETURN true;
  END IF;

  v_account_created := public.user_account_created_at(p_user_id);
  IF now() < v_account_created + interval '3 hours' THEN
    RETURN false;
  END IF;

  RETURN true;
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
  v_is_new_listing boolean;
  v_account_blocked boolean;
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
  v_account_eligible_at := v_account_created + interval '3 hours';
  v_approved_bypass := public.publish_has_approved_bypass(v_user_id, p_book_id);
  v_account_blocked := now() < v_account_eligible_at AND NOT v_approved_bypass;

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
      'hoursRemaining', CASE
        WHEN v_account_blocked THEN ceil(extract(epoch FROM (v_account_eligible_at - now())) / 3600.0)
        ELSE 0
      END
    ),
    'bookIntervalCooldown', jsonb_build_object(
      'active', false,
      'eligibleAt', NULL,
      'daysRemaining', 0
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

  IF public.publish_has_approved_bypass(v_user_id, p_book_id) THEN
    RAISE EXCEPTION 'You already have an approved bypass for this book';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.publish_approval_requests par
    WHERE par.user_id = v_user_id
      AND par.book_id = p_book_id
      AND par.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending approval request for this book';
  END IF;

  IF now() >= public.user_account_created_at(v_user_id) + interval '3 hours' THEN
    RAISE EXCEPTION 'You are not currently in a publish cooldown';
  END IF;

  INSERT INTO public.publish_approval_requests (user_id, book_id, message)
  VALUES (v_user_id, p_book_id, v_message)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;
