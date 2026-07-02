-- Run once in Supabase → SQL Editor (safe to re-run).
-- Library reporting & moderation: weighted reports, strike system, appeals, staff queue.
-- Apply after supabase-library-rls.sql.
--
-- Policy summary:
--   • Logged-in users submit reports; staff manually review (no auto-strikes).
--   • Weighted score = reporter_weight × infraction_severity; threshold auto-hides book.
--   • "child_rated_adult_content" is critical priority and triggers immediate auto-hide.
--   • 3-strike system with 6-month rolling expiration per strike.
--   • Severe violations bypass strike progression.
--   • False/malicious reports can earn reporter strikes.
--   • Appeals assigned to a moderator who did not make the original decision.

-- ---------------------------------------------------------------------------
-- 1. Configuration constants (stored as a singleton row)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_hide_threshold numeric NOT NULL DEFAULT 15,
  strike_expiry_months integer NOT NULL DEFAULT 6,
  default_reporter_weight numeric NOT NULL DEFAULT 1.0,
  trusted_reporter_weight numeric NOT NULL DEFAULT 2.5,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.moderation_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Staff roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'moderator'
    CHECK (role IN ('support', 'moderator', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS moderation_staff_role_idx ON public.moderation_staff (role);

-- ---------------------------------------------------------------------------
-- 3. Reporter trust scores
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reporter_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 10),
  false_report_count integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- 4. Per-book moderation state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.library_book_moderation (
  book_id text PRIMARY KEY,
  author_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'hidden', 'removed')),
  hidden_reason text NOT NULL DEFAULT '',
  auto_hidden boolean NOT NULL DEFAULT false,
  weighted_score numeric NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS library_book_moderation_author_idx
  ON public.library_book_moderation (author_id);
CREATE INDEX IF NOT EXISTS library_book_moderation_visibility_idx
  ON public.library_book_moderation (visibility)
  WHERE visibility <> 'public';

