-- Run after existing inbox, reading notifications, comments and Moderation Center SQL.
-- Safe to re-run. Delivers only new comments; no historical notification backfill.
begin;
alter table public.inbox_notifications add column if not exists comment_id uuid references public.comments(id) on delete set null;
alter table public.notification_preferences add column if not exists new_comments boolean not null default true;
alter table public.notification_preferences add column if not exists author_replies boolean not null default true;
do $$
declare rule text;
begin
 select pg_get_expr(conbin,conrelid) into rule from pg_constraint where conrelid='public.inbox_notifications'::regclass and conname='inbox_notifications_kind_check';
 if rule is null then raise exception 'Install the existing inbox notification migrations first.'; end if;
 if position('chapter_comment' in rule)=0 or position('author_reply' in rule)=0 then
  alter table public.inbox_notifications drop constraint inbox_notifications_kind_check;
  execute 'alter table public.inbox_notifications add constraint inbox_notifications_kind_check check (('||rule||') OR kind IN (''chapter_comment'',''author_reply''))';
 end if;
end;
$$;
create or replace function public.set_all_notification_preferences(p_new_followers boolean,p_author_announcements boolean,p_site_updates boolean,p_new_books boolean,p_new_chapters boolean,p_new_comments boolean,p_author_replies boolean)
returns setof public.notification_preferences language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'Sign in to change preferences.'; end if;
 if p_new_followers is null or p_author_announcements is null or p_site_updates is null or p_new_books is null or p_new_chapters is null or p_new_comments is null or p_author_replies is null then raise exception 'Choose every preference.'; end if;
 return query insert into public.notification_preferences as p(user_id,new_followers,author_announcements,site_updates,new_books,new_chapters,new_comments,author_replies)
 values(auth.uid(),p_new_followers,p_author_announcements,p_site_updates,p_new_books,p_new_chapters,p_new_comments,p_author_replies)
 on conflict(user_id) do update set new_followers=excluded.new_followers,author_announcements=excluded.author_announcements,site_updates=excluded.site_updates,new_books=excluded.new_books,new_chapters=excluded.new_chapters,new_comments=excluded.new_comments,author_replies=excluded.author_replies,updated_at=clock_timestamp() returning p.*;
end;
$$;
create or replace function public.deliver_comment_notification()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid; recipient uuid; category text; target public.comments%rowtype; book_title text; enabled boolean;
begin
 select l.user_id,left(coalesce(nullif(l.data->>'title',''),'this book'),160) into owner_id,book_title from public.library l where l.id=NEW.book_id;
 if owner_id is null or not public.mc_visible(NEW.book_id) or not public.mc_allowed('commenting',NEW.user_id) then return NEW; end if;
 if not exists(select 1 from public.get_published_book(NEW.book_id) b,lateral jsonb_array_elements(coalesce(b.data->'chapters','[]'::jsonb)) with ordinality c(chapter,position) where coalesce(nullif(c.chapter->>'id',''),'ch-'||c.position)=NEW.chapter_id) then return NEW; end if;
 if NEW.parent_id is not null then
  select * into target from public.comments where id=NEW.parent_id and book_id=NEW.book_id and chapter_id=NEW.chapter_id;
  if not found then return NEW; end if;
 end if;
 if NEW.user_id=owner_id then
  if NEW.parent_id is null or target.user_id=NEW.user_id then return NEW; end if;
  recipient:=target.user_id; category:='author_reply';
  select p.author_replies into enabled from public.notification_preferences p where p.user_id=recipient;
 else
  recipient:=owner_id; category:='chapter_comment';
  select p.new_comments into enabled from public.notification_preferences p where p.user_id=recipient;
 end if;
 if recipient=NEW.user_id or enabled=false then return NEW; end if;
 insert into public.inbox_notifications(recipient_id,kind,book_id,chapter_id,comment_id,title,message,source_key)
 values(recipient,category,NEW.book_id,NEW.chapter_id,NEW.id,
 case when category='author_reply' then 'The author replied to your comment' else 'New comment on your book' end,
 case when category='author_reply' then 'You have an author reply on '||book_title||'.' else 'A reader commented on '||book_title||'.' end,
 'chapter-comment:'||category||':'||NEW.id::text)
 on conflict(recipient_id,source_key) do nothing;
 return NEW;
end;
$$;
create or replace function public.get_comment_notification_target(p_notification_id bigint)
returns table(book_id text,chapter_id text,comment_id uuid) language sql stable security definer set search_path=pg_catalog,public as $$
 select c.book_id,c.chapter_id,c.id from public.inbox_notifications n
 join public.comments c on c.id=n.comment_id and c.book_id=n.book_id and c.chapter_id=n.chapter_id
 where n.id=p_notification_id and n.recipient_id=auth.uid() and n.kind in ('chapter_comment','author_reply') and public.mc_visible(c.book_id)
 and exists(select 1 from public.get_published_book(c.book_id) b,lateral jsonb_array_elements(coalesce(b.data->'chapters','[]'::jsonb)) with ordinality ch(chapter,position) where coalesce(nullif(ch.chapter->>'id',''),'ch-'||ch.position)=c.chapter_id);
$$;
lock table public.comments in share row exclusive mode;
drop trigger if exists notify_chapter_comment on public.comments;
create trigger notify_chapter_comment after insert on public.comments for each row execute function public.deliver_comment_notification();
revoke all on function public.deliver_comment_notification() from public,anon,authenticated;
revoke all on function public.get_comment_notification_target(bigint) from public,anon;
grant execute on function public.get_comment_notification_target(bigint) to authenticated;
revoke all on function public.set_all_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.set_all_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
commit;
notify pgrst,'reload schema';
