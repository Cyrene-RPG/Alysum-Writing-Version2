-- Run in the live site's Supabase SQL Editor. Safe to re-run.
-- Requires existing Library public-reading and Moderation Center migrations.
-- Supports the original reaction_type schema and the newer reaction schema.
-- Original chapter_reactions records are kept intact.
-- Readers may keep many reactions on the same chapter.
begin;
create table if not exists public.library_chapter_reaction_votes (
    book_id text not null references public.library(id) on delete cascade,
    chapter_id text not null check (length(chapter_id) between 1 and 200),
    user_id uuid not null references auth.users(id) on delete cascade,
    reaction text check (reaction in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting')),
    updated_at timestamptz not null default now(),
    primary key (book_id, chapter_id, user_id)
);
create table if not exists public.library_chapter_reaction_import_skips (
    book_id text not null references public.library(id) on delete cascade,
    chapter_id text not null check (length(chapter_id) between 1 and 200),
    user_id uuid not null references auth.users(id) on delete cascade,
    primary key (book_id, chapter_id, user_id)
);
alter table public.library_chapter_reaction_votes drop constraint if exists library_chapter_reaction_votes_reaction_check;
alter table public.library_chapter_reaction_votes add constraint library_chapter_reaction_votes_reaction_check check (reaction in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting'));
create index if not exists library_chapter_reaction_votes_counts on public.library_chapter_reaction_votes(book_id,chapter_id,reaction);
alter table public.library_chapter_reaction_votes enable row level security;
alter table public.library_chapter_reaction_import_skips enable row level security;
revoke all on public.library_chapter_reaction_votes from public,anon,authenticated;
revoke all on public.library_chapter_reaction_import_skips from public,anon,authenticated;

-- Preserve cleared votes so a later import cannot restore them, then allow many reactions.
insert into public.library_chapter_reaction_import_skips(book_id,chapter_id,user_id)
select book_id,chapter_id,user_id from public.library_chapter_reaction_votes where reaction is null
on conflict do nothing;
delete from public.library_chapter_reaction_votes where reaction is null;
alter table public.library_chapter_reaction_votes drop constraint if exists library_chapter_reaction_votes_pkey;
alter table public.library_chapter_reaction_votes alter column reaction set not null;
alter table public.library_chapter_reaction_votes add primary key (book_id, chapter_id, user_id, reaction);

-- Import once per reader/chapter; never overwrite a vote already made with the new RPC.
-- Multiple legacy reactions become the latest reaction, with an ID tie-breaker.
-- Legacy-only categories are mapped to the nearest supported choice.
-- Unrecognized/orphaned records are retained in the original table.
do $migration$
declare source_column text;
begin
    if to_regclass('public.chapter_reactions') is not null then
        if exists(select 1 from information_schema.columns where table_schema='public' and table_name='chapter_reactions' and column_name='reaction') then
            source_column := 'reaction';
        elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='chapter_reactions' and column_name='reaction_type') then
            source_column := 'reaction_type';
        else
            raise exception 'Unsupported chapter_reactions layout: expected reaction or reaction_type. No records were changed.';
        end if;
        execute format($copy$
            insert into public.library_chapter_reaction_votes(book_id,chapter_id,user_id,reaction,updated_at)
            select distinct on (r.book_id,r.chapter_id,r.user_id)
                r.book_id,r.chapter_id,r.user_id,
                case %1$s
                    when 'funny' then 'laugh'
            when 'spicy' then 'hot'
            when 'suspenseful' then 'tense'
            when 'emotional' then 'cry'
            when 'profound' then 'inspired'
            when 'heartwarming' then 'happy'
            when 'shocking' then 'shock'
            when 'good_writing' then 'impressed'
            when 'compelling_plot' then 'excited'
            when 'great_character' then 'proud'
            when 'strong_dialog' then 'impressed'
                    else %1$s
                end,
                coalesce((to_jsonb(r)->>'updated_at')::timestamptz,(to_jsonb(r)->>'created_at')::timestamptz,now())
            from public.chapter_reactions r
            join public.library l on l.id=r.book_id
            join auth.users u on u.id=r.user_id
            where length(r.book_id) between 1 and 200 and length(r.chapter_id) between 1 and 200
                and %1$s in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting','funny','spicy','suspenseful','emotional','profound','heartwarming','shocking','good_writing','compelling_plot','great_character','strong_dialog')
                and not exists (
                    select 1 from public.library_chapter_reaction_votes v
                    where v.book_id=r.book_id and v.chapter_id=r.chapter_id and v.user_id=r.user_id
                )
                and not exists (
                    select 1 from public.library_chapter_reaction_import_skips s
                    where s.book_id=r.book_id and s.chapter_id=r.chapter_id and s.user_id=r.user_id
                )
            order by r.book_id,r.chapter_id,r.user_id,
                coalesce((to_jsonb(r)->>'updated_at')::timestamptz,(to_jsonb(r)->>'created_at')::timestamptz,'epoch'::timestamptz) desc,
                coalesce(to_jsonb(r)->>'id','') desc
            on conflict(book_id,chapter_id,user_id,reaction) do nothing
        $copy$,format('lower(btrim(r.%I))',source_column));
    end if;
end;
$migration$;

drop function if exists public.chapter_reactions(text,text,text,boolean);
drop function if exists public.chapter_reactions(text,text,text,boolean,boolean);
create or replace function public.chapter_reactions(p_book text, p_chapter text, p_reaction text default null, p_write boolean default false, p_selected boolean default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid := auth.uid(); visible boolean; counts jsonb; mine jsonb;
begin
    if p_book is null or length(p_book) not between 1 and 200 or p_chapter is null or length(p_chapter) not between 1 and 200 then
        raise exception 'This chapter is unavailable.';
    end if;
    -- The existing published reader applies release lists and book visibility.
    -- Only aggregate counts and the caller's own reactions leave this function.
    select exists (
        select 1 from public.get_published_book(p_book) b,
        lateral jsonb_array_elements(coalesce(b.data->'chapters','[]'::jsonb)) with ordinality c(chapter,position)
        where coalesce(nullif(c.chapter->>'id',''),'ch-'||c.position) = p_chapter
    ) into visible;
    if not visible or not public.mc_visible(p_book) then raise exception 'This chapter is unavailable.'; end if;
    if p_write then
        if uid is null then raise exception 'Sign in to react to this chapter.'; end if;
        if not public.mc_allowed('commenting',uid) then raise exception 'Reactions are unavailable while your account is restricted.'; end if;
        if p_reaction is not null and p_reaction not in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting') then raise exception 'Choose a chapter reaction.'; end if;
        if p_reaction is null and p_selected is true then raise exception 'Choose a chapter reaction.'; end if;
        -- Serialize changes by this reader so retries keep an explicit on/off state.
        perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_book,p_chapter,uid)::text,0));
        -- A skip row records that this reader already wrote, so a migration re-run cannot resurrect a removed vote.
        insert into public.library_chapter_reaction_import_skips(book_id,chapter_id,user_id)
        values(p_book,p_chapter,uid)
        on conflict(book_id,chapter_id,user_id) do nothing;
        -- Old clients omit p_selected; treat a named reaction as add, and a null reaction as "clear mine".
        if p_reaction is null then
            delete from public.library_chapter_reaction_votes
            where book_id=p_book and chapter_id=p_chapter and user_id=uid;
        elsif p_selected is false then
            delete from public.library_chapter_reaction_votes
            where book_id=p_book and chapter_id=p_chapter and user_id=uid and reaction=p_reaction;
        else
            insert into public.library_chapter_reaction_votes(book_id,chapter_id,user_id,reaction)
            values(p_book,p_chapter,uid,p_reaction)
            on conflict(book_id,chapter_id,user_id,reaction) do update set updated_at=now();
        end if;
    end if;
    select coalesce(jsonb_object_agg(r.reaction,r.total),'{}'::jsonb) into counts
    from (select reaction,count(*) total from public.library_chapter_reaction_votes where book_id=p_book and chapter_id=p_chapter group by reaction) r;
    select coalesce(jsonb_agg(reaction order by reaction),'[]'::jsonb) into mine
    from public.library_chapter_reaction_votes where book_id=p_book and chapter_id=p_chapter and user_id=uid;
    return jsonb_build_object('counts',counts,'mine',mine);
end;
$$;
revoke all on function public.chapter_reactions(text,text,text,boolean,boolean) from public;
grant execute on function public.chapter_reactions(text,text,text,boolean,boolean) to anon, authenticated;
commit;
notify pgrst,'reload schema';
