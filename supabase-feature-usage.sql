-- Run once in Supabase → SQL Editor (safe to re-run).
-- Feature usage tracking for staff analytics (moderation Usage tab).
-- Apply after supabase-library-reports.sql (uses is_moderation_staff).

-- ---------------------------------------------------------------------------
-- 1. Event log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feature_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (char_length(feature) BETWEEN 1 AND 64),
  path text NOT NULL DEFAULT '' CHECK (char_length(path) <= 512),
  book_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_usage_events_feature_created_idx
  ON public.feature_usage_events (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS feature_usage_events_user_created_idx
  ON public.feature_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feature_usage_events_created_idx
  ON public.feature_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS feature_usage_events_user_feature_created_idx
  ON public.feature_usage_events (user_id, feature, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Author logging RPC (debounced server-side)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_feature_usage(
  p_feature text,
  p_path text DEFAULT '',
  p_book_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_feature text := lower(trim(coalesce(p_feature, '')));
  v_path text := left(trim(coalesce(p_path, '')), 512);
  v_book_id text := nullif(trim(coalesce(p_book_id, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_feature = '' OR v_feature !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'Invalid feature slug';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.feature_usage_events e
    WHERE e.user_id = v_user_id
      AND e.feature = v_feature
      AND e.created_at > now() - interval '15 minutes'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.feature_usage_events (user_id, feature, path, book_id)
  VALUES (v_user_id, v_feature, v_path, v_book_id);

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Staff analytics RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_feature_usage_stats(p_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 14), 90));
  v_since timestamptz;
  v_local_today date;
  v_by_feature jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_top_users jsonb := '[]'::jsonb;
  v_user_features jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  v_since := now() - make_interval(days => v_days);
  v_local_today := (timezone('America/Los_Angeles', now()))::date;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.events DESC, t.feature ASC), '[]'::jsonb)
  INTO v_by_feature
  FROM (
    SELECT
      e.feature,
      COUNT(*)::integer AS events,
      COUNT(DISTINCT e.user_id)::integer AS unique_users
    FROM public.feature_usage_events e
    WHERE e.created_at >= v_since
    GROUP BY e.feature
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.day ASC), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT
      d::date AS day,
      COALESCE(c.cnt, 0)::integer AS count
    FROM generate_series(
      v_local_today - (v_days - 1),
      v_local_today,
      interval '1 day'
    ) AS d
    LEFT JOIN (
      SELECT
        (timezone('America/Los_Angeles', e.created_at))::date AS day,
        COUNT(*)::integer AS cnt
      FROM public.feature_usage_events e
      WHERE e.created_at >= v_since
      GROUP BY 1
    ) c ON c.day = d::date
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.events DESC, t.username ASC), '[]'::jsonb)
  INTO v_top_users
  FROM (
    SELECT
      e.user_id,
      COALESCE(u.username, split_part(COALESCE(au.email, ''), '@', 1), 'user') AS username,
      COALESCE(u.display_name, '') AS display_name,
      COUNT(*)::integer AS events,
      COUNT(DISTINCT e.feature)::integer AS features_used
    FROM public.feature_usage_events e
    LEFT JOIN public.users u ON u.id = e.user_id
    LEFT JOIN auth.users au ON au.id = e.user_id
    WHERE e.created_at >= v_since
    GROUP BY e.user_id, u.username, u.display_name, au.email
    ORDER BY COUNT(*) DESC, COALESCE(u.username, '') ASC
    LIMIT 25
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.events DESC), '[]'::jsonb)
  INTO v_user_features
  FROM (
    SELECT
      e.user_id,
      COALESCE(u.username, split_part(COALESCE(au.email, ''), '@', 1), 'user') AS username,
      COALESCE(u.display_name, '') AS display_name,
      e.feature,
      COUNT(*)::integer AS events
    FROM public.feature_usage_events e
    LEFT JOIN public.users u ON u.id = e.user_id
    LEFT JOIN auth.users au ON au.id = e.user_id
    WHERE e.created_at >= v_since
    GROUP BY e.user_id, u.username, u.display_name, au.email, e.feature
    ORDER BY COUNT(*) DESC
    LIMIT 40
  ) t;

  RETURN jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'timezone', 'America/Los_Angeles',
    'totals', jsonb_build_object(
      'events', (SELECT COUNT(*) FROM public.feature_usage_events WHERE created_at >= v_since),
      'uniqueUsers', (SELECT COUNT(DISTINCT user_id) FROM public.feature_usage_events WHERE created_at >= v_since),
      'uniqueFeatures', (SELECT COUNT(DISTINCT feature) FROM public.feature_usage_events WHERE created_at >= v_since)
    ),
    'byFeature', v_by_feature,
    'dailyTotals', v_daily,
    'topUsers', v_top_users,
    'topUserFeatures', v_user_features
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_feature_usage_for_user(
  p_user_id uuid,
  p_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 14), 90));
  v_since timestamptz;
  v_by_feature jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  v_since := now() - make_interval(days => v_days);

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.events DESC, t.feature ASC), '[]'::jsonb)
  INTO v_by_feature
  FROM (
    SELECT
      e.feature,
      COUNT(*)::integer AS events,
      MAX(e.created_at) AS last_seen
    FROM public.feature_usage_events e
    WHERE e.user_id = p_user_id
      AND e.created_at >= v_since
    GROUP BY e.feature
  ) t;

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'days', v_days,
    'since', v_since,
    'byFeature', v_by_feature,
    'totalEvents', (
      SELECT COUNT(*)
      FROM public.feature_usage_events e
      WHERE e.user_id = p_user_id
        AND e.created_at >= v_since
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS — authors cannot read the log; staff reads via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------

ALTER TABLE public.feature_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_usage_insert_own" ON public.feature_usage_events;
CREATE POLICY "feature_usage_insert_own" ON public.feature_usage_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.feature_usage_events FROM anon;
GRANT INSERT ON public.feature_usage_events TO authenticated;

REVOKE ALL ON FUNCTION public.log_feature_usage(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_feature_usage(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.staff_feature_usage_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_feature_usage_stats(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.staff_feature_usage_for_user(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_feature_usage_for_user(uuid, integer) TO authenticated;
