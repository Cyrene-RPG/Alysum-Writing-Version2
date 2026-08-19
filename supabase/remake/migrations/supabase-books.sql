-- Owner-only manuscript drafts. Not the public library catalog.
-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.books (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null default 'Untitled Book',
    sections jsonb not null default '{"front":[],"body":[],"back":[]}'::jsonb,
    words integer not null default 0,
    media_format text not null default 'novel',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists books_user_id_updated_at_idx
    on public.books (user_id, updated_at desc);

alter table public.books enable row level security;

drop policy if exists books_select_own on public.books;
create policy books_select_own on public.books
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists books_insert_own on public.books;
create policy books_insert_own on public.books
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists books_update_own on public.books;
create policy books_update_own on public.books
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists books_delete_own on public.books;
create policy books_delete_own on public.books
    for delete to authenticated
    using (auth.uid() = user_id);

grant select, insert, update, delete on table public.books to authenticated;
