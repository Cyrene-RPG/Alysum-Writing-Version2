-- Run once in Supabase SQL Editor to retain Ko-fi webhook diagnostics.
-- No buyer emails, transaction IDs, tokens, or raw payloads are stored.
create table if not exists public.kofi_webhook_events (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 stage text not null check (stage in ('verified_shop_order','invalid_order','registration_failed','order_registered')),
 reason text,
 http_status integer
);
create index if not exists kofi_webhook_events_recent_idx on public.kofi_webhook_events(created_at desc);
alter table public.kofi_webhook_events enable row level security;
revoke all on public.kofi_webhook_events from public, anon, authenticated;
grant select, insert on public.kofi_webhook_events to service_role;
comment on table public.kofi_webhook_events is 'Privacy-safe webhook processing stages. Accessible only to service role.';
