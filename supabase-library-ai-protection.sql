-- Run once in Supabase → SQL Editor (safe to re-run).
-- Strips chapter text from anonymous library reads so AI scrapers cannot pull
-- full books via the public Supabase REST API. Human readers load chapters
-- through /api/book-content (service role) after this migration.

-- ---------------------------------------------------------------------------
-- 1. Strip chapter body/content from catalog JSON (metadata only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.library_strip_chapter_content(raw jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN '{}'::jsonb
    ELSE (
      WITH stripped AS (
        SELECT COALESCE(
          (
            SELECT jsonb_agg(
              elem
                - 'content'
                - 'body'
                - 'imageUrl'
                - 'imageUrls'
                - 'pages'
                - 'scriptHtml'
                - 'script_html'
            )
            FROM jsonb_array_elements(COALESCE(raw->'chapters', '[]'::jsonb)) AS elem
          ),
          '[]'::jsonb
        ) AS chapters
      )
      SELECT jsonb_set(raw, '{chapters}', stripped.chapters, true)
      FROM stripped
    )
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Public catalog view — no chapter text (runs as owner, bypasses RLS)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.library_catalog;

CREATE VIEW public.library_catalog AS
SELECT
  id,
  user_id,
  public.library_strip_chapter_content(data) AS data
FROM public.library
WHERE COALESCE((data->>'isPublished')::boolean, true) = true;

GRANT SELECT ON public.library_catalog TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Anon may browse catalog only — not raw library rows with full text
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "library_select_public" ON public.library;

CREATE POLICY "library_select_public" ON public.library
  FOR SELECT TO authenticated
  USING (COALESCE((data->>'isPublished')::boolean, true) = true);

REVOKE SELECT ON public.library FROM anon;
GRANT SELECT ON public.library TO authenticated;
