-- Staff user browser: search users, inspect profiles, books, moderation & activity.
-- Run AFTER supabase-library-reports.sql (requires is_moderation_staff()).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Presence — last_seen_at for "who's online" in staff tools
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_user_presence()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seen timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  UPDATE public.users u
  SET last_seen_at = now()
  WHERE u.id = auth.uid()
    AND (u.last_seen_at IS NULL OR u.last_seen_at < now() - interval '90 seconds')
  RETURNING u.last_seen_at INTO v_seen;

  IF v_seen IS NULL THEN
    SELECT last_seen_at INTO v_seen FROM public.users WHERE id = auth.uid();
  END IF;

  RETURN v_seen;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Search / list users
-- ---------------------------------------------------------------------------

-- Drop legacy overloads so PostgREST is not ambiguous (5-arg vs 6-arg).
DROP FUNCTION IF EXISTS public.staff_search_users(text, integer, integer);
DROP FUNCTION IF EXISTS public.staff_search_users(integer, integer, text);
DROP FUNCTION IF EXISTS public.staff_search_users(integer, integer, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.staff_search_users(integer, integer, text, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.staff_search_users(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_query text DEFAULT '',
  p_online_only boolean DEFAULT false,
  p_active_today boolean DEFAULT false,
  p_needs_attention boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_query text;
  v_limit integer;
  v_offset integer;
  v_total bigint;
  v_users jsonb;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  v_query := trim(COALESCE(p_query, ''));
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  SELECT COUNT(*) INTO v_total
  FROM public.users u
  LEFT JOIN public.author_moderation_status ams ON ams.user_id = u.id
  WHERE
    (v_query = ''
      OR u.id::text = v_query
      OR lower(u.username) LIKE '%' || lower(v_query) || '%'
      OR lower(u.display_name) LIKE '%' || lower(v_query) || '%'
      OR lower(COALESCE(u.email, '')) LIKE '%' || lower(v_query) || '%')
    AND (NOT p_online_only OR u.last_seen_at >= now() - interval '5 minutes')
    AND (NOT p_active_today OR u.last_seen_at >= now() - interval '24 hours')
    AND (NOT p_needs_attention OR (
      COALESCE(ams.account_suspended, false)
      OR COALESCE(ams.account_terminated, false)
      OR COALESCE(ams.publishing_revoked, false)
      OR EXISTS (
        SELECT 1 FROM public.moderation_strikes ms
        WHERE ms.user_id = u.id AND ms.expires_at > now()
      )
      OR EXISTS (
        SELECT 1 FROM public.library_reports r
        WHERE r.author_id = u.id AND r.status IN ('pending', 'reviewing')
      )
      OR EXISTS (
        SELECT 1 FROM public.moderation_violations v
        WHERE v.author_id = u.id AND v.status IN ('open', 'deadline_missed', 'appealed')
      )
      OR EXISTS (
        SELECT 1 FROM public.moderation_appeals a
        JOIN public.moderation_violations v ON v.id = a.violation_id
        WHERE v.author_id = u.id AND a.status IN ('pending', 'reviewing')
      )
    ));

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.attention_score DESC, t.sort_seen DESC NULLS LAST), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.email,
      u.account_type,
      u.profile_image_url,
      u.words,
      u.streak,
      u.last_login,
      u.last_seen_at,
      u.created_at,
      u.updated_at,
      COALESCE((
        SELECT SUM(b.words)::bigint FROM public.books b WHERE b.user_id = u.id
      ), 0) AS book_words_total,
      (u.last_seen_at >= now() - interval '5 minutes') AS is_online,
      (u.last_seen_at >= now() - interval '30 minutes') AS is_recent,
      COALESCE(u.last_seen_at, au.last_sign_in_at) AS sort_seen,
      (SELECT COUNT(*)::integer FROM public.books b WHERE b.user_id = u.id) AS book_count,
      (SELECT COUNT(*)::integer FROM public.books b WHERE b.user_id = u.id AND b.is_published) AS published_count,
      (
        SELECT COUNT(*)::integer
        FROM public.moderation_strikes ms
        WHERE ms.user_id = u.id AND ms.expires_at > now()
      ) AS active_strikes,
      (
        SELECT COUNT(*)::integer
        FROM public.library_reports r
        WHERE r.author_id = u.id AND r.status IN ('pending', 'reviewing')
      ) AS pending_reports,
      (
        SELECT COUNT(*)::integer
        FROM public.moderation_violations v
        WHERE v.author_id = u.id AND v.status IN ('open', 'deadline_missed', 'appealed')
      ) AS open_violations,
      (
        SELECT COUNT(*)::integer
        FROM public.moderation_appeals a
        JOIN public.moderation_violations v ON v.id = a.violation_id
        WHERE v.author_id = u.id AND a.status IN ('pending', 'reviewing')
      ) AS pending_appeals,
      COALESCE(ams.publishing_revoked, false) AS publishing_revoked,
      COALESCE(ams.account_suspended, false) AS account_suspended,
      COALESCE(ams.account_terminated, false) AS account_terminated,
      ams.publishing_suspended_until,
      au.last_sign_in_at,
      (
        (CASE WHEN COALESCE(ams.account_terminated, false) THEN 100 ELSE 0 END)
        + (CASE WHEN COALESCE(ams.account_suspended, false) THEN 80 ELSE 0 END)
        + (SELECT COUNT(*)::integer * 10 FROM public.library_reports r
           WHERE r.author_id = u.id AND r.status IN ('pending', 'reviewing'))
        + (SELECT COUNT(*)::integer * 15 FROM public.moderation_appeals a
           JOIN public.moderation_violations v ON v.id = a.violation_id
           WHERE v.author_id = u.id AND a.status IN ('pending', 'reviewing'))
        + (SELECT COUNT(*)::integer * 8 FROM public.moderation_violations v
           WHERE v.author_id = u.id AND v.status IN ('open', 'deadline_missed'))
        + (SELECT COUNT(*)::integer * 5 FROM public.moderation_strikes ms
           WHERE ms.user_id = u.id AND ms.expires_at > now())
      ) AS attention_score
    FROM public.users u
    LEFT JOIN auth.users au ON au.id = u.id
    LEFT JOIN public.author_moderation_status ams ON ams.user_id = u.id
    WHERE
      (v_query = ''
        OR u.id::text = v_query
        OR lower(u.username) LIKE '%' || lower(v_query) || '%'
        OR lower(u.display_name) LIKE '%' || lower(v_query) || '%'
        OR lower(COALESCE(u.email, '')) LIKE '%' || lower(v_query) || '%')
      AND (NOT p_online_only OR u.last_seen_at >= now() - interval '5 minutes')
      AND (NOT p_active_today OR u.last_seen_at >= now() - interval '24 hours')
      AND (NOT p_needs_attention OR (
        COALESCE(ams.account_suspended, false)
        OR COALESCE(ams.account_terminated, false)
        OR COALESCE(ams.publishing_revoked, false)
        OR EXISTS (
          SELECT 1 FROM public.moderation_strikes ms
          WHERE ms.user_id = u.id AND ms.expires_at > now()
        )
        OR EXISTS (
          SELECT 1 FROM public.library_reports r
          WHERE r.author_id = u.id AND r.status IN ('pending', 'reviewing')
        )
        OR EXISTS (
          SELECT 1 FROM public.moderation_violations v
          WHERE v.author_id = u.id AND v.status IN ('open', 'deadline_missed', 'appealed')
        )
        OR EXISTS (
          SELECT 1 FROM public.moderation_appeals a
          JOIN public.moderation_violations v ON v.id = a.violation_id
          WHERE v.author_id = u.id AND a.status IN ('pending', 'reviewing')
        )
      ))
    ORDER BY attention_score DESC, sort_seen DESC NULLS LAST, u.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'users', v_users
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_online_users(p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.last_seen_at DESC)
    FROM (
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.account_type,
        u.profile_image_url,
        u.last_seen_at
      FROM public.users u
      WHERE u.last_seen_at >= now() - interval '5 minutes'
      ORDER BY u.last_seen_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100))
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. User overview (profile, auth, counts, moderation flags)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_get_user_detail(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_profile public.users%ROWTYPE;
  v_auth jsonb;
  v_mod public.author_moderation_status%ROWTYPE;
  v_reporter public.reporter_scores%ROWTYPE;
  v_counts jsonb;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  SELECT * INTO v_profile FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  SELECT jsonb_build_object(
    'auth_created_at', au.created_at,
    'last_sign_in_at', au.last_sign_in_at,
    'email_confirmed_at', au.email_confirmed_at,
    'phone', au.phone,
    'providers', au.raw_app_meta_data -> 'providers',
    'auth_email', au.email
  )
  INTO v_auth
  FROM auth.users au
  WHERE au.id = p_user_id;

  SELECT * INTO v_mod
  FROM public.author_moderation_status ams
  WHERE ams.user_id = p_user_id;

  SELECT * INTO v_reporter
  FROM public.reporter_scores rs
  WHERE rs.user_id = p_user_id;

  SELECT jsonb_build_object(
    'books', (SELECT COUNT(*) FROM public.books b WHERE b.user_id = p_user_id),
    'published_books', (SELECT COUNT(*) FROM public.books b WHERE b.user_id = p_user_id AND b.is_published),
    'draft_books', (SELECT COUNT(*) FROM public.books b WHERE b.user_id = p_user_id AND NOT b.is_published),
    'book_words_total', (
      SELECT COALESCE(SUM(b.words), 0)::bigint FROM public.books b WHERE b.user_id = p_user_id
    ),
    'profile_words', (SELECT words FROM public.users WHERE id = p_user_id),
    'comments', (SELECT COUNT(*) FROM public.comments c WHERE c.user_id = p_user_id),
    'likes_given', (SELECT COUNT(*) FROM public.likes l WHERE l.user_id = p_user_id),
    'likes_on_books', (
      SELECT COUNT(*)
      FROM public.likes l
      JOIN public.books b ON b.id = l.book_id
      WHERE b.user_id = p_user_id
    ),
    'reads_on_books', (
      SELECT COALESCE(SUM((l.data ->> 'views')::bigint), 0)
      FROM public.library l
      JOIN public.books b ON b.id = l.id
      WHERE b.user_id = p_user_id
    ),
    'reports_against', (SELECT COUNT(*) FROM public.library_reports r WHERE r.author_id = p_user_id),
    'reports_filed', (SELECT COUNT(*) FROM public.library_reports r WHERE r.reporter_id = p_user_id),
    'open_violations', (
      SELECT COUNT(*) FROM public.moderation_violations v
      WHERE v.author_id = p_user_id AND v.status IN ('open', 'deadline_missed', 'appealed')
    ),
    'pending_reports', (
      SELECT COUNT(*) FROM public.library_reports r
      WHERE r.author_id = p_user_id AND r.status IN ('pending', 'reviewing')
    ),
    'pending_appeals', (
      SELECT COUNT(*) FROM public.moderation_appeals a
      JOIN public.moderation_violations v ON v.id = a.violation_id
      WHERE v.author_id = p_user_id AND a.status IN ('pending', 'reviewing')
    ),
    'active_strikes', (
      SELECT COUNT(*) FROM public.moderation_strikes ms
      WHERE ms.user_id = p_user_id AND ms.expires_at > now()
    ),
    'beta_shares_owned', (
      SELECT COUNT(*) FROM public.manuscript_shares ms WHERE ms.author_id = p_user_id
    ),
    'beta_shares_participant', (
      SELECT COUNT(*) FROM public.manuscript_shares ms WHERE ms.reader_id = p_user_id
    ),
    'blocks_made', (SELECT COUNT(*) FROM public.user_blocks ub WHERE ub.blocker_id = p_user_id),
    'blocks_received', (SELECT COUNT(*) FROM public.user_blocks ub WHERE ub.blocked_id = p_user_id)
  ) INTO v_counts;

  RETURN jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'auth', COALESCE(v_auth, '{}'::jsonb),
    'moderation_status', CASE WHEN v_mod.user_id IS NULL THEN NULL ELSE to_jsonb(v_mod) END,
    'reporter_score', CASE WHEN v_reporter.user_id IS NULL THEN NULL ELSE to_jsonb(v_reporter) END,
    'counts', v_counts
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. User books (drafts + published, moderation visibility)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_list_user_books(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.updated DESC)
    FROM (
      SELECT
        b.id,
        b.title,
        b.words,
        b.is_published,
        b.library_type,
        b.created,
        b.updated,
        b.published_chapter_ids,
        b.publish_meta,
        lbm.visibility,
        lbm.hidden_reason AS moderation_reason,
        lbm.updated_at AS moderation_updated_at,
        lib.data ->> 'views' AS library_views,
        (SELECT COUNT(*)::integer FROM public.library_reports r WHERE r.book_id = b.id) AS report_count,
        (SELECT COUNT(*)::integer FROM public.comments c WHERE c.book_id = b.id) AS comment_count,
        (SELECT COUNT(*)::integer FROM public.likes lk WHERE lk.book_id = b.id) AS like_count
      FROM public.books b
      LEFT JOIN public.library_book_moderation lbm ON lbm.book_id = b.id
      LEFT JOIN public.library lib ON lib.id = b.id
      WHERE b.user_id = p_user_id
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Moderation & safety history for a user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_get_user_safety(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  RETURN jsonb_build_object(
    'strikes', COALESCE((
      SELECT jsonb_agg(to_jsonb(ms) ORDER BY ms.created_at DESC)
      FROM public.moderation_strikes ms
      WHERE ms.user_id = p_user_id
    ), '[]'::jsonb),
    'violations', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC)
      FROM public.moderation_violations v
      WHERE v.author_id = p_user_id
    ), '[]'::jsonb),
    'reports_as_author', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT r.*
        FROM public.library_reports r
        WHERE r.author_id = p_user_id
        ORDER BY r.created_at DESC
        LIMIT 50
      ) t
    ), '[]'::jsonb),
    'reports_as_reporter', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT r.*
        FROM public.library_reports r
        WHERE r.reporter_id = p_user_id
        ORDER BY r.created_at DESC
        LIMIT 50
      ) t
    ), '[]'::jsonb),
    'appeals', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM public.moderation_appeals a
      JOIN public.moderation_violations v ON v.id = a.violation_id
      WHERE v.author_id = p_user_id
    ), '[]'::jsonb),
    'audit_log', COALESCE((
      SELECT jsonb_agg(to_jsonb(al) ORDER BY al.created_at DESC)
      FROM public.moderation_audit_log al
      WHERE al.actor_id = p_user_id
         OR al.payload ->> 'author_id' = p_user_id::text
         OR al.payload ->> 'user_id' = p_user_id::text
      LIMIT 40
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Engagement: comments, beta shares, blocks, current read
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_get_user_engagement(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.users%ROWTYPE;
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  SELECT * INTO v_profile FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  RETURN jsonb_build_object(
    'recent_comments', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT c.id, c.book_id, c.text, c.created_at, c.updated_at
        FROM public.comments c
        WHERE c.user_id = p_user_id
        ORDER BY c.created_at DESC
        LIMIT 30
      ) t
    ), '[]'::jsonb),
    'beta_shelf', v_profile.beta_read_shelf,
    'beta_read_notes_by_book', v_profile.beta_read_notes_by_book,
    'current_read', jsonb_build_object(
      'book_id', v_profile.current_read_book_id,
      'chapter_index', v_profile.current_read_chapter_index,
      'chapter_title', v_profile.current_read_chapter_title,
      'story_title', v_profile.current_read_story_title,
      'author', v_profile.current_read_author,
      'updated_at', v_profile.current_read_updated_at
    ),
    'beta_shares', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT
          ms.id,
          ms.book_id,
          ms.author_id,
          ms.reader_id,
          ms.status,
          ms.invited_email,
          ms.permissions,
          ms.expires_at,
          ms.created_at,
          ms.accepted_at
        FROM public.manuscript_shares ms
        WHERE ms.author_id = p_user_id
           OR ms.reader_id = p_user_id
        ORDER BY ms.created_at DESC
        LIMIT 30
      ) t
    ), '[]'::jsonb),
    'blocks_made', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT ub.*, u.username AS blocked_username
        FROM public.user_blocks ub
        LEFT JOIN public.users u ON u.id = ub.blocked_id
        WHERE ub.blocker_id = p_user_id
      ) t
    ), '[]'::jsonb),
    'blocks_received', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT ub.*, u.username AS blocker_username
        FROM public.user_blocks ub
        LEFT JOIN public.users u ON u.id = ub.blocker_id
        WHERE ub.blocked_id = p_user_id
      ) t
    ), '[]'::jsonb),
    'beta_message_reports', COALESCE((
      SELECT jsonb_agg(to_jsonb(bmr) ORDER BY bmr.created_at DESC)
      FROM public.beta_message_reports bmr
      WHERE bmr.reporter_id = p_user_id OR bmr.reported_user_id = p_user_id
      LIMIT 30
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Platform overview stats (users index header)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_users_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_moderation_staff() THEN
    RAISE EXCEPTION 'Moderation staff only.';
  END IF;

  RETURN jsonb_build_object(
    'totalUsers', (SELECT COUNT(*) FROM public.users),
    'authors', (SELECT COUNT(*) FROM public.users WHERE account_type IN ('author', 'both')),
    'readers', (SELECT COUNT(*) FROM public.users WHERE account_type IN ('reader', 'both')),
    'onlineNow', (
      SELECT COUNT(*) FROM public.users
      WHERE last_seen_at >= now() - interval '5 minutes'
    ),
    'activeToday', (
      SELECT COUNT(*) FROM public.users
      WHERE last_seen_at >= now() - interval '24 hours'
    ),
    'activeWeek', (
      SELECT COUNT(*) FROM public.users
      WHERE last_seen_at >= date_trunc('week', now())
    ),
    'newThisWeek', (
      SELECT COUNT(*) FROM public.users
      WHERE created_at >= date_trunc('week', now())
    ),
    'newToday', (
      SELECT COUNT(*) FROM public.users
      WHERE created_at >= date_trunc('day', now())
    ),
    'suspendedAccounts', (
      SELECT COUNT(*) FROM public.author_moderation_status
      WHERE account_suspended OR account_terminated
    ),
    'totalBooks', (SELECT COUNT(*) FROM public.books),
    'publishedBooks', (SELECT COUNT(*) FROM public.books WHERE is_published),
    'usersNeedingAttention', (
      SELECT COUNT(DISTINCT u.id)
      FROM public.users u
      LEFT JOIN public.author_moderation_status ams ON ams.user_id = u.id
      WHERE COALESCE(ams.account_suspended, false)
        OR COALESCE(ams.account_terminated, false)
        OR COALESCE(ams.publishing_revoked, false)
        OR EXISTS (
          SELECT 1 FROM public.moderation_strikes ms
          WHERE ms.user_id = u.id AND ms.expires_at > now()
        )
        OR EXISTS (
          SELECT 1 FROM public.library_reports r
          WHERE r.author_id = u.id AND r.status IN ('pending', 'reviewing')
        )
        OR EXISTS (
          SELECT 1 FROM public.moderation_violations v
          WHERE v.author_id = u.id AND v.status IN ('open', 'deadline_missed', 'appealed')
        )
        OR EXISTS (
          SELECT 1 FROM public.moderation_appeals a
          JOIN public.moderation_violations v ON v.id = a.violation_id
          WHERE v.author_id = u.id AND a.status IN ('pending', 'reviewing')
        )
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.staff_search_users(integer, integer, text, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_list_online_users(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_user_presence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_get_user_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_list_user_books(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_get_user_safety(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_get_user_engagement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_users_overview_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.touch_user_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_search_users(integer, integer, text, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_online_users(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_user_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_user_books(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_user_safety(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_user_engagement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_users_overview_stats() TO authenticated;

-- Refresh PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';
