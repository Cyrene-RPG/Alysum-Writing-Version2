-- Updates reactions. Requires supabase-updates-announcements.sql.
-- Review and apply during the approved rollout; safe to rerun without losing votes.
begin;
create table if not exists public.announcement_reactions (
    post_id uuid not null references public.announcements(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    reaction text not null check (reaction in ('heart','purple','laugh','celebrate','like','surprise')),
    created_at timestamptz not null default now(),
    primary key (post_id, user_id, reaction)
);
create index if not exists announcement_reactions_counts on public.announcement_reactions(post_id,reaction);
alter table public.announcement_reactions enable row level security;
revoke all on public.announcement_reactions from public,anon,authenticated;

-- Only aggregate counts and the authenticated caller's own selections are public.
create or replace function public.get_announcement_reactions(p_posts uuid[], p_expected_user uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if p_posts is null or cardinality(p_posts) not between 1 and 20 then raise exception 'Choose up to twenty updates.'; end if;
    if p_expected_user is not null and p_expected_user is distinct from auth.uid() then raise exception 'Your account changed. Refresh reactions.'; end if;
    select coalesce(jsonb_object_agg(a.id::text,jsonb_build_object(
        'counts',coalesce((select jsonb_object_agg(c.reaction,c.total) from
            (select r.reaction,count(*) total from public.announcement_reactions r where r.post_id=a.id group by r.reaction) c),'{}'::jsonb),
        'mine',coalesce((select jsonb_agg(r.reaction order by r.reaction) from public.announcement_reactions r
            where r.post_id=a.id and r.user_id=auth.uid() and p_expected_user=auth.uid()),'[]'::jsonb)
    )),'{}'::jsonb) into result
    from public.announcements a where a.id=any(p_posts) and a.status='published';
    return result;
end; $$;

-- Explicit desired state makes retries safe; this is not a blind toggle.
create or replace function public.set_announcement_reaction(p_post uuid,p_reaction text,p_selected boolean,p_expected_user uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid:=auth.uid();
begin
    if uid is null then raise exception 'Sign in to react to updates.'; end if;
    if p_expected_user is distinct from uid then raise exception 'Your account changed. Refresh reactions.'; end if;
    if p_reaction is null or p_reaction not in ('heart','purple','laugh','celebrate','like','surprise') or p_selected is null then raise exception 'Choose an update reaction.'; end if;
    if to_regprocedure('public.mc_allowed(text,uuid)') is not null then
        if not public.mc_allowed('commenting',uid) then raise exception 'Reactions are unavailable while your account is restricted.'; end if;
    end if;
    perform 1 from public.announcements where id=p_post and status='published' for share;
    if not found then raise exception 'This update is unavailable.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_post,uid)::text,0));
    if p_selected then
        insert into public.announcement_reactions(post_id,user_id,reaction) values(p_post,uid,p_reaction)
        on conflict(post_id,user_id,reaction) do nothing;
    else
        delete from public.announcement_reactions where post_id=p_post and user_id=uid and reaction=p_reaction;
    end if;
    return public.get_announcement_reactions(array[p_post],uid)->p_post::text;
end; $$;
revoke all on function public.get_announcement_reactions(uuid[],uuid) from public;
revoke all on function public.set_announcement_reaction(uuid,text,boolean,uuid) from public,anon;
grant execute on function public.get_announcement_reactions(uuid[],uuid) to anon,authenticated;
grant execute on function public.set_announcement_reaction(uuid,text,boolean,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
