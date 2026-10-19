-- Private chapter storage and author-owned Ko-fi/Payhip purchase confirmations.
-- Uses the existing Supabase service-role server setting. No Stripe platform setup.
begin;
create table if not exists public.author_access_connections (
    id uuid primary key,
    owner_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('kofi','payhip')),
    verifier_hash text not null check (verifier_hash ~ '^[0-9a-f]{64}$'),
    enabled boolean not null default true,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    unique(owner_id,provider)
);
create table if not exists public.author_access_books (
    book_id text primary key references public.books(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade,
    connection_id uuid references public.author_access_connections(id),
    product_key text not null default '',
    purchase_url text not null default '',
    minimum_amount integer not null default 0,
    currency text not null default '',
    chapters jsonb not null default '[]'::jsonb check (jsonb_typeof(chapters)='array'),
    chapter_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(chapter_ids)='array'),
    updated_at timestamptz not null default now()
);
create table if not exists public.author_access_transactions (
    connection_id uuid not null references public.author_access_connections(id) on delete cascade,
    transaction_id text not null,
    email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
    amount integer not null,
    currency text not null,
    reversed boolean not null default false,
    primary key(connection_id,transaction_id)
);
create table if not exists public.author_access_sales (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    book_id text not null references public.author_access_books(book_id) on delete cascade,
    connection_id uuid not null,
    transaction_id text not null,
    email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
    buyer_id uuid references auth.users(id) on delete set null,
    chapter_ids jsonb not null check (jsonb_typeof(chapter_ids)='array'),
    status text not null check (status in ('paid','reversed')),
    created_at timestamptz not null default now(),
    unique(connection_id,transaction_id,book_id),
    foreign key(connection_id,transaction_id) references public.author_access_transactions(connection_id,transaction_id) on delete cascade
);
create index if not exists author_access_sales_reader_idx on public.author_access_sales(book_id,buyer_id,email_hash,status);
alter table public.author_access_connections enable row level security;
alter table public.author_access_books enable row level security;
alter table public.author_access_transactions enable row level security;
alter table public.author_access_sales enable row level security;
revoke all on public.author_access_connections,public.author_access_books,public.author_access_transactions,public.author_access_sales from public,anon,authenticated;
grant select,insert,update,delete on public.author_access_connections,public.author_access_books,public.author_access_transactions,public.author_access_sales to service_role;

-- Server and public writes both strip locked chapter bodies from Library JSON.
create or replace function public.protect_author_access_listing()
returns trigger language plpgsql security definer set search_path=public
as $$
declare config public.author_access_books%rowtype;
begin
    perform pg_advisory_xact_lock(hashtextextended(new.id::text,0));
    select * into config from public.author_access_books where book_id=new.id::text;
    if not found or jsonb_array_length(config.chapter_ids)=0 then return new; end if;
    if new.user_id is distinct from config.owner_id then raise exception 'Book ownership does not match'; end if;
    new.data=jsonb_set(new.data,'{chapters}',coalesce((
        select jsonb_agg(case when config.chapter_ids ? (c.chapter->>'id') then
            jsonb_build_object('id',c.chapter->>'id','title',coalesce(p.chapter->>'title','Untitled'),
                'wordCount',coalesce((p.chapter->>'wordCount')::integer,0),'content','','locked',true,'purchaseUrl',config.purchase_url)
            else c.chapter end order by c.position)
        from jsonb_array_elements(coalesce(new.data->'chapters','[]'::jsonb)) with ordinality c(chapter,position)
        left join lateral (select value as chapter from jsonb_array_elements(config.chapters) where value->>'id'=c.chapter->>'id' limit 1) p on true
    ),'[]'::jsonb),true);
    return new;
end;
$$;
drop trigger if exists protect_author_access_listing on public.library;
create trigger protect_author_access_listing before insert or update on public.library for each row execute function public.protect_author_access_listing();

create or replace function public.save_author_access_book(p_book text,p_owner uuid,p_connection uuid,p_product text,p_url text,p_minimum integer,p_currency text,p_chapters jsonb)
returns void language plpgsql security definer set search_path=public
as $$
begin
    perform pg_advisory_xact_lock(hashtextextended(p_book,0));
    if not exists(select 1 from public.books where id=p_book and user_id=p_owner) then raise exception 'Book not owned'; end if;
    if jsonb_typeof(p_chapters) is distinct from 'array' then raise exception 'Invalid chapters'; end if;
    if jsonb_array_length(p_chapters)>0 and not exists(select 1 from public.author_access_connections where id=p_connection and owner_id=p_owner and enabled) then raise exception 'Connection not owned'; end if;
    insert into public.author_access_books(book_id,owner_id,connection_id,product_key,purchase_url,minimum_amount,currency,chapters,chapter_ids)
    values(p_book,p_owner,p_connection,p_product,p_url,p_minimum,p_currency,p_chapters,
        coalesce((select jsonb_agg(value->>'id') from jsonb_array_elements(p_chapters)),'[]'::jsonb))
    on conflict(book_id) do update set connection_id=excluded.connection_id,product_key=excluded.product_key,purchase_url=excluded.purchase_url,
        minimum_amount=excluded.minimum_amount,currency=excluded.currency,chapters=excluded.chapters,chapter_ids=excluded.chapter_ids,updated_at=now();
    -- Remove previously public bodies immediately when a chapter becomes locked.
    update public.library set data=data where id=p_book and user_id=p_owner;
