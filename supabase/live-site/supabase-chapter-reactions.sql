-- Run in the live site's Supabase SQL Editor. Safe to re-run.
-- Requires existing Library public-reading and Moderation Center migrations.
-- Supports the original reaction_type schema and the newer reaction schema.
-- Original chapter_reactions records are kept intact.
begin;
create table if not exists public.library_chapter_reaction_votes (
    book_id text not null references public.library(id) on delete cascade,
    chapter_id text not null check (length(chapter_id) between 1 and 200),
    user_id uuid not null references auth.users(id) on delete cascade,
    reaction text check (reaction in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting')),
    updated_at timestamptz not null default now(),
    primary key (book_id, chapter_id, user_id)
);
alter table public.library_chapter_reaction_votes drop constraint if exists library_chapter_reaction_votes_reaction_check;
alter table public.library_chapter_reaction_votes add constraint library_chapter_reaction_votes_reaction_check check (reaction in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting'));
create index if not exists library_chapter_reaction_votes_counts on public.library_chapter_reaction_votes(book_id,chapter_id,reaction);
alter table public.library_chapter_reaction_votes enable row level security;
revoke all on public.library_chapter_reaction_votes from public,anon,authenticated;

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
            order by r.book_id,r.chapter_id,r.user_id,
                coalesce((to_jsonb(r)->>'updated_at')::timestamptz,(to_jsonb(r)->>'created_at')::timestamptz,'epoch'::timestamptz) desc,
                coalesce(to_jsonb(r)->>'id','') desc
            on conflict(book_id,chapter_id,user_id) do nothing
        $copy$,format('lower(btrim(r.%I))',source_column));
    end if;
end;
$migration$;

create or replace function public.chapter_reactions(p_book text, p_chapter text, p_reaction text default null, p_write boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid := auth.uid(); visible boolean; counts jsonb; mine text;
begin
    if p_book is null or length(p_book) not between 1 and 200 or p_chapter is null or length(p_chapter) not between 1 and 200 then
        raise exception 'This chapter is unavailable.';
    end if;
    -- The existing published reader applies release lists and book visibility.
    -- Only aggregate counts and the caller's own reaction leave this function.
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
        -- Serialize changes by this reader to make switching/removing predictable.
        perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_book,p_chapter,uid)::text,0));
        -- A null vote records a removal so a migration re-run cannot resurrect it.
        insert into public.library_chapter_reaction_votes(book_id,chapter_id,user_id,reaction)
        values(p_book,p_chapter,uid,p_reaction)
        on conflict(book_id,chapter_id,user_id) do update
            set reaction=excluded.reaction,updated_at=now();
    end if;
    select coalesce(jsonb_object_agg(r.reaction,r.total),'{}'::jsonb) into counts
    from (select reaction,count(*) total from public.library_chapter_reaction_votes where book_id=p_book and chapter_id=p_chapter and reaction is not null group by reaction) r;
    select reaction into mine from public.library_chapter_reaction_votes where book_id=p_book and chapter_id=p_chapter and user_id=uid;
    return jsonb_build_object('counts',counts,'mine',mine);
end;
$$;
revoke all on function public.chapter_reactions(text,text,text,boolean) from public;
grant execute on function public.chapter_reactions(text,text,text,boolean) to anon, authenticated;
commit;
notify pgrst,'reload schema';
