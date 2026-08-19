-- About me text on Overview / public author profiles.
alter table public.users add column if not exists bio text not null default '';
