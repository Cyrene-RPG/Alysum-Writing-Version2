-- Run after supabase-library-hub.sql. Additive and safe to rerun.
-- Only public metadata is returned; no manuscript content or account data.
begin;
create table if not exists public.library_hub_weekly_features(
 week_start date primary key,
 book_id text references public.library(id) on delete set null,
 selected_at timestamptz not null default now()
);
alter table public.library_hub_weekly_features enable row level security;
revoke all on public.library_hub_weekly_features from public,anon,authenticated;
create or replace function public.library_hub_featured() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 w date := date_trunc('week',now() at time zone 'UTC')::date;
 chosen text;
begin
 select book_id into chosen from public.library_hub_weekly_features where week_start=w;
 if chosen is not null and public.library_hub_visible(chosen) then
  return jsonb_build_object('bookId',chosen,'weekStart',w);
 end if;
 -- Serialize first selection and replacement of a withdrawn/moderated feature.
 perform pg_advisory_xact_lock(172940, w-date '2000-01-01');
 select book_id into chosen from public.library_hub_weekly_features where week_start=w;
 if chosen is null or not public.library_hub_visible(chosen) then
  select i.book_id into chosen from public.library_hub_index i where public.library_hub_visible(i.book_id) order by random() limit 1;
  insert into public.library_hub_weekly_features(week_start,book_id) values(w,chosen)
  on conflict(week_start) do update set book_id=excluded.book_id,selected_at=now();
 end if;
 return jsonb_build_object('bookId',chosen,'weekStart',w);
end $$;
revoke all on function public.library_hub_featured() from public,anon,authenticated;
grant execute on function public.library_hub_featured() to anon,authenticated;
commit;
