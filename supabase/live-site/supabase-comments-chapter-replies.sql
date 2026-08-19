-- Per-chapter public comments + threaded replies (read.html).
-- Preserves existing book-level comments by assigning them to each book's first published chapter.
-- Apply in Supabase SQL editor after supabase-sibling-tables.sql (or supabase-staff-users.sql).

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS chapter_id text NOT NULL DEFAULT '';
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_book_chapter_idx ON public.comments (book_id, chapter_id);
CREATE INDEX IF NOT EXISTS comments_book_chapter_created_idx ON public.comments (book_id, chapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments (parent_id) WHERE parent_id IS NOT NULL;

-- Backfill legacy book-level comments (chapter_id = '') to the first published chapter.
UPDATE public.comments c
SET chapter_id = COALESCE(
  (
    SELECT ch->>'id'
    FROM public.library lib,
         jsonb_array_elements(COALESCE(lib.data->'chapters', '[]'::jsonb)) WITH ORDINALITY AS t(ch, ord)
    WHERE lib.id::text = c.book_id
      AND (
        COALESCE(jsonb_array_length(COALESCE(lib.data->'publishedChapterIds', '[]'::jsonb)), 0) = 0
        OR (lib.data->'publishedChapterIds') @> to_jsonb(ch->>'id')
      )
    ORDER BY COALESCE((ch->>'order')::numeric, ord::numeric)
    LIMIT 1
  ),
  'chapter-1'
)
WHERE c.chapter_id = '' OR c.chapter_id IS NULL;
