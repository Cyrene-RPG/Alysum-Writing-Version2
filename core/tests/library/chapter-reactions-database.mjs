import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
test('real reaction migration: publication boundaries, identities, switching, removal and privileges', async()=>{
 const db=new PGlite();try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
  CREATE TABLE public.library(id text PRIMARY KEY,user_id uuid,data jsonb);
  CREATE TABLE public.library_book_moderation(book_id text PRIMARY KEY,visibility text);
  CREATE TABLE public.test_blocked(user_id uuid PRIMARY KEY);
  CREATE TABLE public.test_hidden(book_id text PRIMARY KEY);
  CREATE FUNCTION public.mc_allowed(text,uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT NOT EXISTS(SELECT 1 FROM public.test_blocked WHERE user_id=$2) $$;
  CREATE FUNCTION public.mc_visible(text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT NOT EXISTS(SELECT 1 FROM public.test_hidden WHERE book_id=$1) $$;
  INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
  INSERT INTO public.library VALUES ('book','00000000-0000-0000-0000-000000000001','{"isPublished":true,"publishedChapterIds":["one"],"chapters":[{"id":"one"},{"id":"future"}]}'),('draft',null,'{"isPublished":false,"chapters":[{"id":"one"}]}'),('hidden',null,'{"chapters":[{"id":"one"}]}');
  INSERT INTO public.library_book_moderation VALUES('hidden','hidden');`);
  await db.exec(await readFile(new URL('../../../supabase/live-site/supabase-library-public-reading.sql',import.meta.url),'utf8'));
  const migration=await readFile(new URL('../../../supabase/live-site/supabase-chapter-reactions.sql',import.meta.url),'utf8');await db.exec(migration);
  // Simulate an installed six-choice table with a saved vote, then upgrade twice.
  await db.exec("ALTER TABLE public.chapter_reactions DROP CONSTRAINT chapter_reactions_reaction_check; ALTER TABLE public.chapter_reactions ADD CONSTRAINT chapter_reactions_reaction_check CHECK(reaction IN ('love','laugh','cry','shock','anger','excited')); INSERT INTO public.chapter_reactions(book_id,chapter_id,user_id,reaction) VALUES('book','one','00000000-0000-0000-0000-000000000001','love')");
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query('SELECT reaction FROM public.chapter_reactions')).rows[0].reaction,'love');
  await db.exec('DELETE FROM public.chapter_reactions');
  const identity=async n=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[n?'00000000-0000-0000-0000-00000000000'+n:'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'));};
  const call=async(book='book',chapter='one',reaction=null,write=false)=>(await db.query('SELECT public.chapter_reactions($1,$2,$3,$4) AS result',[book,chapter,reaction,write])).rows[0].result;
  await identity(0);assert.deepEqual(await call(),{counts:{},mine:null});
  await assert.rejects(call('book','one','love',true),/Sign in/);
  for(const [book,chapter] of [['draft','one'],['book','future'],['hidden','one'],['book','missing']])await assert.rejects(call(book,chapter),/unavailable/);
  await identity(1);assert.equal((await call('book','one','love',true)).counts.love,1);
  assert.equal((await call('book','one','love',true)).counts.love,1);
  await assert.rejects(db.query('SELECT * FROM public.chapter_reactions'),/permission denied/);
  await assert.rejects(db.query("INSERT INTO public.chapter_reactions VALUES('book','one','00000000-0000-0000-0000-000000000002','love',now())"),/permission denied/);
  await assert.rejects(call('book','one','unknown',true),/Choose/);
  for (const reaction of ['swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting']) { const result = await call('book','one',reaction,true);assert.equal(result.mine,reaction);assert.equal(result.counts[reaction],1); }
  await call('book','one','love',true);
  await identity(2);assert.deepEqual(await call('book','one','cry',true),{counts:{love:1,cry:1},mine:'cry'});
  await identity(1);assert.deepEqual(await call('book','one','shock',true),{counts:{shock:1,cry:1},mine:'shock'});
  assert.deepEqual(await call('book','one',null,true),{counts:{cry:1},mine:null});
  await identity(0);assert.deepEqual(await call(),{counts:{cry:1},mine:null});
  await db.exec('RESET ROLE');await db.exec("INSERT INTO public.test_blocked VALUES('00000000-0000-0000-0000-000000000002')");
  await identity(2);await assert.rejects(call('book','one','love',true),/restricted/);
  await db.exec('RESET ROLE');await db.exec("INSERT INTO public.test_hidden VALUES('book')");
  await identity(2);await assert.rejects(call(),/unavailable/);
  await db.exec('RESET ROLE');await db.exec("DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000002'");assert.equal((await db.query('SELECT count(*) AS total FROM public.chapter_reactions')).rows[0].total,0);
 }finally{await db.close();}
});
