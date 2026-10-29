-- Reader DNF and remove-from-library upgrade. Run after supabase-library-hub.sql.
-- Preserves saved progress, bookmarks, purchases and published books. Safe to rerun.
begin;

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
   (p_filters->>'shelf' in ('want','reading','finished','dnf') and exists(select 1 from public.library_hub_reader_state st where st.user_id=auth.uid() and st.kind='shelves' and st.book_id=i.book_id and st.value#>>'{}'=p_filters->>'shelf'))
   or (p_filters->>'shelf'='reading' and exists(select 1 from public.library_hub_reader_state st where st.user_id=auth.uid() and st.kind='read-position' and st.book_id=i.book_id and st.value is not null and public.library_hub_number(st.value->>'progress')<100) and not exists(select 1 from public.library_hub_reader_state st where st.user_id=auth.uid() and st.kind='shelves' and st.book_id=i.book_id and st.value#>>'{}' in ('want','finished','dnf','removed')))
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

create or replace function public.library_hub_state(p_user uuid,p_kind text default null,p_book text default null,p_value jsonb default null,p_write boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if auth.uid() is null or auth.uid() is distinct from p_user then raise exception 'Sign in to your own Library account.';end if;
 if p_write then
  if p_kind not in ('read-position','shelves','finished-chapters','bookmarks','preferences') or p_kind is null or p_book is null or length(p_book) not between 1 and 200 or octet_length(coalesce(p_value,'null')::text)>16384 then raise exception 'Invalid reading state.';end if;
  if p_kind='shelves' and p_value is not null and p_value<>'null'::jsonb and p_value not in ('"reading"'::jsonb,'"want"'::jsonb,'"finished"'::jsonb,'"dnf"'::jsonb,'"removed"'::jsonb) then raise exception 'Choose a shelf.';end if;
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


commit;