end;
$$;

create or replace function public.apply_author_access_sale(p_connection uuid,p_transaction text,p_email_hash text,p_products jsonb,p_amount integer,p_currency text,p_reversed boolean)
returns void language plpgsql security definer set search_path=public
as $$
declare prior public.author_access_transactions%rowtype; is_reversed boolean;
begin
    perform pg_advisory_xact_lock(hashtextextended(p_connection::text||':'||p_transaction,0));
    if not exists(select 1 from public.author_access_connections where id=p_connection and enabled) then raise exception 'Connection unavailable'; end if;
    select * into prior from public.author_access_transactions where connection_id=p_connection and transaction_id=p_transaction;
    if found and (prior.email_hash is distinct from p_email_hash or prior.amount is distinct from p_amount or prior.currency is distinct from p_currency) then raise exception 'Sale does not match'; end if;
    insert into public.author_access_transactions(connection_id,transaction_id,email_hash,amount,currency,reversed)
    values(p_connection,p_transaction,p_email_hash,p_amount,p_currency,p_reversed)
    on conflict(connection_id,transaction_id) do update set reversed=author_access_transactions.reversed or excluded.reversed
    returning reversed into is_reversed;
    if is_reversed then
        update public.author_access_sales set status='reversed' where connection_id=p_connection and transaction_id=p_transaction;
    else
        insert into public.author_access_sales(owner_id,book_id,connection_id,transaction_id,email_hash,chapter_ids,status)
        select owner_id,book_id,p_connection,p_transaction,p_email_hash,chapter_ids,'paid' from public.author_access_books
        where connection_id=p_connection and p_products ? product_key and currency=p_currency and minimum_amount<=p_amount and jsonb_array_length(chapter_ids)>0
        on conflict(connection_id,transaction_id,book_id) do nothing;
    end if;
    update public.author_access_connections set verified_at=now() where id=p_connection;
end;
$$;

create or replace function public.read_author_access(p_book text,p_reader uuid,p_email_hash text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare config public.author_access_books%rowtype; listing jsonb; result jsonb;
begin
    if p_reader is null then return '[]'::jsonb; end if;
    select * into config from public.author_access_books where book_id=p_book;
    if not found then return '[]'::jsonb; end if;
    select data into listing from public.library where id=p_book and user_id=config.owner_id and coalesce((data->>'isPublished')::boolean,true)
        and not exists(select 1 from public.library_book_moderation where book_id=p_book and visibility in ('hidden','removed'));
    if listing is null then return '[]'::jsonb; end if;
    -- Claim only against the server-verified account email. Access then follows that account.
    update public.author_access_sales set buyer_id=p_reader where book_id=p_book and buyer_id is null and email_hash=p_email_hash and status='paid';
    select coalesce(jsonb_agg(jsonb_build_object('id',c.chapter->>'id','text',c.chapter->>'text')),'[]'::jsonb) into result
    from jsonb_array_elements(config.chapters) c(chapter)
    where exists(select 1 from jsonb_array_elements(coalesce(listing->'chapters','[]'::jsonb)) l(chapter)
        where l.chapter->>'id'=c.chapter->>'id' and l.chapter->>'locked'='true'
        and (coalesce(listing->'publishedChapterIds','[]'::jsonb) ? (c.chapter->>'id')))
      and (config.owner_id=p_reader or exists(select 1 from public.author_access_sales s where s.book_id=p_book and s.buyer_id=p_reader and s.status='paid' and s.chapter_ids ? (c.chapter->>'id')));
    return result;
end;
$$;
revoke all on function public.protect_author_access_listing() from public,anon,authenticated;
revoke all on function public.save_author_access_book(text,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_author_access_sale(uuid,text,text,jsonb,integer,text,boolean) from public,anon,authenticated;
revoke all on function public.read_author_access(text,uuid,text) from public,anon,authenticated;
grant execute on function public.save_author_access_book(text,uuid,uuid,text,text,integer,text,jsonb), public.apply_author_access_sale(uuid,text,text,jsonb,integer,text,boolean), public.read_author_access(text,uuid,text) to service_role;
commit;
notify pgrst,'reload schema';
