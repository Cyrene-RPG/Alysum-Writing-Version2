-- Run once in Supabase → SQL Editor. Replaces the 2026-10-01 fix (security_invoker = false).
--
-- Logged-out visitors read the library through library_catalog. The view must not run with the
-- visitor's rights (anon cannot read public.library, which holds chapter text), and it must not
-- skip the table's row rules either. So the rules live in one function that runs as owner and
-- applies them itself:
--   * published books only
--   * books moderators set to hidden or removed are left out
--   * anonymous books do not expose the owner's account id
--   * chapter text is stripped (library_strip_chapter_content)
-- The view itself runs as the visitor (security_invoker = true), which clears Supabase's
-- "Security Definer View" warning. Columns and types are unchanged: id text, user_id uuid, data jsonb.
-- One transaction: if any step fails (for example something depends on the view), nothing changes.

begin;

create or replace function public.library_catalog_rows()
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
    public.library_strip_chapter_content(l.data)
  from public.library l
  where coalesce((l.data->>'isPublished')::boolean, true) = true
    and not exists (
      select 1 from public.library_book_moderation m
      where m.book_id = l.id::text and m.visibility in ('hidden', 'removed')
    );
$$;

revoke all on function public.library_catalog_rows() from public;
grant execute on function public.library_catalog_rows() to anon, authenticated;

drop view public.library_catalog;
create view public.library_catalog with (security_invoker = true) as
  select * from public.library_catalog_rows();
grant select on public.library_catalog to anon, authenticated;

commit;

notify pgrst, 'reload schema';
