-- Run once in Supabase → SQL Editor (safe to re-run).
-- Does not drag-and-drop: copy this whole file, paste, Run.
-- Adds first-listed / last-updated times to library_catalog so every client
-- can sort New arrivals the same way. Does not change insert RLS or publish.

DROP VIEW IF EXISTS public.library_catalog;

CREATE VIEW public.library_catalog AS
SELECT
  id,
  user_id,
  public.library_strip_chapter_content(data) AS data,
  created_at,
  updated_at
FROM public.library
WHERE COALESCE((data->>'isPublished')::boolean, true) = true;

GRANT SELECT ON public.library_catalog TO anon, authenticated;
