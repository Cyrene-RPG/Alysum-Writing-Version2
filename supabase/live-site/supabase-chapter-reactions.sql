-- Run in the live site's Supabase SQL Editor. Safe to re-run.
-- Requires existing Library public-reading and Moderation Center migrations.
begin;
create table if not exists public.chapter_reactions (
    book_id text not null references public.library(id) on delete cascade,
    chapter_id text not null check (length(chapter_id) between 1 and 200),
    user_id uuid not null references auth.users(id) on delete cascade,
    reaction text not null check (reaction in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting')),
    updated_at timestamptz not null default now(),
    primary key (book_id, chapter_id, user_id)
);
-- Expand the existing constraint without deleting any saved reactions.
alter table public.chapter_reactions drop constraint if exists chapter_reactions_reaction_check;
alter table public.chapter_reactions add constraint chapter_reactions_reaction_check check (reaction in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting'));
create index if not exists chapter_reactions_counts on public.chapter_reactions(book_id, chapter_id, reaction);
alter table public.chapter_reactions enable row level security;
revoke all on public.chapter_reactions from public, anon, authenticated;

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
        if p_reaction is null then
            delete from public.chapter_reactions where book_id=p_book and chapter_id=p_chapter and user_id=uid;
        else
            insert into public.chapter_reactions(book_id,chapter_id,user_id,reaction) values(p_book,p_chapter,uid,p_reaction)
            on conflict(book_id,chapter_id,user_id) do update set reaction=excluded.reaction,updated_at=now();
        end if;
    end if;
    select coalesce(jsonb_object_agg(r.reaction,r.total),'{}'::jsonb) into counts
    from (select reaction,count(*) total from public.chapter_reactions where book_id=p_book and chapter_id=p_chapter group by reaction) r;
    select reaction into mine from public.chapter_reactions where book_id=p_book and chapter_id=p_chapter and user_id=uid;
    return jsonb_build_object('counts',counts,'mine',mine);
end;
$$;
revoke all on function public.chapter_reactions(text,text,text,boolean) from public;
grant execute on function public.chapter_reactions(text,text,text,boolean) to anon, authenticated;
commit;
notify pgrst,'reload schema';
