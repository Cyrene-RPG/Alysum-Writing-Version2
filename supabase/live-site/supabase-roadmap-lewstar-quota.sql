-- LewStar has no hourly report cooldown and no daily suggestion cap.
-- Apply on the live project after supabase-roadmap.sql.

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

  IF exists (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND lower(trim(username)) = 'lewstar'
  ) THEN
    RETURN jsonb_build_object('used', 0, 'limit', 9999, 'reset_at', now());
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

  IF exists (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND lower(trim(username)) = 'lewstar'
  ) THEN
    RETURN jsonb_build_object('used', 0, 'limit', 9999, 'reset_at', now());
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
