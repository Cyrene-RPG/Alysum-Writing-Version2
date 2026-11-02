-- Dedicated Beta Reads schema. Apply manually in Supabase SQL editor before enabling the feature.
-- Public visitors never receive direct table access: use a dedicated server API.
create extension if not exists pgcrypto;

create table if not exists public.snippet_beta_reads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_book_id text not null,
  title text not null,
  author_username text not null,
  share_token_hash text not null unique,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists snippet_beta_reads_owner_idx on public.snippet_beta_reads(owner_id,created_at desc);

create table if not exists public.snippet_beta_chapters (
  id uuid primary key default gen_random_uuid(),
  beta_read_id uuid not null references public.snippet_beta_reads(id) on delete cascade,
  source_chapter_id text not null,
  ordinal integer not null check (ordinal >= 0),
  title text not null,
  content text not null,
  unique(beta_read_id,ordinal),
  unique(beta_read_id,source_chapter_id)
);
create table if not exists public.snippet_beta_guests (
  id uuid primary key default gen_random_uuid(),
  beta_read_id uuid not null references public.snippet_beta_reads(id) on delete cascade,
  guest_number integer not null check (guest_number > 0),
  guest_token_hash text not null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique(beta_read_id,guest_number),
  unique(beta_read_id,guest_token_hash)
);
create table if not exists public.snippet_beta_threads (
  id uuid primary key default gen_random_uuid(),
  beta_read_id uuid not null references public.snippet_beta_reads(id) on delete cascade,
  chapter_id uuid not null references public.snippet_beta_chapters(id) on delete cascade,
  quote text not null,
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists snippet_beta_threads_chapter_idx on public.snippet_beta_threads(chapter_id);
create table if not exists public.snippet_beta_comments (
  id uuid primary key default gen_random_uuid(),
  beta_read_id uuid not null references public.snippet_beta_reads(id) on delete cascade,
  thread_id uuid not null references public.snippet_beta_threads(id) on delete cascade,
  guest_id uuid references public.snippet_beta_guests(id),
  author_id uuid references auth.users(id),
  parent_comment_id uuid references public.snippet_beta_comments(id),
  body text not null check (char_length(body) between 1 and 4000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((guest_id is not null) <> (author_id is not null))
);
create index if not exists snippet_beta_comments_thread_idx on public.snippet_beta_comments(thread_id,created_at);

alter table public.snippet_beta_reads enable row level security;
alter table public.snippet_beta_chapters enable row level security;
alter table public.snippet_beta_guests enable row level security;
alter table public.snippet_beta_threads enable row level security;
alter table public.snippet_beta_comments enable row level security;

-- No anonymous or authenticated direct access. Only service-role server
-- handlers can retrieve the manuscript after validating the share token.
revoke all on public.snippet_beta_reads,public.snippet_beta_chapters,
  public.snippet_beta_guests,public.snippet_beta_threads,
  public.snippet_beta_comments from anon,authenticated;
