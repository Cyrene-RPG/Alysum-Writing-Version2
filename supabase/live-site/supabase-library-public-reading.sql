-- Run once in Supabase → SQL Editor (safe to re-run).
--
-- Lets logged-out visitors open a shared book link and read it.
-- supabase-library-ai-protection.sql took SELECT on public.library away from anon so nobody can
-- pull every book's chapter text in one request. Logged-out readers were meant to get chapters
-- from /api/book-content, but that endpoint was deleted, so book links only worked when signed in.
--
-- This function hands out one book at a time, by id, with the same rules as library_catalog_rows():
--   * published books only
--   * books moderators set to hidden or removed are left out
--   * anonymous books do not expose the owner's account id
-- and it keeps only the chapters listed in publishedChapterIds, so scheduled chapters stay hidden
-- until they are released. Books without that list (older listings) keep all their chapters.
-- Columns match library_catalog: id text, user_id uuid, data jsonb.
-- One transaction: if any step fails, nothing changes.

begin;

create or replace function public.get_published_book(p_book_id text)
returns table (id text, user_id uuid, data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    case when l.data->'isAnonymous' = 'true'::jsonb or l.data->'is_anonymous' = 'true'::jsonb
         then null else l.user_id end,
    case
      when jsonb_typeof(coalesce(l.data->'publishedChapterIds', l.data->'published_chapter_ids')) = 'array'
      then jsonb_set(
        l.data,
        '{chapters}',
        coalesce(
          (
            select jsonb_agg(c.chapter order by c.position)
            from jsonb_array_elements(coalesce(l.data->'chapters', '[]'::jsonb))
                 with ordinality as c(chapter, position)
            where coalesce(l.data->'publishedChapterIds', l.data->'published_chapter_ids') ? (c.chapter->>'id')
          ),
          '[]'::jsonb
        ),
        true
      )
      else l.data
    end
  from public.library l
  where l.id = p_book_id
    and coalesce((l.data->>'isPublished')::boolean, true) = true
    and not exists (
      select 1 from public.library_book_moderation m
      where m.book_id = l.id::text and m.visibility in ('hidden', 'removed')
    );
$$;

revoke all on function public.get_published_book(text) from public;
grant execute on function public.get_published_book(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
