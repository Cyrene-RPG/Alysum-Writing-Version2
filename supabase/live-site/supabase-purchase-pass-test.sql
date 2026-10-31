-- Purchase Pass TEST LAB only. No real payments, emails or existing entitlements.
-- Run against the existing LIVE schema; never run remake migrations for this.
begin;
create table if not exists public.purchase_pass_tests(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 source_book_id text not null,book_title text not null,title text not null check(length(title) between 1 and 200),
 mode text not null check(mode in ('book','bundle')),amount integer not null check(amount between 1 and 100000),
 currency text not null check(currency in ('USD','GBP','EUR','CAD','AUD')),
 chapters jsonb not null check(jsonb_typeof(chapters)='array' and jsonb_array_length(chapters) between 1 and 500 and octet_length(chapters::text)<=3000000),
 created_at timestamptz not null default now()
);
create table if not exists public.purchase_pass_test_batches(
 id uuid primary key,pass_id uuid not null references public.purchase_pass_tests(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now()
);
create table if not exists public.purchase_pass_test_codes(
 id uuid primary key,batch_id uuid not null references public.purchase_pass_test_batches(id) on delete cascade,
 pass_id uuid not null references public.purchase_pass_tests(id) on delete cascade,
 code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),
 buyer_id uuid references auth.users(id) on delete cascade,canceled boolean not null default false,
 redeemed_at timestamptz
);
create table if not exists public.purchase_pass_test_grants(
 id uuid primary key default gen_random_uuid(),pass_id uuid not null references public.purchase_pass_tests(id) on delete cascade,
 buyer_id uuid not null references auth.users(id) on delete cascade,
 code_id uuid not null unique references public.purchase_pass_test_codes(id) on delete cascade,
 state text not null default 'active' check(state in ('active','revoked')),created_at timestamptz not null default now(),
 unique(pass_id,buyer_id)
);
create index if not exists purchase_pass_tests_owner_idx on public.purchase_pass_tests(owner_id);
create index if not exists purchase_pass_test_codes_pass_idx on public.purchase_pass_test_codes(pass_id,batch_id);
create index if not exists purchase_pass_test_grants_buyer_idx on public.purchase_pass_test_grants(buyer_id,state);
alter table public.purchase_pass_tests enable row level security;
alter table public.purchase_pass_test_batches enable row level security;
alter table public.purchase_pass_test_codes enable row level security;
alter table public.purchase_pass_test_grants enable row level security;
revoke all on public.purchase_pass_tests,public.purchase_pass_test_batches,public.purchase_pass_test_codes,public.purchase_pass_test_grants from public,anon,authenticated;
grant select,insert,update,delete on public.purchase_pass_tests,public.purchase_pass_test_batches,public.purchase_pass_test_codes,public.purchase_pass_test_grants to service_role;

create or replace function public.limit_purchase_pass_tests() returns trigger language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
 if (select count(*) from public.purchase_pass_tests where owner_id=new.owner_id)>=20 then raise exception 'Test limit: 20 passes per author'; end if;
 return new;
end;$$;
drop trigger if exists limit_purchase_pass_tests on public.purchase_pass_tests;
create trigger limit_purchase_pass_tests before insert on public.purchase_pass_tests for each row execute function public.limit_purchase_pass_tests();

create or replace function public.create_purchase_pass_test_batch(p_batch uuid,p_pass uuid,p_owner uuid,p_codes jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare pass public.purchase_pass_tests%rowtype; item jsonb;
begin
 select * into pass from public.purchase_pass_tests where id=p_pass and owner_id=p_owner for update;
 if not found or p_codes is null or jsonb_typeof(p_codes)<>'array' or jsonb_array_length(p_codes) not between 1 and 100 then raise exception 'Invalid test batch'; end if;
 if (select count(*) from public.purchase_pass_test_codes where pass_id=p_pass)+jsonb_array_length(p_codes)>1000 then raise exception 'Test limit: 1000 codes per pass'; end if;
 insert into public.purchase_pass_test_batches(id,pass_id,owner_id) values(p_batch,p_pass,p_owner);
 for item in select value from jsonb_array_elements(p_codes) loop
  insert into public.purchase_pass_test_codes(id,batch_id,pass_id,code_hash) values((item->>'id')::uuid,p_batch,p_pass,item->>'code_hash');
 end loop;
 return true;
end;$$;

create or replace function public.redeem_purchase_pass_test(p_hash text,p_buyer uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare code public.purchase_pass_test_codes%rowtype; existing public.purchase_pass_test_grants%rowtype;
begin
 if p_buyer is null or p_hash is null then raise exception 'Code unavailable'; end if;
 select * into code from public.purchase_pass_test_codes where code_hash=p_hash for update;
 if not found or code.canceled or (code.buyer_id is not null and code.buyer_id<>p_buyer) then raise exception 'Code unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(code.pass_id::text||p_buyer::text,0));
 select * into existing from public.purchase_pass_test_grants where pass_id=code.pass_id and buyer_id=p_buyer for update;
 if found then
  if existing.state<>'active' then raise exception 'Access revoked'; end if;
  return jsonb_build_object('pass_id',code.pass_id,'already_redeemed',true);
 end if;
 if code.buyer_id is not null then raise exception 'Code unavailable'; end if;
 insert into public.purchase_pass_test_grants(pass_id,buyer_id,code_id) values(code.pass_id,p_buyer,code.id);
 update public.purchase_pass_test_codes set buyer_id=p_buyer,redeemed_at=now() where id=code.id;
 return jsonb_build_object('pass_id',code.pass_id,'already_redeemed',false);
end;$$;

create or replace function public.cancel_purchase_pass_test_batch(p_batch uuid,p_pass uuid,p_owner uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.purchase_pass_test_batches where id=p_batch and pass_id=p_pass and owner_id=p_owner) then raise exception 'Batch unavailable'; end if;
 update public.purchase_pass_test_codes set canceled=true where batch_id=p_batch and pass_id=p_pass and buyer_id is null;
 return true;
end;$$;
create or replace function public.purchase_pass_test_version() returns integer language sql immutable as $$select 1$$;
revoke all on function public.limit_purchase_pass_tests(),public.create_purchase_pass_test_batch(uuid,uuid,uuid,jsonb),public.redeem_purchase_pass_test(text,uuid),public.cancel_purchase_pass_test_batch(uuid,uuid,uuid),public.purchase_pass_test_version() from public,anon,authenticated;
grant execute on function public.create_purchase_pass_test_batch(uuid,uuid,uuid,jsonb),public.redeem_purchase_pass_test(text,uuid),public.cancel_purchase_pass_test_batch(uuid,uuid,uuid),public.purchase_pass_test_version() to service_role;
commit;
notify pgrst,'reload schema';
