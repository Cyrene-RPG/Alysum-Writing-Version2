-- LewStar can delete a bug or suggestion from the Waypoint page.
-- Apply on the live project after supabase-roadmap.sql.
-- Copy from this file in Cursor, then Run in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.roadmap_delete_filing(p_kind text, p_stub integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS '
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION ''not_authenticated'';
  END IF;

  IF NOT exists (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND lower(trim(username)) = ''lewstar''
  ) THEN
    RAISE EXCEPTION ''not_allowed'';
  END IF;

  IF p_kind NOT IN (''bug'', ''suggestion'') THEN
    RAISE EXCEPTION ''bad_kind'';
  END IF;

  DELETE FROM public.roadmap_votes
  WHERE target_kind = p_kind
    AND target_stub = p_stub;

  DELETE FROM public.roadmap_replies
  WHERE bug_stub = p_stub;

  IF p_kind = ''bug'' THEN
    DELETE FROM public.roadmap_reports
    WHERE stub = p_stub;
  ELSE
    DELETE FROM public.roadmap_suggestions
    WHERE stub = p_stub;
  END IF;

  RETURN jsonb_build_object(''ok'', true);
END;
';

GRANT EXECUTE ON FUNCTION public.roadmap_delete_filing(text, integer) TO authenticated;
