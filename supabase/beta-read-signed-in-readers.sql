-- Run once in the Supabase SQL editor before enabling signed-in Beta Readers.
alter table public.snippet_beta_guests
  add column if not exists authenticated_user_id uuid,
  add column if not exists authenticated_username text;
create index if not exists snippet_beta_guests_auth_user_idx
  on public.snippet_beta_guests (beta_read_id, authenticated_user_id)
  where authenticated_user_id is not null;