-- ---------------------------------------------------------------------------
-- 5. Author account moderation status
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_moderation_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  publishing_suspended_until timestamptz,
  publishing_revoked boolean NOT NULL DEFAULT false,
  account_suspended boolean NOT NULL DEFAULT false,
  account_terminated boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- 6. Library reports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.library_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  author_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN (
    'age_rating',
    'content_warnings',
    'metadata_errors',
    'genre',
    'policy_violation',
    'child_rated_adult_content'
  )),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 4000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN (
    'lowest', 'low', 'normal', 'high', 'critical'
  )),
  infraction_score integer NOT NULL DEFAULT 3 CHECK (infraction_score BETWEEN 1 AND 5),
  reporter_weight numeric NOT NULL DEFAULT 1.0,
  weighted_points numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'reviewing', 'no_violation', 'violation_confirmed', 'dismissed'
  )),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_notes text NOT NULL DEFAULT '',
  is_false_report boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_reports_book_id_idx
  ON public.library_reports (book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS library_reports_status_priority_idx
  ON public.library_reports (status, priority DESC, created_at ASC)
  WHERE status IN ('pending', 'reviewing');
CREATE INDEX IF NOT EXISTS library_reports_reporter_idx
  ON public.library_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS library_reports_author_idx
  ON public.library_reports (author_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS library_reports_one_open_per_reporter_book_idx
  ON public.library_reports (reporter_id, book_id)
  WHERE status IN ('pending', 'reviewing');

-- ---------------------------------------------------------------------------
-- 7. Confirmed violations (staff action after manual review)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.library_reports (id) ON DELETE SET NULL,
  book_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  policy_violated text NOT NULL,
  correction_requirements text NOT NULL DEFAULT '',
  deadline timestamptz NOT NULL,
  strike_number integer NOT NULL DEFAULT 1 CHECK (strike_number BETWEEN 1 AND 3),
  is_severe boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'corrected', 'deadline_missed', 'appealed', 'overturned', 'closed'
  )),
  notified_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_violations_author_idx
  ON public.moderation_violations (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_violations_deadline_idx
  ON public.moderation_violations (deadline)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 8. Strikes (6-month rolling expiration)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  strike_type text NOT NULL DEFAULT 'content'
    CHECK (strike_type IN ('content', 'false_report', 'severe')),
  strike_number integer NOT NULL CHECK (strike_number BETWEEN 1 AND 3),
  violation_id uuid REFERENCES public.moderation_violations (id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.library_reports (id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  is_severe boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_strikes_user_active_idx
  ON public.moderation_strikes (user_id, expires_at DESC);

-- ---------------------------------------------------------------------------
-- 9. Appeals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id uuid NOT NULL REFERENCES public.moderation_violations (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  original_moderator_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_moderator_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  appeal_text text NOT NULL CHECK (char_length(appeal_text) BETWEEN 10 AND 8000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'reviewing', 'upheld', 'overturned', 'partial'
  )),
  resolution_notes text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_appeals_status_idx
  ON public.moderation_appeals (status, created_at ASC)
  WHERE status IN ('pending', 'reviewing');

-- ---------------------------------------------------------------------------
-- 10. Audit log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id text NOT NULL,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_audit_log_created_idx
  ON public.moderation_audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- 11. Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_moderation_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moderation_staff ms
    WHERE ms.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.moderation_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ms.role
  FROM public.moderation_staff ms
  WHERE ms.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.moderation_reason_meta(p_reason text)
RETURNS TABLE (priority text, infraction_score integer, label text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT v.priority, v.infraction_score, v.label
  FROM (
    VALUES
      ('age_rating',                'normal',   3, 'Age / content rating'),
      ('content_warnings',          'normal',   3, 'Missing content warnings'),
      ('metadata_errors',           'low',      2, 'Metadata errors'),
      ('genre',                     'low',      2, 'Inappropriate genre'),
      ('policy_violation',          'high',     4, 'Policy violation'),
      ('child_rated_adult_content', 'critical', 5, 'Rated for children but has adult content')
  ) AS v(reason, priority, infraction_score, label)
  WHERE v.reason = p_reason;
$$;

CREATE OR REPLACE FUNCTION public.moderation_reporter_weight(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rs.weight FROM public.reporter_scores rs WHERE rs.user_id = p_user_id),
    (SELECT mc.default_reporter_weight FROM public.moderation_config mc WHERE mc.id = 1),
    1.0
  );
$$;

CREATE OR REPLACE FUNCTION public.moderation_active_strike_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.moderation_strikes s
  WHERE s.user_id = p_user_id
    AND s.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.moderation_log(
  p_table_name text,
  p_row_id text,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.moderation_audit_log (table_name, row_id, actor_id, action, payload)
  VALUES (p_table_name, p_row_id, auth.uid(), p_action, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_library_author_id(p_book_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    lib.user_id,
    (lib.data->>'ownerUid')::uuid,
    (lib.data->>'user_id')::uuid
  )
  FROM public.library lib
  WHERE lib.id::text = p_book_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.moderation_book_snapshot(p_book_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'bookId', lib.id,
    'title', COALESCE(lib.data->>'title', 'Untitled'),
    'author', COALESCE(lib.data->>'author', 'unknown'),
    'ownerUid', COALESCE(lib.data->>'ownerUid', lib.user_id::text, ''),
    'rating', COALESCE(lib.data->>'rating', ''),
    'type', COALESCE(lib.data->>'type', 'fiction'),
    'genres', COALESCE(lib.data->'genres', '[]'::jsonb),
    'warnings', COALESCE(lib.data->'warnings', '{}'::jsonb),
    'summary', COALESCE(lib.data->>'summary', ''),
    'capturedAt', now()
  )
  FROM public.library lib
  WHERE lib.id::text = p_book_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.moderation_recalc_book_score(p_book_id text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
  v_count integer;
  v_author uuid;
BEGIN
  SELECT
    COALESCE(SUM(r.weighted_points), 0),
    COUNT(*)::integer
  INTO v_score, v_count
  FROM public.library_reports r
  WHERE r.book_id = p_book_id
    AND r.status IN ('pending', 'reviewing', 'violation_confirmed');

  v_author := public.moderation_library_author_id(p_book_id);

  INSERT INTO public.library_book_moderation (book_id, author_id, weighted_score, report_count, updated_at)
  VALUES (p_book_id, v_author, v_score, v_count, now())
  ON CONFLICT (book_id) DO UPDATE
  SET weighted_score = EXCLUDED.weighted_score,
      report_count = EXCLUDED.report_count,
      author_id = COALESCE(EXCLUDED.author_id, public.library_book_moderation.author_id),
      updated_at = now();

  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_maybe_auto_hide_book(p_book_id text, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold numeric;
  v_score numeric;
  v_author uuid;
  v_did_hide boolean := false;
BEGIN
  SELECT mc.auto_hide_threshold INTO v_threshold
  FROM public.moderation_config mc WHERE mc.id = 1;

  v_score := public.moderation_recalc_book_score(p_book_id);
  v_author := public.moderation_library_author_id(p_book_id);

  IF p_reason = 'child_rated_adult_content' OR v_score >= COALESCE(v_threshold, 15) THEN
    INSERT INTO public.library_book_moderation (
      book_id, author_id, visibility, hidden_reason, auto_hidden, weighted_score, updated_at, updated_by
    )
    VALUES (
      p_book_id,
      v_author,
      'hidden',
      CASE
        WHEN p_reason = 'child_rated_adult_content'
          THEN 'Auto-hidden: rated for children but reported as containing adult content.'
        ELSE 'Auto-hidden: weighted report score exceeded threshold.'
      END,
      true,
      v_score,
      now(),
      NULL
    )
    ON CONFLICT (book_id) DO UPDATE
    SET visibility = 'hidden',
        hidden_reason = EXCLUDED.hidden_reason,
        auto_hidden = true,
        weighted_score = v_score,
        updated_at = now();

    UPDATE public.library
    SET data = jsonb_set(
      COALESCE(data, '{}'::jsonb),
      '{moderationHidden}',
      'true'::jsonb,
      true
    )
    WHERE id::text = p_book_id;

    PERFORM public.moderation_log(
      'library_book_moderation',
      p_book_id,
      'auto_hide',
      jsonb_build_object('score', v_score, 'threshold', v_threshold, 'reason', p_reason)
    );

    v_did_hide := true;
  END IF;

  RETURN v_did_hide;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_notify_author(
  p_author_id uuid,
  p_type text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
BEGIN
  IF p_author_id IS NULL THEN
    RETURN;
  END IF;

  v_id := 'mod_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.notifications (id, user_id, read, data, created_at)
  VALUES (
    v_id,
    p_author_id,
    false,
    jsonb_build_object('type', p_type, 'createdAt', now()) || COALESCE(p_payload, '{}'::jsonb),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Submit report (authenticated readers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_library_report(
  p_book_id text,
  p_reason text,
  p_details text DEFAULT ''
)
RETURNS public.library_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lib record;
  v_meta record;
  v_weight numeric;
  v_points numeric;
  v_report public.library_reports;
  v_details text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to report a book.';
  END IF;

  IF p_book_id IS NULL OR length(trim(p_book_id)) = 0 THEN
    RAISE EXCEPTION 'Book id is required.';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN (
    'age_rating', 'content_warnings', 'metadata_errors', 'genre',
    'policy_violation', 'child_rated_adult_content'
  ) THEN
    RAISE EXCEPTION 'Invalid report reason.';
  END IF;

  v_details := left(trim(COALESCE(p_details, '')), 4000);

  SELECT * INTO v_lib
  FROM public.library lib
  WHERE lib.id::text = p_book_id
    AND COALESCE((lib.data->>'isPublished')::boolean, true) = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book not found or is not published.';
  END IF;

  IF public.moderation_library_author_id(p_book_id) = v_uid THEN
    RAISE EXCEPTION 'You cannot report your own book.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.library_reports r
    WHERE r.reporter_id = v_uid
      AND r.book_id = p_book_id
      AND r.status IN ('pending', 'reviewing')
  ) THEN
    RAISE EXCEPTION 'You already have an open report for this book.';
  END IF;

  SELECT m.priority, m.infraction_score INTO v_meta
  FROM public.moderation_reason_meta(p_reason) m;

  v_weight := public.moderation_reporter_weight(v_uid);
  v_points := v_weight * v_meta.infraction_score;

  INSERT INTO public.library_reports (
    book_id,
    author_id,
    reporter_id,
    reason,
    details,
    priority,
    infraction_score,
    reporter_weight,
    weighted_points,
    snapshot
  )
  VALUES (
    p_book_id,
    public.moderation_library_author_id(p_book_id),
    v_uid,
    p_reason,
    v_details,
    v_meta.priority,
    v_meta.infraction_score,
    v_weight,
    v_points,
    public.moderation_book_snapshot(p_book_id)
  )
  RETURNING * INTO v_report;

  PERFORM public.moderation_maybe_auto_hide_book(p_book_id, p_reason);

  PERFORM public.moderation_log(
    'library_reports',
    v_report.id::text,
    'submitted',
    jsonb_build_object(
      'book_id', p_book_id,
      'reason', p_reason,
      'weighted_points', v_points,
      'priority', v_meta.priority
    )
  );

  RETURN v_report;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Staff: list pending reports (priority queue)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_list_reports(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.library_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.library_reports r
  WHERE (p_status IS NULL OR r.status = p_status)
  ORDER BY
    CASE r.priority
      WHEN 'critical' THEN 5
      WHEN 'high' THEN 4
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 2
      ELSE 1
    END DESC,
    r.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Staff: review report (no violation / dismiss / mark false)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_review_report(
  p_report_id uuid,
  p_outcome text,
  p_notes text DEFAULT '',
  p_mark_false_report boolean DEFAULT false
)
RETURNS public.library_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.library_reports;
  v_strike_num integer;
  v_expiry_months integer;
  v_notes text;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  IF p_outcome NOT IN ('no_violation', 'dismissed') THEN
    RAISE EXCEPTION 'Use moderation_confirm_violation for violation outcomes.';
  END IF;

  v_notes := left(trim(COALESCE(p_notes, '')), 4000);

  UPDATE public.library_reports r
  SET status = p_outcome,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      resolution_notes = v_notes,
      is_false_report = COALESCE(p_mark_false_report, false),
      updated_at = now()
  WHERE r.id = p_report_id
    AND r.status IN ('pending', 'reviewing')
  RETURNING * INTO v_report;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already resolved.';
  END IF;

  IF p_mark_false_report THEN
    UPDATE public.reporter_scores
    SET false_report_count = false_report_count + 1,
        weight = GREATEST(0.25, weight - 0.25),
        updated_at = now(),
        updated_by = auth.uid()
    WHERE user_id = v_report.reporter_id;

    IF NOT FOUND THEN
      INSERT INTO public.reporter_scores (user_id, false_report_count, weight, updated_by)
      VALUES (v_report.reporter_id, 1, 0.75, auth.uid());
    END IF;

    SELECT mc.strike_expiry_months INTO v_expiry_months
    FROM public.moderation_config mc WHERE mc.id = 1;

    v_strike_num := public.moderation_active_strike_count(v_report.reporter_id) + 1;

    IF v_strike_num <= 3 THEN
      INSERT INTO public.moderation_strikes (
        user_id, strike_type, strike_number, report_id, reason, expires_at, created_by
      )
      VALUES (
        v_report.reporter_id,
        'false_report',
        LEAST(v_strike_num, 3),
        v_report.id,
        'Knowingly false or malicious library report.',
        now() + (COALESCE(v_expiry_months, 6) || ' months')::interval,
        auth.uid()
      );
    END IF;
  END IF;

  PERFORM public.moderation_recalc_book_score(v_report.book_id);

  PERFORM public.moderation_log(
    'library_reports',
    v_report.id::text,
    'reviewed_' || p_outcome,
    jsonb_build_object('notes', v_notes, 'false_report', p_mark_false_report)
  );

  RETURN v_report;
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. Staff: confirm violation → strike + author notification
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_confirm_violation(
  p_report_id uuid,
  p_policy_violated text,
  p_correction_requirements text,
  p_deadline_days integer DEFAULT 7,
  p_is_severe boolean DEFAULT false
)
RETURNS public.moderation_violations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.library_reports;
  v_violation public.moderation_violations;
  v_strikes integer;
  v_strike_num integer;
  v_expiry_months integer;
  v_deadline timestamptz;
  v_policy text;
  v_corrections text;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  v_policy := left(trim(COALESCE(p_policy_violated, '')), 2000);
  v_corrections := left(trim(COALESCE(p_correction_requirements, '')), 4000);

  IF length(v_policy) = 0 THEN
    RAISE EXCEPTION 'Policy violated description is required.';
  END IF;

  UPDATE public.library_reports r
  SET status = 'violation_confirmed',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE r.id = p_report_id
    AND r.status IN ('pending', 'reviewing')
  RETURNING * INTO v_report;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already resolved.';
  END IF;

  v_strikes := public.moderation_active_strike_count(v_report.author_id);
  v_strike_num := LEAST(v_strikes + 1, 3);

  v_deadline := now() + (GREATEST(1, LEAST(COALESCE(p_deadline_days, 7), 90)) || ' days')::interval;

  INSERT INTO public.moderation_violations (
    report_id, book_id, author_id,
    policy_violated, correction_requirements, deadline,
    strike_number, is_severe, created_by, notified_at
  )
  VALUES (
    v_report.id,
    v_report.book_id,
    v_report.author_id,
    v_policy,
    v_corrections,
    v_deadline,
    CASE WHEN COALESCE(p_is_severe, false) THEN 3 ELSE v_strike_num END,
    COALESCE(p_is_severe, false),
    auth.uid(),
    now()
  )
  RETURNING * INTO v_violation;

  SELECT mc.strike_expiry_months INTO v_expiry_months
  FROM public.moderation_config mc WHERE mc.id = 1;

  INSERT INTO public.moderation_strikes (
    user_id, strike_type, strike_number, violation_id, report_id,
    reason, is_severe, expires_at, created_by
  )
  VALUES (
    v_report.author_id,
    CASE WHEN COALESCE(p_is_severe, false) THEN 'severe' ELSE 'content' END,
    CASE WHEN COALESCE(p_is_severe, false) THEN 3 ELSE v_strike_num END,
    v_violation.id,
    v_report.id,
    v_policy,
    COALESCE(p_is_severe, false),
    now() + (COALESCE(v_expiry_months, 6) || ' months')::interval,
    auth.uid()
  );

  -- Apply strike-tier consequences
  IF COALESCE(p_is_severe, false) THEN
    INSERT INTO public.author_moderation_status (user_id, account_suspended, updated_by)
    VALUES (v_report.author_id, true, auth.uid())
    ON CONFLICT (user_id) DO UPDATE
    SET account_suspended = true, updated_at = now(), updated_by = auth.uid();

    PERFORM public.moderation_set_book_visibility(v_report.book_id, 'removed', 'Severe policy violation.');
  ELSIF v_strike_num = 1 THEN
    -- First strike: written warning only; book may already be auto-hidden
    NULL;
  ELSIF v_strike_num = 2 THEN
    INSERT INTO public.author_moderation_status (user_id, publishing_suspended_until, updated_by)
    VALUES (v_report.author_id, now() + interval '14 days', auth.uid())
    ON CONFLICT (user_id) DO UPDATE
    SET publishing_suspended_until = GREATEST(
          COALESCE(public.author_moderation_status.publishing_suspended_until, now()),
          now() + interval '14 days'
        ),
        updated_at = now(),
        updated_by = auth.uid();
  ELSIF v_strike_num >= 3 THEN
    INSERT INTO public.author_moderation_status (user_id, publishing_revoked, updated_by)
    VALUES (v_report.author_id, true, auth.uid())
    ON CONFLICT (user_id) DO UPDATE
    SET publishing_revoked = true, updated_at = now(), updated_by = auth.uid();

    PERFORM public.moderation_set_book_visibility(v_report.book_id, 'removed', 'Third strike: publishing privileges revoked pending full review.');
  END IF;

  PERFORM public.moderation_notify_author(
    v_report.author_id,
    'library_violation',
    jsonb_build_object(
      'reportId', v_report.id,
      'violationId', v_violation.id,
      'bookId', v_report.book_id,
      'bookTitle', COALESCE(v_report.snapshot->>'title', 'Your book'),
      'policyViolated', v_policy,
      'correctionRequirements', v_corrections,
      'deadline', v_deadline,
      'strikeNumber', v_strike_num,
      'isSevere', COALESCE(p_is_severe, false),
      'preview', left(v_policy, 120)
    )
  );

  PERFORM public.moderation_log(
    'moderation_violations',
    v_violation.id::text,
    'confirmed',
    jsonb_build_object('report_id', p_report_id, 'strike', v_strike_num, 'severe', p_is_severe)
  );

  RETURN v_violation;
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. Staff: set book visibility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_set_book_visibility(
  p_book_id text,
  p_visibility text,
  p_reason text DEFAULT ''
)
RETURNS public.library_book_moderation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.library_book_moderation;
  v_author uuid;
  v_reason text;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  IF p_visibility NOT IN ('public', 'hidden', 'removed') THEN
    RAISE EXCEPTION 'Invalid visibility.';
  END IF;

  v_reason := left(trim(COALESCE(p_reason, '')), 2000);
  v_author := public.moderation_library_author_id(p_book_id);

  INSERT INTO public.library_book_moderation (
    book_id, author_id, visibility, hidden_reason, auto_hidden, updated_by
  )
  VALUES (p_book_id, v_author, p_visibility, v_reason, false, auth.uid())
  ON CONFLICT (book_id) DO UPDATE
  SET visibility = EXCLUDED.visibility,
      hidden_reason = EXCLUDED.hidden_reason,
      auto_hidden = false,
      updated_at = now(),
      updated_by = auth.uid()
  RETURNING * INTO v_row;

  IF p_visibility = 'public' THEN
    UPDATE public.library
    SET data = COALESCE(data, '{}'::jsonb) - 'moderationHidden'
    WHERE id::text = p_book_id;
  ELSE
    UPDATE public.library
    SET data = jsonb_set(
      COALESCE(data, '{}'::jsonb),
      '{moderationHidden}',
      'true'::jsonb,
      true
    )
    WHERE id::text = p_book_id;

    IF p_visibility = 'removed' THEN
      UPDATE public.library
      SET data = jsonb_set(
        COALESCE(data, '{}'::jsonb),
        '{isPublished}',
        'false'::jsonb,
        true
      )
      WHERE id::text = p_book_id;
    END IF;
  END IF;

  PERFORM public.moderation_log(
    'library_book_moderation',
    p_book_id,
    'visibility_' || p_visibility,
    jsonb_build_object('reason', v_reason)
  );

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- 17. Author: submit appeal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_submit_appeal(
  p_violation_id uuid,
  p_appeal_text text
)
RETURNS public.moderation_appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_violation public.moderation_violations;
  v_appeal public.moderation_appeals;
  v_text text;
  v_moderator uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  v_text := trim(COALESCE(p_appeal_text, ''));
  IF length(v_text) < 10 THEN
    RAISE EXCEPTION 'Appeal must be at least 10 characters.';
  END IF;

  SELECT * INTO v_violation
  FROM public.moderation_violations v
  WHERE v.id = p_violation_id
    AND v.author_id = auth.uid()
    AND v.status IN ('open', 'deadline_missed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Violation not found or not appealable.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.moderation_appeals a
    WHERE a.violation_id = p_violation_id
      AND a.status IN ('pending', 'reviewing')
  ) THEN
    RAISE EXCEPTION 'An appeal is already pending for this violation.';
  END IF;

  -- Assign a moderator who was not involved in the original decision when possible
  SELECT ms.user_id INTO v_moderator
  FROM public.moderation_staff ms
  WHERE ms.user_id <> v_violation.created_by
  ORDER BY random()
  LIMIT 1;

  INSERT INTO public.moderation_appeals (
    violation_id, author_id, original_moderator_id, assigned_moderator_id, appeal_text
  )
  VALUES (
    v_violation.id,
    auth.uid(),
    v_violation.created_by,
    v_moderator,
    left(v_text, 8000)
  )
  RETURNING * INTO v_appeal;

  UPDATE public.moderation_violations
  SET status = 'appealed', updated_at = now()
  WHERE id = v_violation.id;

  PERFORM public.moderation_log(
    'moderation_appeals',
    v_appeal.id::text,
    'submitted',
    jsonb_build_object('violation_id', p_violation_id)
  );

  RETURN v_appeal;
END;
$$;

-- ---------------------------------------------------------------------------
-- 18. Staff: resolve appeal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_resolve_appeal(
  p_appeal_id uuid,
  p_outcome text,
  p_notes text DEFAULT ''
)
RETURNS public.moderation_appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appeal public.moderation_appeals;
  v_violation public.moderation_violations;
  v_notes text;
  v_existing public.moderation_appeals;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  IF p_outcome NOT IN ('upheld', 'overturned', 'partial') THEN
    RAISE EXCEPTION 'Invalid appeal outcome.';
  END IF;

  SELECT * INTO v_existing
  FROM public.moderation_appeals a
  WHERE a.id = p_appeal_id
    AND a.status IN ('pending', 'reviewing');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found or already resolved.';
  END IF;

  IF v_existing.assigned_moderator_id IS NOT NULL
     AND v_existing.original_moderator_id = auth.uid()
     AND v_existing.assigned_moderator_id = v_existing.original_moderator_id THEN
    RAISE EXCEPTION 'A different moderator should resolve this appeal when possible.';
  END IF;

  v_notes := left(trim(COALESCE(p_notes, '')), 4000);

  UPDATE public.moderation_appeals a
  SET status = p_outcome,
      resolution_notes = v_notes,
      resolved_at = now(),
      updated_at = now()
  WHERE a.id = p_appeal_id
  RETURNING * INTO v_appeal;

  SELECT * INTO v_violation
  FROM public.moderation_violations v
  WHERE v.id = v_appeal.violation_id;

  IF p_outcome = 'overturned' THEN
    UPDATE public.moderation_violations
    SET status = 'overturned', updated_at = now()
    WHERE id = v_violation.id;

    PERFORM public.moderation_set_book_visibility(v_violation.book_id, 'public', 'Appeal overturned moderation decision.');
  ELSIF p_outcome = 'partial' THEN
    UPDATE public.moderation_violations
    SET status = 'closed', updated_at = now()
    WHERE id = v_violation.id;
  ELSE
    UPDATE public.moderation_violations
    SET status = 'open', updated_at = now()
    WHERE id = v_violation.id;
  END IF;

  PERFORM public.moderation_notify_author(
    v_appeal.author_id,
    'library_appeal_resolved',
    jsonb_build_object(
      'appealId', v_appeal.id,
      'violationId', v_violation.id,
      'bookId', v_violation.book_id,
      'outcome', p_outcome,
      'notes', v_notes,
      'preview', 'Appeal ' || p_outcome
    )
  );

  PERFORM public.moderation_log(
    'moderation_appeals',
    v_appeal.id::text,
    'resolved_' || p_outcome,
    jsonb_build_object('notes', v_notes)
  );

  RETURN v_appeal;
END;
$$;

-- ---------------------------------------------------------------------------
-- 19. Staff: check missed violation deadlines
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_check_deadlines()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  FOR v_row IN
    SELECT v.*
    FROM public.moderation_violations v
    WHERE v.status = 'open'
      AND v.deadline < now()
  LOOP
    UPDATE public.moderation_violations
    SET status = 'deadline_missed', updated_at = now()
    WHERE id = v_row.id;

    PERFORM public.moderation_set_book_visibility(
      v_row.book_id,
      'hidden',
      'Correction deadline missed.'
    );

    PERFORM public.moderation_notify_author(
      v_row.author_id,
      'library_violation_deadline',
      jsonb_build_object(
        'violationId', v_row.id,
        'bookId', v_row.book_id,
        'preview', 'Correction deadline passed — book temporarily hidden.'
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 20. Staff dashboard summary
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  SELECT jsonb_build_object(
    'pendingReports', (SELECT COUNT(*) FROM public.library_reports WHERE status = 'pending'),
    'reviewingReports', (SELECT COUNT(*) FROM public.library_reports WHERE status = 'reviewing'),
    'criticalReports', (SELECT COUNT(*) FROM public.library_reports WHERE status IN ('pending','reviewing') AND priority = 'critical'),
    'openViolations', (SELECT COUNT(*) FROM public.moderation_violations WHERE status = 'open'),
    'missedDeadlines', (SELECT COUNT(*) FROM public.moderation_violations WHERE status = 'deadline_missed'),
    'pendingAppeals', (SELECT COUNT(*) FROM public.moderation_appeals WHERE status IN ('pending','reviewing')),
    'hiddenBooks', (SELECT COUNT(*) FROM public.library_book_moderation WHERE visibility = 'hidden'),
    'removedBooks', (SELECT COUNT(*) FROM public.library_book_moderation WHERE visibility = 'removed')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 21. Author: list own violations (for appeals)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_my_violations()
RETURNS SETOF public.moderation_violations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  RETURN QUERY
  SELECT v.*
  FROM public.moderation_violations v
  WHERE v.author_id = auth.uid()
  ORDER BY v.created_at DESC
  LIMIT 50;
END;
$$;

-- ---------------------------------------------------------------------------
-- 22. Reader: list own submitted reports
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_my_reports()
RETURNS SETOF public.library_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.library_reports r
  WHERE r.reporter_id = auth.uid()
  ORDER BY r.created_at DESC
  LIMIT 50;
END;
$$;

-- ---------------------------------------------------------------------------
-- 23. Book visibility check (for reader pages)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.library_book_is_readable(p_book_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.library_book_moderation m
    WHERE m.book_id = p_book_id
      AND m.visibility IN ('hidden', 'removed')
  )
  OR public.is_moderation_staff()
  OR public.moderation_library_author_id(p_book_id) = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 24. Update library SELECT policy to respect moderation visibility
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "library_select_public" ON public.library;
CREATE POLICY "library_select_public" ON public.library
  FOR SELECT TO anon, authenticated
  USING (
    COALESCE((data->>'isPublished')::boolean, true) = true
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.library_book_moderation m
        WHERE m.book_id = library.id::text
          AND m.visibility IN ('hidden', 'removed')
      )
      OR (auth.uid())::text = user_id::text
      OR (auth.uid())::text = (data->>'ownerUid')
      OR public.is_moderation_staff()
    )
  );

-- ---------------------------------------------------------------------------
-- 25. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.moderation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporter_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_book_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_moderation_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_audit_log ENABLE ROW LEVEL SECURITY;

-- moderation_config: staff read only
DROP POLICY IF EXISTS "moderation_config_select_staff" ON public.moderation_config;
CREATE POLICY "moderation_config_select_staff" ON public.moderation_config
  FOR SELECT TO authenticated
  USING (public.is_moderation_staff());

-- moderation_staff: staff can read roster
DROP POLICY IF EXISTS "moderation_staff_select_staff" ON public.moderation_staff;
CREATE POLICY "moderation_staff_select_staff" ON public.moderation_staff
  FOR SELECT TO authenticated
  USING (public.is_moderation_staff() OR user_id = auth.uid());

-- reporter_scores: users see own; staff see all
DROP POLICY IF EXISTS "reporter_scores_select" ON public.reporter_scores;
CREATE POLICY "reporter_scores_select" ON public.reporter_scores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_moderation_staff());

-- library_book_moderation: staff + book author
DROP POLICY IF EXISTS "library_book_moderation_select" ON public.library_book_moderation;
CREATE POLICY "library_book_moderation_select" ON public.library_book_moderation
  FOR SELECT TO authenticated
  USING (
    public.is_moderation_staff()
    OR author_id = auth.uid()
  );

-- author_moderation_status: own + staff
DROP POLICY IF EXISTS "author_moderation_status_select" ON public.author_moderation_status;
CREATE POLICY "author_moderation_status_select" ON public.author_moderation_status
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_moderation_staff());

-- library_reports: own reports + staff
DROP POLICY IF EXISTS "library_reports_select" ON public.library_reports;
CREATE POLICY "library_reports_select" ON public.library_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR author_id = auth.uid() OR public.is_moderation_staff());

-- moderation_violations: author + staff
DROP POLICY IF EXISTS "moderation_violations_select" ON public.moderation_violations;
CREATE POLICY "moderation_violations_select" ON public.moderation_violations
  FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR public.is_moderation_staff());

-- moderation_strikes: own + staff
DROP POLICY IF EXISTS "moderation_strikes_select" ON public.moderation_strikes;
CREATE POLICY "moderation_strikes_select" ON public.moderation_strikes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_moderation_staff());

-- moderation_appeals: author + staff
DROP POLICY IF EXISTS "moderation_appeals_select" ON public.moderation_appeals;
CREATE POLICY "moderation_appeals_select" ON public.moderation_appeals
  FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR public.is_moderation_staff());

-- audit log: staff only
DROP POLICY IF EXISTS "moderation_audit_log_select_staff" ON public.moderation_audit_log;
CREATE POLICY "moderation_audit_log_select_staff" ON public.moderation_audit_log
  FOR SELECT TO authenticated
  USING (public.is_moderation_staff());

-- ---------------------------------------------------------------------------
-- 26. Notifications RLS — allow moderation system to notify authors
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "notifications_insert_moderation" ON public.notifications;
CREATE POLICY "notifications_insert_moderation" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    data->>'type' IN (
      'library_violation',
      'library_violation_deadline',
      'library_appeal_resolved'
    )
    AND public.is_moderation_staff()
  );

-- Staff-triggered notifications also come from SECURITY DEFINER functions;
-- add policy for authors to read their own (existing policies should cover SELECT)

-- ---------------------------------------------------------------------------
-- 27. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.moderation_config TO authenticated;
GRANT SELECT ON public.moderation_staff TO authenticated;
GRANT SELECT ON public.reporter_scores TO authenticated;
GRANT SELECT ON public.library_book_moderation TO authenticated;
GRANT SELECT ON public.author_moderation_status TO authenticated;
GRANT SELECT ON public.library_reports TO authenticated;
GRANT SELECT ON public.moderation_violations TO authenticated;
GRANT SELECT ON public.moderation_strikes TO authenticated;
GRANT SELECT ON public.moderation_appeals TO authenticated;
GRANT SELECT ON public.moderation_audit_log TO authenticated;

REVOKE ALL ON FUNCTION public.is_moderation_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_staff_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_library_report(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_list_reports(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_review_report(uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_confirm_violation(uuid, text, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_set_book_visibility(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_submit_appeal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_resolve_appeal(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_check_deadlines() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_dashboard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_my_violations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderation_my_reports() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_book_is_readable(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_moderation_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_library_report(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_list_reports(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_review_report(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_confirm_violation(uuid, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_set_book_visibility(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_submit_appeal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_resolve_appeal(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_check_deadlines() TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_my_violations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_my_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.library_book_is_readable(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 28. Bootstrap first moderator (run manually after migration)
-- ---------------------------------------------------------------------------
-- INSERT INTO public.moderation_staff (user_id, role, created_by)
-- VALUES ('YOUR-USER-UUID-HERE', 'admin', 'YOUR-USER-UUID-HERE');
--
-- Optional: mark trusted reporters (higher report weight):
-- INSERT INTO public.reporter_scores (user_id, weight, notes)
-- VALUES ('REPORTER-UUID', 2.5, 'Trusted community reporter')
-- ON CONFLICT (user_id) DO UPDATE SET weight = 2.5, updated_at = now();
