-- Run manually after review. Suggestions are separate from comments and snapshots.
create table if not exists public.snippet_beta_suggestions (
  id uuid primary key default gen_random_uuid(),
  beta_read_id uuid not null references public.snippet_beta_reads(id) on delete cascade,
  chapter_id uuid not null references public.snippet_beta_chapters(id) on delete cascade,
  guest_id uuid not null references public.snippet_beta_guests(id) on delete cascade,
  quote text not null,
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  replacement text not null check (char_length(replacement) <= 2000),
  note text not null default '' check (char_length(note) <= 4000),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(quote) between 1 and 2000),
  check (end_offset - start_offset = char_length(quote))
);
create index if not exists snippet_beta_suggestions_chapter_idx
  on public.snippet_beta_suggestions(beta_read_id, chapter_id, created_at);
alter table public.snippet_beta_suggestions enable row level security;
revoke all on public.snippet_beta_suggestions from anon, authenticated;
-- Only the existing service-role API may read or write suggestions.
-- 'accepted' is an approval in the review workspace, not a manuscript edit.
