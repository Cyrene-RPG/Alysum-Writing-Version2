import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const migration=await readFile(new URL('../../../supabase/live-site/supabase-book-reminders.sql',import.meta.url),'utf8');
test('opt-in schedules, activity suppression, privacy, popup deduplication and calendar recurrence',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
 CREATE TABLE public.books(id text PRIMARY KEY,user_id uuid,title text,created bigint DEFAULT 0,updated bigint DEFAULT 0,publish_meta jsonb DEFAULT '{}');
 CREATE TABLE public.library(id text PRIMARY KEY,user_id uuid,data jsonb);
 CREATE TABLE public.library_book_moderation(book_id text PRIMARY KEY,visibility text);
 CREATE FUNCTION public.mc_visible(text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT NOT EXISTS(SELECT 1 FROM public.library_book_moderation WHERE book_id=$1 AND visibility IN ('hidden','removed'))$$;
 CREATE TABLE public.inbox_notifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,recipient_id uuid,kind text CONSTRAINT inbox_notifications_kind_check CHECK(kind IN ('follower','chapter_comment','moderation_message')),book_id text REFERENCES public.library(id) ON DELETE SET NULL,title text,message text,source_key text,created_at timestamptz DEFAULT clock_timestamp(),read_at timestamptz,UNIQUE(recipient_id,source_key));
 INSERT INTO auth.users VALUES('${owner}'),('${other}');
 INSERT INTO public.books(id,user_id,title) VALUES('draft','${owner}','A Draft'),('posted','${owner}','A Published Story'),('disabled','${owner}','Off by default');
 INSERT INTO public.library VALUES('posted','${owner}','{"updated":1,"serializationStatus":"in_progress"}');`);
 await db.exec(await readFile(new URL('../../../supabase/live-site/supabase-book-hiatus.sql',import.meta.url),'utf8'));
 await db.exec(migration);await db.exec(migration);
 const identity=async id=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated');};
 const admin=()=>db.exec('RESET ROLE');
 const save=async(id,goal='update',enabled=true,popup=true)=>db.query("SELECT public.save_book_reminder($1,$2,$3,'weekly',7,'UTC',(now()+interval '1 day') AT TIME ZONE 'UTC',$4) AS s",[id,enabled,goal,popup]);
 const due=async id=>{await admin();await db.query("UPDATE public.book_reminders SET next_due=clock_timestamp()-interval '1 minute',period_start=now()-interval '1 day',last_edit_at=NULL,last_post_at=NULL WHERE book_id=$1",[id]);};
 const deliver=async()=>Number((await db.query('SELECT public.deliver_book_reminders() AS n')).rows[0].n);
 await identity(owner);assert.equal((await db.query("SELECT public.get_book_reminder('draft') AS s")).rows[0].s,null);
 await save('draft');await save('posted','post');await save('disabled','update',false);
 await identity(other);await assert.rejects(save('draft'),/Only the author/);
 await assert.rejects(db.exec('SELECT * FROM public.book_reminders'),/permission denied/);
 await assert.rejects(db.exec('SELECT public.deliver_book_reminders()'),/permission denied/);
 await admin();assert.equal(await deliver(),0);
 await due('draft');assert.equal(await deliver(),1);assert.equal(await deliver(),0);
 let note=(await db.query("SELECT * FROM public.inbox_notifications WHERE kind='book_reminder' ORDER BY id DESC LIMIT 1")).rows[0];
 assert.equal(note.recipient_id,owner);assert.equal(note.reminder_book_id,'draft');assert.equal(note.book_id,null);
 await identity(other);assert.equal((await db.query('SELECT * FROM public.get_book_reminder_notification_target($1)',[note.id])).rows.length,0);
 assert.equal((await db.query('SELECT public.claim_book_reminder_popup() AS s')).rows[0].s,null);
 await identity(owner);assert.equal((await db.query('SELECT * FROM public.get_book_reminder_notification_target($1)',[note.id])).rows[0].book_id,'draft');
 assert.equal((await db.query('SELECT public.claim_book_reminder_popup() AS s')).rows[0].s.id,String(note.id));
 assert.equal((await db.query('SELECT public.claim_book_reminder_popup() AS s')).rows[0].s,null);
 await due('draft');await db.exec("UPDATE public.books SET updated=updated+1 WHERE id='draft'");assert.equal(await deliver(),0);
 // Reader metrics never count as author publication.
 await due('posted');await db.exec("UPDATE public.library SET data=data||'{\"readers\":5}' WHERE id='posted'");
 assert.equal(await deliver(),1);
 // Writing edits alone do not fulfil a post-only reminder.
 await due('posted');await db.exec("UPDATE public.books SET updated=updated+1 WHERE id='posted'");assert.equal(await deliver(),1);
 await due('posted');await db.exec("UPDATE public.library SET data=jsonb_set(data,'{updated}','2') WHERE id='posted'");assert.equal(await deliver(),0);
 await due('draft');await db.exec("UPDATE public.books SET publish_meta='{\"complete\":true}' WHERE id='draft'");assert.equal(await deliver(),0);
 await due('posted');await db.exec("UPDATE public.book_inactivity SET on_hiatus=true WHERE book_id='posted'");assert.equal(await deliver(),0);
 await db.exec("UPDATE public.book_inactivity SET on_hiatus=false WHERE book_id='posted';INSERT INTO public.library_book_moderation VALUES('posted','hidden')");
 await due('posted');assert.equal(await deliver(),0);
 await db.exec("DELETE FROM public.library_book_moderation;UPDATE public.books SET publish_meta='{}' WHERE id='draft'");
 // Disabling supersedes unread alerts, while retaining their history.
 await identity(owner);await save('posted','post',false);
 await admin();assert.equal((await db.query("SELECT count(*) AS n FROM public.inbox_notifications WHERE reminder_book_id='posted' AND read_at IS NULL")).rows[0].n,0);
 // Ownership transfers cannot opt the new owner in.
 await due('draft');await db.query("UPDATE public.books SET user_id=$1 WHERE id='draft'",[other]);assert.equal(await deliver(),0);
 await identity(other);assert.equal((await db.query("SELECT public.get_book_reminder('draft') AS s")).rows[0].s,null);
 await assert.rejects(db.query("SELECT public.save_book_reminder('draft',true,'update','weekly',7,'Bad/Timezone',now()::timestamp+interval '1 day',true)"),/timezone/);
 await assert.rejects(db.query("SELECT public.save_book_reminder('draft',true,'update','weekly',7,'America/Los_Angeles','2027-03-14 02:30',true)"),/does not exist/);
 await assert.rejects(db.query("SELECT public.save_book_reminder('draft',true,'update','days',0,'UTC',now()::timestamp+interval '1 day',true)"),/valid reminder/);
 await assert.rejects(db.query("SELECT public.save_book_reminder('draft',true,'update','weekly',7,'UTC',now()::timestamp-interval '1 day',true)"),/future/);
 await admin();
 const next=async(anchor,zone,cadence,after)=>(await db.query('SELECT public.next_book_reminder_time($1,$2,$3,7,$4) AS d',[anchor,zone,cadence,after])).rows[0].d;
 assert.equal(new Date(await next('2027-01-31 18:00','UTC','monthly','2027-02-01Z')).toISOString(),'2027-02-28T18:00:00.000Z');
 assert.equal(new Date(await next('2027-01-31 18:00','UTC','monthly','2027-03-01Z')).toISOString(),'2027-03-31T18:00:00.000Z');
 assert.equal(new Date(await next('2027-03-07 18:00','America/Los_Angeles','weekly','2027-03-09Z')).toISOString(),'2027-03-15T01:00:00.000Z');
 assert.equal(new Date(await next('2027-01-01 18:00','UTC','biweekly','2027-01-16Z')).toISOString(),'2027-01-29T18:00:00.000Z');
 await identity(other);await save('draft');await due('draft');await deliver();
 await db.exec("UPDATE public.books SET updated=updated+1 WHERE id='draft'");
 await identity(other);assert.equal((await db.query('SELECT public.claim_book_reminder_popup() AS s')).rows[0].s,null);
 await admin();const count=(await db.query('SELECT count(*) AS n FROM public.inbox_notifications')).rows[0].n;
 await db.exec(migration);assert.equal((await db.query('SELECT count(*) AS n FROM public.inbox_notifications')).rows[0].n,count);
 await db.exec("DELETE FROM public.books WHERE id='draft'");assert.equal((await db.query("SELECT count(*) AS n FROM public.book_reminders WHERE book_id='draft'")).rows[0].n,0);
 }finally{await db.close();}
});
