-- Multi-author Ko-fi account ownership and webhook verification.
begin;
create table if not exists public.kofi_author_accounts (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now()
);
alter table public.kofi_author_accounts enable row level security;
revoke all on public.kofi_author_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.kofi_author_accounts to service_role;
-- Enforce account ownership and product ownership at order registration.
create or replace function public.register_kofi_order(
 p_transaction text,p_email text,p_items jsonb,p_currency text,p_total text,p_owner uuid
) returns boolean language plpgsql security definer set search_path=public as $$
declare item jsonb; product record; expected bigint:=0; paid bigint; n integer; line_no integer:=0;
begin
 if p_owner is null or length(p_transaction) not between 1 and 200
 or length(p_email) not between 3 and 320
 or p_email !~ '^[^ @]+@[^ @]+[.][^ @]+$'
 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 20
 or p_total !~ '^[0-9]{1,7}([.][0-9]{1,2})?$'
 then raise exception 'Invalid order'; end if;
 paid:=round(p_total::numeric*100)::bigint;
 perform pg_advisory_xact_lock(hashtextextended(p_transaction,0));
 if exists(select 1 from public.kofi_orders where transaction_id=p_transaction) then
  if not exists(select 1 from public.kofi_orders where transaction_id=p_transaction
   and buyer_email=p_email and items=p_items and currency=p_currency and amount_cents=paid)
  then raise exception 'Conflicting transaction'; end if;
  return true;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if (item->>'quantity') !~ '^[0-9]{1,2}$' then raise exception 'Invalid quantity'; end if;
  n:=(item->>'quantity')::integer;
  if n not between 1 and 20 then raise exception 'Invalid quantity'; end if;
  select p.id,p.amount,p.currency into product from public.kofi_pass_products m
  join public.purchase_passes p on p.id=m.pass_id
  where m.product_id=item->>'product_id' and m.enabled=true
  and p.sale_enabled=true and p.owner_id=p_owner;
  if not found or product.currency<>p_currency then raise exception 'Unknown product or currency'; end if;
  expected:=expected+product.amount*n;
 end loop;
 if paid<>expected then raise exception 'Payment total mismatch'; end if;
 insert into public.kofi_orders(transaction_id,buyer_email,items,currency,amount_cents)
 values(p_transaction,p_email,p_items,p_currency,paid);
 for item in select value from jsonb_array_elements(p_items) loop
  line_no:=line_no+1;
  select p.id into product from public.kofi_pass_products m
  join public.purchase_passes p on p.id=m.pass_id
  where m.product_id=item->>'product_id' and p.owner_id=p_owner;
  for n in 1..(item->>'quantity')::integer loop
   insert into public.kofi_deliveries(transaction_id,line_number,copy_number,pass_id)
   values(p_transaction,line_no,n,product.id);
  end loop;
 end loop;
 return true;
end;$$;
revoke all on function public.register_kofi_order(text,text,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.register_kofi_order(text,text,jsonb,text,text,uuid) to service_role;
revoke all on function public.register_kofi_order(text,text,jsonb,text,text) from public,anon,authenticated,service_role;
commit;
notify pgrst,'reload schema';
