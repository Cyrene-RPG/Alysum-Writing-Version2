-- Additive migration for the LIVE schema only. Do not run against remake.
begin;
create table if not exists public.kofi_pass_products(
 product_id text primary key,
 pass_id uuid not null references public.purchase_passes(id),
 enabled boolean not null default false
);
create table if not exists public.kofi_orders(
 transaction_id text primary key,
 buyer_email text not null,
 items jsonb not null,
 state text not null default 'pending' check(state in ('pending','delivered','failed')),
 created_at timestamptz not null default now()
);
alter table public.kofi_pass_products enable row level security;
alter table public.kofi_orders enable row level security;
revoke all on public.kofi_pass_products,public.kofi_orders from public,anon,authenticated;
grant select,insert,update,delete on public.kofi_pass_products,public.kofi_orders to service_role;
create or replace function public.register_kofi_order(p_transaction text,p_email text,p_items jsonb,p_currency text,p_total text)
returns boolean language plpgsql security definer set search_path=public as $$
declare item jsonb; expected_total bigint:=0; paid_total bigint; product record;
begin
 if length(p_transaction) not between 1 and 200 or length(p_email) not between 3 and 320 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Invalid order'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if not exists(select 1 from public.kofi_pass_products where product_id=item->>'product_id' and enabled=true) then raise exception 'Unknown product'; end if;
  if (item->>'quantity')::integer not between 1 and 20 then raise exception 'Invalid quantity'; end if;
  select p.amount,p.currency into product from public.kofi_pass_products m join public.purchase_passes p on p.id=m.pass_id where m.product_id=item->>'product_id' and m.enabled=true;
  if product.currency<>p_currency then raise exception 'Currency mismatch'; end if;
  expected_total:=expected_total+product.amount*(item->>'quantity')::integer;
 end loop;
 if p_total !~ '^[0-9]{1,7}(\\.[0-9]{1,2})?,buyer_email,items) values(p_transaction,p_email,p_items)
 on conflict(transaction_id) do nothing;
 if exists(select 1 from public.kofi_orders where transaction_id=p_transaction and (buyer_email<>p_email or items<>p_items)) then raise exception 'Conflicting transaction'; end if;
 return true;
end;$$;
revoke all on function public.register_kofi_order(text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.register_kofi_order(text,text,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
 then raise exception 'Invalid amount'; end if;
 paid_total:=round(p_total::numeric*100)::bigint;
 if paid_total<>expected_total then raise exception 'Payment amount mismatch'; end if;
 insert into public.kofi_orders(transaction_id,buyer_email,items) values(p_transaction,p_email,p_items)
 on conflict(transaction_id) do nothing;
 if exists(select 1 from public.kofi_orders where transaction_id=p_transaction and (buyer_email<>p_email or items<>p_items)) then raise exception 'Conflicting transaction'; end if;
 return true;
end;$$;
revoke all on function public.register_kofi_order(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_kofi_order(text,text,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
