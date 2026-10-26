-- Library overhaul: public metadata discovery, private reading state, and opt-in public lists.
-- Run in the live Supabase SQL Editor after existing Library/public-reading migrations.
-- Transactional, additive, and safe to re-run. Existing books and local reading data are not deleted.
begin;
create or replace function public.library_hub_time(v text) returns timestamptz language plpgsql immutable set search_path=pg_catalog as $$
begin
 if v is null or btrim(v)='' then return null; end if;
 if v ~ '^[0-9]+([.][0-9]+)?$' and length(v)<20 then return to_timestamp(case when v::numeric>100000000000 then v::numeric/1000 else v::numeric end); end if;
 return v::timestamptz;
exception when others then return null; end; $$;
create or replace function public.library_hub_number(v text) returns bigint language sql immutable set search_path=pg_catalog as $$
 select case when length(v)<16 and v ~ '^[0-9]+([.][0-9]+)?$' then least(floor(v::numeric),100000000)::bigint else 0::bigint end; $$;
create or replace function public.library_hub_strings(v jsonb) returns text[] language sql immutable set search_path=pg_catalog as $$
 select coalesce(array_agg(x order by pos),array[]::text[]) from (select lower(btrim(value#>>'{}')) x,min(ord) pos from jsonb_array_elements(case when jsonb_typeof(v)='array' then v else '[]'::jsonb end) with ordinality a(value,ord) where jsonb_typeof(value)='string' and length(btrim(value#>>'{}')) between 1 and 80 group by lower(btrim(value#>>'{}')) order by min(ord) limit 40) q; $$;
create or replace function public.library_hub_released_ids(d jsonb) returns setof text language sql immutable set search_path=pg_catalog,public as $$
 select c->>'id' from jsonb_array_elements(case when jsonb_typeof(d->'chapters')='array' then d->'chapters' else '[]'::jsonb end) c
 where coalesce(c->>'id','')<>'' and (jsonb_typeof(coalesce(d->'publishedChapterIds',d->'published_chapter_ids')) is distinct from 'array' or coalesce(d->'publishedChapterIds',d->'published_chapter_ids') ? (c->>'id'))
 and (coalesce(d->>'mediaFormat',d->>'media_format','novel') in ('comic','manga','manhwa') or coalesce(c->>'wordCount',c->>'word_count') is null or public.library_hub_number(coalesce(c->>'wordCount',c->>'word_count'))>=500); $$;
create table if not exists public.library_hub_index(
 book_id text primary key references public.library(id) on delete cascade,owner_id uuid,meta jsonb not null,
 genres text[] not null default '{}',tags text[] not null default '{}',warnings text[] not null default '{}',
 status text not null,words bigint not null default 0,chapters integer not null default 0,paid boolean not null default false,
 published_at timestamptz,search_document tsvector not null
);
create index if not exists library_hub_search on public.library_hub_index using gin(search_document);
create index if not exists library_hub_genres on public.library_hub_index using gin(genres);
create index if not exists library_hub_tags on public.library_hub_index using gin(tags);
create index if not exists library_hub_newest on public.library_hub_index(published_at desc,book_id);
create table if not exists public.library_hub_releases(book_id text not null references public.library(id) on delete cascade,chapter_id text not null,released_at timestamptz,primary key(book_id,chapter_id));
alter table public.library_hub_index enable row level security;
alter table public.library_hub_releases enable row level security;
revoke all on public.library_hub_index,public.library_hub_releases from public,anon,authenticated;
create or replace function public.library_hub_refresh(p_book text,p_seed boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.library%rowtype;d jsonb;c jsonb;g text[];t text[];w text[];n integer:=0;wc bigint:=0;is_paid boolean:=false;anonymous boolean;published timestamptz;m jsonb;
begin
 select * into l from public.library where id=p_book;
 if not found then return; end if;
 d:=l.data;
 if d->>'isPublished'='false' then return;end if;
 g:=public.library_hub_strings(coalesce(d->'genres',jsonb_build_array(d->>'genre')));t:=public.library_hub_strings(d->'tags');w:=public.library_hub_strings(coalesce(d->'warnings','[]'::jsonb)||coalesce((select jsonb_agg(e->>'label') from jsonb_array_elements(case when jsonb_typeof(d->'warningMeta'->'entries')='array' then d->'warningMeta'->'entries' else '[]'::jsonb end) e where e->>'scope' is distinct from 'chapters' or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(e->'chapterIds')='array' then e->'chapterIds' else '[]'::jsonb end) ci where ci in(select public.library_hub_released_ids(d)))),'[]'::jsonb));
 for c in select value from jsonb_array_elements(case when jsonb_typeof(d->'chapters')='array' then d->'chapters' else '[]'::jsonb end) loop
  if coalesce(c->>'id','')='' then continue;end if;
  if jsonb_typeof(coalesce(d->'publishedChapterIds',d->'published_chapter_ids'))='array' and not(coalesce(d->'publishedChapterIds',d->'published_chapter_ids') ? (c->>'id')) then continue;end if;
  if coalesce(c->>'wordCount',c->>'word_count') is not null and public.library_hub_number(coalesce(c->>'wordCount',c->>'word_count'))<500 and coalesce(d->>'mediaFormat',d->>'media_format','novel') not in ('comic','manga','manhwa') then continue;end if;
  n:=n+1;wc:=wc+public.library_hub_number(coalesce(c->>'wordCount',c->>'word_count'));
  is_paid:=is_paid or c->>'locked'='true';
  insert into public.library_hub_releases(book_id,chapter_id,released_at) values(p_book,c->>'id',case when p_seed then public.library_hub_time(c->>'publishedAt') else now() end) on conflict do nothing;
 end loop;
 anonymous:=coalesce(d->>'isAnonymous',d->>'is_anonymous','false')='true';
 published:=coalesce(public.library_hub_time(coalesce(d->>'publishedAt',d->>'published_at')),public.library_hub_time(to_jsonb(l)->>'created_at'));
 if published is not null then published:=least(published,now());end if;
 published:=coalesce((select published_at from public.library_hub_index where book_id=p_book),published);
 m:=jsonb_build_object('id',p_book,'ownerId',case when anonymous then null else l.user_id end,'anonymous',anonymous,
 'title',left(coalesce(nullif(d->>'title',''),'Untitled'),300),'author',case when anonymous then 'Anonymous' else left(coalesce(nullif(d->>'author',''),'Unknown author'),160) end,
 'summary',left(coalesce(d->>'summary',''),3000),'coverUrl',coalesce(d->>'coverUrl',d->>'cover_url',''),'coverCrop',coalesce(d->'coverCrop',d->'cover_crop'),
 'genres',g,'tags',t,'warnings',w,'rating',coalesce(d->>'rating',''),'format',case when coalesce(d->>'mediaFormat',d->>'media_format') in ('comic','manga','manhwa','screenplay') then coalesce(d->>'mediaFormat',d->>'media_format') else 'novel' end,
 'status',case when coalesce(d->>'serializationStatus',d->>'serialization_status') in ('complete','completed') then 'complete' else 'in_progress' end,
 'chapters',n,'words',wc,'paid',coalesce(is_paid,false),'publishedAt',published);
 insert into public.library_hub_index(book_id,owner_id,meta,genres,tags,warnings,status,words,chapters,paid,published_at,search_document)
 values(p_book,l.user_id,m,g,t,w,m->>'status',wc,n,coalesce(is_paid,false),published,
 setweight(to_tsvector('simple',m->>'title'),'A')||setweight(to_tsvector('simple',m->>'author'),'A')||setweight(to_tsvector('simple',array_to_string(g||t,' ')||case when 'scifi'=any(g) then ' science fiction sci fi' else '' end||case when 'slice'=any(g) then ' slice of life' else '' end),'B')||setweight(to_tsvector('simple',m->>'summary'),'C'))
 on conflict(book_id) do update set owner_id=excluded.owner_id,meta=excluded.meta,genres=excluded.genres,tags=excluded.tags,warnings=excluded.warnings,status=excluded.status,words=excluded.words,chapters=excluded.chapters,paid=excluded.paid,published_at=excluded.published_at,search_document=excluded.search_document;
end; $$;
create or replace function public.library_hub_index_trigger() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$ begin perform public.library_hub_refresh(NEW.id,false);return NEW;end; $$;
lock table public.library in share row exclusive mode;
do $$ declare b record;begin for b in select id from public.library loop perform public.library_hub_refresh(b.id,true);end loop;end $$;
drop trigger if exists refresh_library_hub on public.library;
create trigger refresh_library_hub after insert or update of data on public.library for each row execute function public.library_hub_index_trigger();

create or replace function public.library_hub_visible(p_book text) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.library l where l.id=p_book and exists(select 1 from public.library_hub_index i where i.book_id=l.id and i.chapters>0) and coalesce(l.data->>'isPublished','true')<>'false' and not exists(select 1 from public.library_book_moderation m where m.book_id=l.id and m.visibility in ('hidden','removed'))) and public.mc_visible(p_book); $$;
create table if not exists public.library_hub_reader_state(user_id uuid not null references auth.users(id) on delete cascade,kind text not null check(kind in ('read-position','shelves','finished-chapters','bookmarks','preferences')),book_id text not null check(length(book_id) between 1 and 200),value jsonb,updated_at timestamptz not null default now(),primary key(user_id,kind,book_id));
create or replace function public.library_hub_query(p_filters jsonb default '{}',p_offset integer default 0,p_limit integer default 24) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;q text:=left(btrim(coalesce(p_filters->>'q','')),200);sort_by text:=coalesce(p_filters->>'sort','new');wanted_genres text[]:=public.library_hub_strings(p_filters->'genres');wanted_tags text[]:=public.library_hub_strings(p_filters->'tags');excluded_tags text[]:=public.library_hub_strings(p_filters->'excludeTags');excluded_warnings text[]:=public.library_hub_strings(p_filters->'excludeWarnings');ids text[]:=array(select value#>>'{}' from jsonb_array_elements(case when jsonb_typeof(p_filters->'ids')='array' then p_filters->'ids' else '[]'::jsonb end) where jsonb_typeof(value)='string' limit 200);
begin
 if p_filters->>'expectedUser' is not null and p_filters->>'expectedUser' is distinct from auth.uid()::text then raise exception 'Reading account changed.';end if;
 if p_offset is null or p_offset<0 or p_offset>10000 or p_limit is null or p_limit<1 or p_limit>48 then raise exception 'Invalid library page.';end if;
 with activity as(select r.book_id,count(distinct r.user_id) readers,count(distinct r.user_id) filter(where r.created_at>=now()-interval '7 days') weekly from public.reads r join public.library b on b.id=r.book_id where r.user_id is not null and r.user_id is distinct from b.user_id group by r.book_id),
 base as(select i.*,coalesce(a.readers,0) readers,coalesce(a.weekly,0) weekly,(select max(h.released_at) from public.library_hub_releases h where h.book_id=i.book_id and exists(select 1 from public.library_hub_released_ids(l.data) ch where ch=h.chapter_id)) released,
 case when lower(i.meta->>'title')=lower(q) then 10 when lower(i.meta->>'author')=lower(q) then 8 else ts_rank(i.search_document,websearch_to_tsquery('simple',q)) end relevance
 from public.library_hub_index i join public.library l on l.id=i.book_id left join activity a on a.book_id=i.book_id where public.library_hub_visible(i.book_id)
 and (cardinality(ids)=0 or i.book_id=any(ids))
 and (coalesce(p_filters->>'shelf','')='' or
  (auth.uid() is not null and (
   (p_filters->>'shelf' in ('want','reading','finished') and exists(select 1 from public.library_hub_reader_state st where st.user_id=auth.uid() and st.kind='shelves' and st.book_id=i.book_id and st.value#>>'{}'=p_filters->>'shelf'))
   or (p_filters->>'shelf'='reading' and exists(select 1 from public.library_hub_reader_state st where st.user_id=auth.uid() and st.kind='read-position' and st.book_id=i.book_id and st.value is not null and public.library_hub_number(st.value->>'progress')<100) and not exists(select 1 from public.library_hub_reader_state st where st.user_id=auth.uid() and st.kind='shelves' and st.book_id=i.book_id and st.value#>>'{}' in ('want','finished')))
   or (p_filters->>'shelf'='subscriptions' and exists(select 1 from public.book_subscriptions sub where sub.subscriber_id=auth.uid() and sub.book_id=i.book_id))
  )))
 and (q='' or i.search_document@@websearch_to_tsquery('simple',q) or strpos(lower(i.meta->>'title'),lower(q))>0 or strpos(lower(i.meta->>'author'),lower(q))>0 or strpos(lower(array_to_string(i.genres||i.tags,' ')),lower(q))>0)
 and (cardinality(wanted_genres)=0 or i.genres&&wanted_genres) and i.tags@>wanted_tags and not(i.tags&&excluded_tags) and not(i.warnings&&excluded_warnings)
 and (coalesce(p_filters->>'status','') in ('','all') or i.status=p_filters->>'status')
 and (coalesce(p_filters->>'format','') in ('','all') or i.meta->>'format'=p_filters->>'format')
 and (coalesce(p_filters->>'rating','') in ('','all') or i.meta->>'rating'=p_filters->>'rating')
 and (coalesce(p_filters->>'availability','') in ('','all') or (p_filters->>'availability'='free' and not i.paid) or (p_filters->>'availability'='paid' and i.paid))
 and (coalesce(p_filters->>'length','') in ('','all') or (p_filters->>'length'='short' and i.words between 1 and 9999) or (p_filters->>'length'='medium' and i.words between 10000 and 49999) or (p_filters->>'length'='long' and i.words>=50000))),
 filtered as(select * from base where sort_by<>'updated' or released is not null),
 page as(select * from filtered order by case when q<>'' then relevance end desc,
 case when sort_by='popular' then readers end desc,case when sort_by='trending' then weekly end desc,
 case when sort_by='gems' then readers end asc,case when sort_by='gems' then md5(book_id||current_date::text) end,
 case when sort_by='az' then lower(meta->>'title') end,case when sort_by='updated' then released end desc nulls last,
 published_at desc nulls last,book_id limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(meta||jsonb_build_object('readers',readers,'weeklyReaders',weekly,'lastReleaseAt',released)) from page),'[]'::jsonb),'total',(select count(*) from filtered),'offset',p_offset,'pageSize',p_limit,'hasMore',(select count(*) from filtered)>p_offset+p_limit) into result;
 return result;
end; $$;
create or replace function public.library_hub_facets() returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object(
 'genres',coalesce((select jsonb_agg(jsonb_build_object('id',g,'count',n) order by n desc,g) from(select g,count(*) n from public.library_hub_index i cross join lateral unnest(i.genres) g where public.library_hub_visible(i.book_id) group by g) q),'[]'::jsonb),
 'tags',coalesce((select jsonb_agg(t order by n desc,t) from(select t,count(*) n from public.library_hub_index i cross join lateral unnest(i.tags) t where public.library_hub_visible(i.book_id) group by t order by count(*) desc limit 60) q),'[]'::jsonb),
 'warnings',coalesce((select jsonb_agg(w order by w) from(select distinct w from public.library_hub_index i cross join lateral unnest(i.warnings) w where public.library_hub_visible(i.book_id)) q),'[]'::jsonb)); $$;

alter table public.library_hub_reader_state enable row level security;
revoke all on public.library_hub_reader_state from public,anon,authenticated;
create or replace function public.library_hub_state(p_user uuid,p_kind text default null,p_book text default null,p_value jsonb default null,p_write boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if auth.uid() is null or auth.uid() is distinct from p_user then raise exception 'Sign in to your own Library account.';end if;
 if p_write then
  if p_kind not in ('read-position','shelves','finished-chapters','bookmarks','preferences') or p_kind is null or p_book is null or length(p_book) not between 1 and 200 or octet_length(coalesce(p_value,'null')::text)>16384 then raise exception 'Invalid reading state.';end if;
  if p_kind='shelves' and p_value is not null and p_value<>'null'::jsonb and p_value not in ('"reading"'::jsonb,'"want"'::jsonb,'"finished"'::jsonb) then raise exception 'Choose a shelf.';end if;
  if p_kind='preferences' and (p_book<>'discovery' or jsonb_typeof(p_value)<>'object' or cardinality(public.library_hub_strings(p_value->'genres'))>12) then raise exception 'Choose up to twelve genres.';end if;
  if not exists(select 1 from public.library_hub_reader_state where user_id=p_user and kind=p_kind and book_id=p_book) and (select count(*) from public.library_hub_reader_state where user_id=p_user)>=4000 then raise exception 'Your Library has reached its storage limit.';end if;
  insert into public.library_hub_reader_state(user_id,kind,book_id,value) values(p_user,p_kind,p_book,nullif(p_value,'null'::jsonb))
  on conflict(user_id,kind,book_id) do update set value=case when p_kind='finished-chapters' and excluded.value is not null then coalesce(library_hub_reader_state.value,'{}'::jsonb)||excluded.value else excluded.value end,updated_at=now();
  return jsonb_build_object('saved',true);
 end if;
 select jsonb_build_object('records',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'bookId',book_id,'value',value,'updatedAt',updated_at)) from public.library_hub_reader_state where user_id=p_user),'[]'::jsonb),
 'subscriptions',coalesce((select jsonb_agg(book_id) from public.book_subscriptions where subscriber_id=p_user),'[]'::jsonb)) into result;
 return result;
end; $$;

create table if not exists public.library_hub_collections(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,title text not null check(length(title) between 1 and 100),description text not null default '' check(length(description)<=1000),is_public boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.library_hub_collection_books(collection_id uuid not null references public.library_hub_collections(id) on delete cascade,book_id text not null references public.library(id) on delete cascade,added_at timestamptz not null default now(),primary key(collection_id,book_id));
alter table public.library_hub_collections enable row level security;
alter table public.library_hub_collection_books enable row level security;
revoke all on public.library_hub_collections,public.library_hub_collection_books from public,anon,authenticated;
create index if not exists library_hub_public_lists on public.library_hub_collections(is_public,updated_at desc);
create or replace function public.library_hub_collection(p_action text,p_id uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid:=auth.uid();c public.library_hub_collections%rowtype;result jsonb;b text;off integer;lim integer;
begin
 if p_payload->>'expectedUser' is not null and p_payload->>'expectedUser' is distinct from uid::text then raise exception 'Reading account changed.';end if;
 if p_action in ('create','update','delete','add','remove','mine') and uid is null then raise exception 'Sign in to manage your shelves.';end if;
 if p_action in ('create','update','delete','add','remove') then
  if not public.mc_allowed('account',uid) then raise exception 'Your account cannot update reading lists right now.';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':library-lists',0));
 end if;
 if p_action='create' then
  if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 100 then raise exception 'Give your shelf a name of 1–100 characters.';end if;
  if (select count(*) from public.library_hub_collections where owner_id=uid)>=40 then raise exception 'You can create up to forty reading lists.';end if;
  insert into public.library_hub_collections(owner_id,title,description) values(uid,btrim(p_payload->>'title'),coalesce(p_payload->>'description','')) returning * into c;
  return to_jsonb(c)-'owner_id';
 elsif p_action in ('update','delete','add','remove') then
  select * into c from public.library_hub_collections where id=p_id and owner_id=uid for update;
  if not found then raise exception 'This reading list is unavailable.';end if;
  if p_action='delete' then delete from public.library_hub_collections where id=p_id;return jsonb_build_object('deleted',true);end if;
  if p_action='update' then
   if p_payload->>'title' is not null and length(btrim(p_payload->>'title')) not between 1 and 100 then raise exception 'Give your shelf a name of 1–100 characters.';end if;
   if p_payload->>'public'='true' and not public.mc_allowed('publishing',uid) then raise exception 'Your account cannot publish reading lists right now.';end if;
   update public.library_hub_collections set title=coalesce(btrim(p_payload->>'title'),title),description=coalesce(p_payload->>'description',description),is_public=coalesce((p_payload->>'public')::boolean,is_public),updated_at=now() where id=p_id;
  else
   b:=p_payload->>'bookId';
   if p_action='add' then
    if not public.library_hub_visible(b) then raise exception 'This book is unavailable.';end if;
    if (select count(*) from public.library_hub_collection_books where collection_id=p_id)>=200 then raise exception 'This list can hold up to two hundred books.';end if;
    insert into public.library_hub_collection_books(collection_id,book_id) values(p_id,b) on conflict do nothing;
   else delete from public.library_hub_collection_books where collection_id=p_id and book_id=b;end if;
   update public.library_hub_collections set updated_at=now() where id=p_id;
  end if;
  return jsonb_build_object('saved',true);
 elsif p_action='get' then
  select * into c from public.library_hub_collections where id=p_id and (owner_id=uid or is_public and public.mc_allowed('publishing',owner_id));
  if not found then raise exception 'This reading list is private or unavailable.';end if;
  select (to_jsonb(c)-'owner_id')||jsonb_build_object('mine',c.owner_id=uid,'ownerName',coalesce((select coalesce(nullif(display_name,''),nullif(username,'')) from public.users where id=c.owner_id),'Reader'),
   'books',coalesce((select jsonb_agg(i.meta order by cb.added_at) from public.library_hub_collection_books cb join public.library_hub_index i on i.book_id=cb.book_id where cb.collection_id=c.id and public.library_hub_visible(cb.book_id)),'[]'::jsonb)) into result;
  return result;
 elsif p_action in ('mine','public') then
  off:=least(greatest(coalesce((p_payload->>'offset')::integer,0),0),10000);lim:=least(greatest(coalesce((p_payload->>'limit')::integer,12),1),40);
  select coalesce(jsonb_agg(entry),'[]'::jsonb) into result from(select jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'public',c.is_public,'mine',c.owner_id=uid,'ownerName',coalesce(nullif(u.display_name,''),nullif(u.username,''),'Reader'),
   'count',(select count(*) from public.library_hub_collection_books cb where cb.collection_id=c.id and public.library_hub_visible(cb.book_id))) entry
   from public.library_hub_collections c left join public.users u on u.id=c.owner_id
   where (p_action='mine' and c.owner_id=uid) or (p_action='public' and c.is_public and public.mc_allowed('publishing',c.owner_id) and exists(select 1 from public.library_hub_collection_books cb where cb.collection_id=c.id and public.library_hub_visible(cb.book_id)))
   order by c.updated_at desc,c.id limit lim offset off) s;
  return result;
 else raise exception 'Unknown Library action.';end if;
end; $$;
revoke all on function public.library_hub_time(text),public.library_hub_number(text),public.library_hub_strings(jsonb),public.library_hub_released_ids(jsonb),public.library_hub_refresh(text,boolean),public.library_hub_index_trigger(),public.library_hub_visible(text) from public,anon,authenticated;
revoke all on function public.library_hub_query(jsonb,integer,integer),public.library_hub_facets(),public.library_hub_state(uuid,text,text,jsonb,boolean),public.library_hub_collection(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.library_hub_query(jsonb,integer,integer),public.library_hub_facets(),public.library_hub_collection(text,uuid,jsonb) to anon,authenticated;
grant execute on function public.library_hub_state(uuid,text,text,jsonb,boolean) to authenticated;
commit;
notify pgrst,'reload schema';
