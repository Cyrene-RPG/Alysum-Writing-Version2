-- Run once in Supabase → SQL Editor.
-- Exposes anonymized writing totals for leaderboards without opening full users rows.
-- users.id is text (not uuid) in this project.

DROP FUNCTION IF EXISTS public.leaderboard_writing_totals();

CREATE OR REPLACE FUNCTION public.leaderboard_writing_totals()
RETURNS TABLE (
    user_id text,
    username text,
    display_name text,
    profile_image_url text,
    writing_day_totals jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT DISTINCT ON (u.id::text)
        u.id::text AS user_id,
        u.username::text,
        u.display_name::text,
        u.profile_image_url::text,
        COALESCE(u.writing_day_totals, '{}'::jsonb) AS writing_day_totals
    FROM public.users u
    WHERE u.writing_day_totals IS NOT NULL
      AND u.writing_day_totals <> '{}'::jsonb
    ORDER BY u.id::text;
$$;

REVOKE ALL ON FUNCTION public.leaderboard_writing_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leaderboard_writing_totals() TO authenticated;
