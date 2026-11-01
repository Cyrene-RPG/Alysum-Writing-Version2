-- LIVE schema only. Apply after supabase-purchase-passes.sql.
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
 currency text not null,
 amount_cents bigint not null,
 state text not null default 'pending' check(state in ('pending','delivered','refunded')),
 created_at timestamptz not null default now()
);
create table if not exists public.kofi_deliveries(
 id uuid primary key default gen_random_uuid(),
 transaction_id text not null references public.kofi_orders(transaction_id),
 line_number integer not null,
 copy_number integer not null,
 pass_id uuid not null references public.purchase_passes(id),
 code_id uuid unique references public.purchase_pass_codes(id),
 code_ciphertext text,
 state text not null default 'pending' check(state in ('pending','sending','sent','refunded')),
 attempts integer not null default 0,
 retry_at timestamptz not null default now(),
 claimed_at timestamptz,
 sent_at timestamptz,
 unique(transaction_id,line_number,copy_number)
);
create index if not exists kofi_deliveries_queue_idx on public.kofi_deliveries(state,retry_at);
alter table public.kofi_pass_products enable row level security;
alter table public.kofi_orders enable row level security;
alter table public.kofi_deliveries enable row level security;
revoke all on public.kofi_pass_products,public.kofi_orders,public.kofi_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.kofi_pass_products,public.kofi_orders,public.kofi_deliveries to service_role;

create or replace function public.register_kofi_order(p_transaction text,p_email text,p_items jsonb,p_currency text,p_total text)
returns boolean language plpgsql security definer set search_path=public as $$
declare item jsonb; product record; expected bigint:=0; paid bigint; n integer; line_no integer:=0;
begin
 if length(p_transaction) not between 1 and 200 or length(p_email) not between 3 and 320
    or p_email !~ '^[^ @]+@[^ @]+\\.[^ @]+$'
    or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 20
    or p_total !~ '^[0-9]{1,7}(\\.[0-9]{1,2})?$' then raise exception 'Invalid order'; end if;
 paid:=round(p_total::numeric*100)::bigint;
 perform pg_advisory_xact_lock(hashtextextended(p_transaction,0));
 if exists(select 1 from public.kofi_orders where transaction_id=p_transaction) then
   if not exists(select 1 from public.kofi_orders where transaction_id=p_transaction and buyer_email=p_email and items=p_items and currency=p_currency and amount_cents=paid) then raise exception 'Conflicting transaction'; end if;
   return true;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if (item->>'quantity') !~ '^[0-9]{1,2}$' then raise exception 'Invalid quantity'; end if;
  n:=(item->>'quantity')::integer;
  if n not between 1 and 20 then raise exception 'Invalid quantity'; end if;
  select p.id,p.amount,p.currency into product from public.kofi_pass_products m
   join public.purchase_passes p on p.id=m.pass_id
   where m.product_id=item->>'product_id' and m.enabled=true and p.sale_enabled=true;
  if not found or product.currency<>p_currency then raise exception 'Unknown product or currency'; end if;
  expected:=expected+product.amount*n;
 end loop;
 if paid<>expected then raise exception 'Payment total mismatch'; end if;
 insert into public.kofi_orders(transaction_id,buyer_email,items,currency,amount_cents)
 values(p_transaction,p_email,p_items,p_currency,paid);
 for item in select value from jsonb_array_elements(p_items) loop
  line_no:=line_no+1;
  select p.id into product from public.kofi_pass_products m join public.purchase_passes p on p.id=m.pass_id
   where m.product_id=item->>'product_id';
  for n in 1..(item->>'quantity')::integer loop
   insert into public.kofi_deliveries(transaction_id,line_number,copy_number,pass_id)
   values(p_transaction,line_no,n,product.id);
  end loop;
 end loop;
 return true;
end;$$;

create or replace function public.claim_kofi_delivery(p_code_id uuid,p_code_hash text,p_ciphertext text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare job public.kofi_deliveries%rowtype; email text; owner uuid; batch uuid;
begin
 select * into job from public.kofi_deliveries
 where (state='pending' or (state='sending' and claimed_at<now()-interval '5 minutes'))
 and retry_at<=now() order by retry_at,id for update skip locked limit 1;
 if not found then return null; end if;
 select buyer_email into email from public.kofi_orders where transaction_id=job.transaction_id and state='pending';
 if email is null then return null; end if;
 if job.code_id is null then
  select owner_id into owner from public.purchase_passes where id=job.pass_id;
  batch:=gen_random_uuid();
  insert into public.purchase_pass_batches(id,pass_id,owner_id) values(batch,job.pass_id,owner);
  insert into public.purchase_pass_codes(id,batch_id,pass_id,code_hash) values(p_code_id,batch,job.pass_id,p_code_hash);
  update public.kofi_deliveries set code_id=p_code_id,code_ciphertext=p_ciphertext where id=job.id;
  job.code_ciphertext:=p_ciphertext;
 end if;
 update public.kofi_deliveries set state='sending',claimed_at=now(),attempts=attempts+1 where id=job.id;
 return jsonb_build_object('id',job.id,'email',email,'ciphertext',job.code_ciphertext,'pass_id',job.pass_id);
end;$$;
create or replace function public.finish_kofi_delivery(p_id uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.kofi_deliveries set state=case when p_success then 'sent' else 'pending' end,
 retry_at=case when p_success then now() else now()+interval '5 minutes' end,
 sent_at=case when p_success then now() else sent_at end
 where id=p_id and state='sending';
 return found;
end;$$;
create or replace function public.refund_kofi_order(p_transaction text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.kofi_orders set state='refunded' where transaction_id=p_transaction;
 update public.purchase_pass_codes set canceled=true where id in
 (select code_id from public.kofi_deliveries where transaction_id=p_transaction);
 update public.purchase_pass_grants set state='revoked' where code_id in
 (select code_id from public.kofi_deliveries where transaction_id=p_transaction);
 update public.kofi_deliveries set state='refunded' where transaction_id=p_transaction;
 return true;
end;$$;
revoke all on function public.register_kofi_order(text,text,jsonb,text,text),public.claim_kofi_delivery(uuid,text,text),public.finish_kofi_delivery(uuid,boolean),public.refund_kofi_order(text) from public,anon,authenticated;
grant execute on function public.register_kofi_order(text,text,jsonb,text,text),public.claim_kofi_delivery(uuid,text,text),public.finish_kofi_delivery(uuid,boolean),public.refund_kofi_order(text) to service_role;
commit;
notify pgrst,'reload schema';
