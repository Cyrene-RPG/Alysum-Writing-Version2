import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=await readFile(new URL('../../../supabase/live-site/supabase-library-hub.sql',import.meta.url),'utf8');
const subscriptions=await readFile(new URL('../../../supabase/live-site/supabase-book-subscriptions.sql',import.meta.url),'utf8');
test('Library metadata, filtering, account isolation, private/public collections, and release ranking',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO anon,authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
 CREATE TABLE public.library(id text PRIMARY KEY,user_id uuid,data jsonb,created_at timestamptz DEFAULT now());CREATE TABLE public.users(id uuid PRIMARY KEY,display_name text,username text);CREATE TABLE public.reads(id text PRIMARY KEY,book_id text,user_id uuid,created_at timestamptz DEFAULT now());CREATE TABLE public.book_subscriptions(subscriber_id uuid,book_id text);CREATE TABLE public.library_book_moderation(book_id text PRIMARY KEY,visibility text);CREATE FUNCTION public.mc_allowed(text,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;CREATE FUNCTION public.mc_visible(text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');INSERT INTO public.users VALUES('00000000-0000-0000-0000-000000000001','Reader One','one');
 INSERT INTO public.library(id,user_id,data) VALUES
 ('Book-A','00000000-0000-0000-0000-000000000001','{"title":"Harbor Magic","author":"A Writer","summary":"A mysterious port","genres":["fantasy"],"tags":["found family"],"serializationStatus":"complete","publishedChapterIds":["one"],"chapters":[{"id":"one","wordCount":700,"content":"PRIVATE MANUSCRIPT"},{"id":"future","wordCount":900,"content":"UNRELEASED SECRET"}]}'),
 ('book-b','00000000-0000-0000-0000-000000000002','{"title":"Second book","author":"B Writer","genres":["horror"],"tags":["ghosts"],"chapters":[{"id":"one","wordCount":600}]}'),
 ('draft',null,'{"title":"PRIVATE DRAFT","isPublished":false,"chapters":[{"id":"one","wordCount":600}]}'),
 ('anonymous','00000000-0000-0000-0000-000000000001','{"title":"Anonymous story","author":"PRIVATE AUTHOR","isAnonymous":true,"chapters":[{"id":"one","wordCount":600}]}');`);
 const helper=subscriptions.slice(subscriptions.indexOf('CREATE OR REPLACE FUNCTION public.notification_released_chapters'),subscriptions.indexOf('CREATE OR REPLACE FUNCTION public.set_book_subscription'));await db.exec(helper);
 await db.exec(migration);await db.exec(migration);
 const weekly=await readFile(new URL('../../../supabase/live-site/supabase-library-weekly-feature.sql',import.meta.url),'utf8');await db.exec(weekly);await db.exec(weekly);
 const featured=async()=>(await db.query('SELECT public.library_hub_featured() AS value')).rows[0].value;
 const first=await featured();assert.ok(first.bookId);assert.match(first.weekStart,/^\d{4}-\d{2}-\d{2}$/);
 await db.exec(`INSERT INTO public.library(id,data) VALUES('new-feature-candidate','{"title":"New book","chapters":[{"id":"one","wordCount":10}]}')`);
 assert.equal((await featured()).bookId,first.bookId);
 await db.exec("INSERT INTO public.library_book_moderation VALUES('"+first.bookId+"','hidden')");assert.notEqual((await featured()).bookId,first.bookId);
 await db.exec('DELETE FROM public.library_book_moderation');await db.exec("DELETE FROM public.library WHERE id='new-feature-candidate'");
 await db.exec('SET ROLE anon');assert.ok((await featured()).bookId);await assert.rejects(db.exec('SELECT * FROM public.library_hub_weekly_features'),/permission denied/);await db.exec('RESET ROLE');
 const query=async filters=>(await db.query('SELECT public.library_hub_query($1) AS value',[filters||{}])).rows[0].value;
 const all=await query();assert.equal(all.total,3);assert.ok(!JSON.stringify(all).includes('PRIVATE'));assert.equal(all.items.find(b=>b.id==='Book-A').chapters,1);assert.equal(all.items.find(b=>b.id==='Book-A').words,700);
 assert.equal((await query({tags:['found family']})).total,1);assert.equal((await query({excludeTags:['found family']})).total,2);assert.equal((await query({q:'magic'})).total,1);assert.equal((await query({status:'complete'})).total,1);assert.equal((await query({ids:['Book-A']})).items[0].id,'Book-A');
 assert.equal((await query({sort:'updated'})).total,0); // baseline never pretends an edit was a new release
 await db.exec(`UPDATE public.library SET data=jsonb_set(data,'{summary}','"Edited description"') WHERE id='Book-A'`);assert.equal((await query({sort:'updated'})).total,0);
 await db.exec(`UPDATE public.library SET data=jsonb_set(data,'{publishedChapterIds}','["one","future"]') WHERE id='Book-A'`);assert.equal((await query({sort:'updated'})).items[0].id,'Book-A');
 await db.exec("INSERT INTO public.reads VALUES('self','Book-A','00000000-0000-0000-0000-000000000001',now()),('real','Book-A','00000000-0000-0000-0000-000000000002',now()),('repeat','Book-A','00000000-0000-0000-0000-000000000002',now())");assert.equal((await query({sort:'trending'})).items[0].weeklyReaders,1);
 const as=async n=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[n?'00000000-0000-0000-0000-00000000000'+n:'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'));};
 const uid='00000000-0000-0000-0000-000000000001';await as(1);await db.query("SELECT public.library_hub_state($1,'shelves','Book-A','\"want\"',true)",[uid]);await assert.rejects(db.exec('SELECT * FROM public.library_hub_reader_state'),/permission denied/);
 const created=(await db.query("SELECT public.library_hub_collection('create',null,'{\"title\":\"My shelf\"}') AS value")).rows[0].value;await db.query("SELECT public.library_hub_collection('add',$1,'{\"bookId\":\"Book-A\"}')",[created.id]);
 await as(2);await assert.rejects(db.query('SELECT public.library_hub_state($1)',[uid]),/own Library/);await assert.rejects(db.query("SELECT public.library_hub_collection('get',$1)",[created.id]),/private/);await assert.rejects(db.query("SELECT public.library_hub_collection('update',$1,'{\"public\":true}')",[created.id]),/unavailable/);
 await as(1);await db.query("SELECT public.library_hub_collection('update',$1,'{\"public\":true}')",[created.id]);
 await as(0);assert.equal((await db.query("SELECT public.library_hub_collection('get',$1) AS value",[created.id])).rows[0].value.books.length,1);
 await db.exec('RESET ROLE');await db.exec("INSERT INTO public.library_book_moderation VALUES('Book-A','hidden')");assert.equal((await query()).total,2);await as(0);assert.equal((await db.query("SELECT public.library_hub_collection('get',$1) AS value",[created.id])).rows[0].value.books.length,0);
 }finally{await db.close();}
});
