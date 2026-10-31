-- Run AFTER supabase-author-chapter-access.sql in the LIVE Supabase project.
-- EPUB files are private; readers receive short-lived links only after full-book access.
begin;
create table if not exists public.epub_editions (
 book_id text primary key references public.books(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique,
 file_name text not null check(char_length(file_name) between 1 and 250),
 chapter_ids jsonb not null check(jsonb_typeof(chapter_ids)='array' and jsonb_array_length(chapter_ids) between 1 and 500),
 created_at timestamptz not null default now(),
 check(storage_path like owner_id::text||'/'||book_id||'/%.epub')
);
alter table public.epub_editions enable row level security;
revoke all on public.epub_editions from anon,authenticated;
grant select,insert on public.epub_editions to authenticated;
grant all on public.epub_editions to service_role;
drop policy if exists epub_owner_read on public.epub_editions;
create policy epub_owner_read on public.epub_editions for select to authenticated using(owner_id=auth.uid());
drop policy if exists epub_owner_insert on public.epub_editions;
create policy epub_owner_insert on public.epub_editions for insert to authenticated with check(
 owner_id=auth.uid() and exists(select 1 from public.books b where b.id=book_id and b.user_id=auth.uid())
 and exists(select 1 from storage.objects o where o.bucket_id='book-epubs' and o.name=storage_path)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('book-epubs','book-epubs',false,31457280,array['application/epub+zip'])
on conflict(id) do update set public=false,file_size_limit=31457280,allowed_mime_types=array['application/epub+zip'];
drop policy if exists epub_upload on storage.objects;
create policy epub_upload on storage.objects for insert to authenticated with check(
 bucket_id='book-epubs' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.books b where b.id=(storage.foldername(name))[2] and b.user_id=auth.uid())
);
drop policy if exists epub_owner_file on storage.objects;
create policy epub_owner_file on storage.objects for select to authenticated using(bucket_id='book-epubs' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists epub_remove on storage.objects;
create policy epub_remove on storage.objects for delete to authenticated using(bucket_id='book-epubs' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
