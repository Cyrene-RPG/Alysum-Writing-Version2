-- Stripe SANDBOX foundation only. Review/run manually; this does not modify books,
-- library, existing RLS policies, support links, or any publicly published text.
-- New tables are service-role only. Never grant their contents to browser roles.
begin;

create table if not exists public.paid_access_accounts (
    owner_id uuid primary key references auth.users(id) on delete cascade,
    stripe_account text not null unique check (stripe_account ~ '^acct_[A-Za-z0-9]+$'),
    charges_enabled boolean not null default false,
    updated_at timestamptz not null default now()
);
create table if not exists public.paid_access_oauth_states (
    state_hash text primary key check (length(state_hash) = 64),
    owner_id uuid not null references auth.users(id) on delete cascade,
    expires_at timestamptz not null
);
create table if not exists public.paid_access_offers (
    id uuid primary key,
    owner_id uuid not null references auth.users(id) on delete cascade,
    source_book_id text not null,
    stripe_account text not null,
    title text not null,
    mode text not null check (mode in ('chapter', 'bundle', 'book')),
    amount integer not null check (amount between 50 and 100000),
    currency text not null check (currency in ('usd','gbp','eur','cad','aud')),
    chapters jsonb not null check (jsonb_typeof(chapters) = 'array'),
    paid_chapter_ids jsonb not null check (jsonb_typeof(paid_chapter_ids) = 'array'),
    active boolean not null default true,
    created_at timestamptz not null default now()
);
create table if not exists public.paid_access_orders (
    id uuid primary key,
    offer_id uuid not null references public.paid_access_offers(id),
    buyer_id uuid not null references auth.users(id) on delete cascade,
    stripe_account text not null,
    chapter_ids jsonb not null check (jsonb_typeof(chapter_ids) = 'array'),
    amount integer not null check (amount between 50 and 100000),
    currency text not null,
    stripe_session text unique,
    payment_intent text,
    status text not null default 'pending' check (status in ('pending','paid','reversed','expired')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
-- Avoid two checkouts for the same buyer/edition/chapter set during double clicks.
create unique index if not exists paid_access_orders_open_purchase_idx
    on public.paid_access_orders(buyer_id, offer_id, chapter_ids)
    where status in ('pending','paid');
create index if not exists paid_access_orders_reader_idx on public.paid_access_orders(buyer_id, offer_id, status);
create index if not exists paid_access_orders_intent_idx on public.paid_access_orders(stripe_account, payment_intent);
create table if not exists public.paid_access_events (
    event_id text primary key,
    created_at timestamptz not null default now()
);

alter table public.paid_access_accounts enable row level security;
alter table public.paid_access_oauth_states enable row level security;
alter table public.paid_access_offers enable row level security;
alter table public.paid_access_orders enable row level security;
alter table public.paid_access_events enable row level security;
revoke all on public.paid_access_accounts, public.paid_access_oauth_states, public.paid_access_offers,
    public.paid_access_orders, public.paid_access_events from public, anon, authenticated;
grant select, insert, update, delete on public.paid_access_accounts, public.paid_access_oauth_states,
    public.paid_access_offers, public.paid_access_orders, public.paid_access_events to service_role;

create or replace function public.consume_paid_access_state(p_hash text)
returns table(owner_id uuid) language sql security definer set search_path = public
as $$
    delete from public.paid_access_oauth_states
    where state_hash = p_hash and expires_at > now()
    returning owner_id;
$$;

-- An event and its access change commit together. Reversal is terminal, so late
-- checkout notifications can never restore refunded/disputed access.
create or replace function public.apply_paid_access_event(
    p_event text, p_order uuid, p_account text, p_session text,
    p_intent text, p_amount integer, p_currency text, p_status text
) returns boolean language plpgsql security definer set search_path = public
as $$
declare v_order public.paid_access_orders%rowtype;
begin
    if p_status not in ('paid','reversed') or p_event is null or length(p_event) > 255 then
        raise exception 'Invalid payment event';
    end if;
    select * into v_order from public.paid_access_orders where id = p_order for update;
    if not found or v_order.stripe_account is distinct from p_account
        or v_order.stripe_session is distinct from p_session
        or v_order.amount is distinct from p_amount
        or v_order.currency is distinct from p_currency
        or nullif(p_intent, '') is null
        or (v_order.payment_intent is not null and v_order.payment_intent is distinct from p_intent)
    then raise exception 'Payment does not match the order'; end if;
    insert into public.paid_access_events(event_id) values(p_event) on conflict do nothing;
    if not found then return false; end if;
    update public.paid_access_orders
    set status = case when status = 'reversed' then 'reversed' else p_status end,
        payment_intent = p_intent, updated_at = now()
    where id = p_order;
    return true;
end;
$$;
revoke all on function public.consume_paid_access_state(text) from public, anon, authenticated;
revoke all on function public.apply_paid_access_event(text, uuid, text, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.consume_paid_access_state(text) to service_role;
grant execute on function public.apply_paid_access_event(text, uuid, text, text, text, integer, text, text) to service_role;
commit;
notify pgrst, 'reload schema';
