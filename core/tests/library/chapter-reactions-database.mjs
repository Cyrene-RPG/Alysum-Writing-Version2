import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
async function setupDatabase(db) {
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
}
test('real reaction migration: publication boundaries, identities, multiple reactions, removal and privileges', async()=>{
 const db=new PGlite();try {
  await setupDatabase(db);
  const migration=await readFile(new URL('../../../supabase/live-site/supabase-chapter-reactions.sql',import.meta.url),'utf8');await db.exec(migration);
  // Simulate an installed six-choice table with a saved vote, then upgrade twice.
  await db.exec("ALTER TABLE public.library_chapter_reaction_votes DROP CONSTRAINT library_chapter_reaction_votes_reaction_check; ALTER TABLE public.library_chapter_reaction_votes ADD CONSTRAINT library_chapter_reaction_votes_reaction_check CHECK(reaction IN ('love','laugh','cry','shock','anger','excited')); INSERT INTO public.library_chapter_reaction_votes(book_id,chapter_id,user_id,reaction) VALUES('book','one','00000000-0000-0000-0000-000000000001','love')");
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query('SELECT reaction FROM public.library_chapter_reaction_votes')).rows[0].reaction,'love');
  await db.exec('DELETE FROM public.library_chapter_reaction_votes');
  const identity=async n=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[n?'00000000-0000-0000-0000-00000000000'+n:'']);await db.exec('SET ROLE '+(n?'authenticated':'anon'));};
  const call=async(book='book',chapter='one',reaction=null,write=false,selected=null)=>(await db.query('SELECT public.chapter_reactions($1,$2,$3,$4,$5) AS result',[book,chapter,reaction,write,selected])).rows[0].result;
  await identity(0);assert.deepEqual(await call(),{counts:{},mine:[]});
  await assert.rejects(call('book','one','love',true,true),/Sign in/);
  for(const [book,chapter] of [['draft','one'],['book','future'],['hidden','one'],['book','missing']])await assert.rejects(call(book,chapter),/unavailable/);
  await identity(1);assert.equal((await call('book','one','love',true,true)).counts.love,1);
  assert.equal((await call('book','one','love',true,true)).counts.love,1);
  await assert.rejects(db.query('SELECT * FROM public.library_chapter_reaction_votes'),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM public.library_chapter_reaction_import_skips'),/permission denied/);
  await assert.rejects(db.query("INSERT INTO public.library_chapter_reaction_votes VALUES('book','one','00000000-0000-0000-0000-000000000002','love',now())"),/permission denied/);
  await assert.rejects(call('book','one','unknown',true,true),/Choose/);
  await assert.rejects(call('book','one',null,true,true),/Choose/);
  assert.deepEqual((await call('book','one','love',true,null)).mine,['love']);
  for (const reaction of ['swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting']) {
    const result = await call('book','one',reaction,true,true);
    assert.ok(result.mine.includes(reaction));
    assert.equal(result.counts[reaction],1);
    const removed = await call('book','one',reaction,true,false);
    assert.equal(removed.mine.includes(reaction),false);
    assert.equal(removed.counts[reaction],undefined);
  }
  await identity(2);assert.deepEqual(await call('book','one','cry',true,true),{counts:{love:1,cry:1},mine:['cry']});
  await identity(1);assert.deepEqual(await call('book','one','shock',true,true),{counts:{love:1,shock:1,cry:1},mine:['love','shock']});
  assert.deepEqual(await call('book','one','love',true,false),{counts:{shock:1,cry:1},mine:['shock']});
  assert.deepEqual(await call('book','one','shock',true,false),{counts:{cry:1},mine:[]});
  await identity(0);assert.deepEqual(await call(),{counts:{cry:1},mine:[]});
  await db.exec('RESET ROLE');await db.exec("INSERT INTO public.test_blocked VALUES('00000000-0000-0000-0000-000000000002')");
  await identity(2);await assert.rejects(call('book','one','love',true,true),/restricted/);
  await db.exec('RESET ROLE');await db.exec("INSERT INTO public.test_hidden VALUES('book')");
  await identity(2);await assert.rejects(call(),/unavailable/);
  await db.exec('RESET ROLE');await db.exec("DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000002'");assert.equal((await db.query('SELECT count(*) AS total FROM public.library_chapter_reaction_votes')).rows[0].total,0);
 }finally{await db.close();}
});

const migrationPath = new URL('../../../supabase/live-site/supabase-chapter-reactions.sql',import.meta.url);
const legacyReactionDDL = "CREATE TABLE IF NOT EXISTS public.chapter_reactions (\n  id text PRIMARY KEY,\n  book_id text NOT NULL,\n  chapter_id text NOT NULL,\n  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,\n  reaction_type text NOT NULL CHECK (reaction_type IN ('love', 'funny', 'spicy', 'suspenseful', 'emotional', 'profound', 'heartwarming', 'shocking', 'good_writing', 'compelling_plot', 'great_character', 'strong_dialog')),\n  created_at timestamptz NOT NULL DEFAULT now()\n);\n";
const modernReactionDDL = "create table if not exists public.chapter_reactions (\n    book_id text not null references public.library(id) on delete cascade,\n    chapter_id text not null check (length(chapter_id) between 1 and 200),\n    user_id uuid not null references auth.users(id) on delete cascade,\n    reaction text not null check (reaction in ('love','laugh','cry','shock','anger','excited','swoon','heartbreak','blush','hot','happy','proud','scared','tense','confused','mindblown','curious','suspicious','inspired','hopeful','relieved','impressed','speechless','melting')),\n    updated_at timestamptz not null default now(),\n    primary key (book_id, chapter_id, user_id)\n);\n";
for (const [schema,ddl] of [['legacy reaction_type',legacyReactionDDL],['previous reaction',modernReactionDDL]]) {
 test('imports '+schema+' records without changing originals or resurrecting removed votes',async()=>{
  const db=new PGlite();try{
   await setupDatabase(db);
   await db.exec(ddl);
   if(schema.startsWith('legacy')) {
    await db.exec(`INSERT INTO public.chapter_reactions(id,book_id,chapter_id,user_id,reaction_type,created_at) VALUES
     ('old','book','one','00000000-0000-0000-0000-000000000001','spicy','2026-01-01'),
     ('latest','book','one','00000000-0000-0000-0000-000000000001','funny','2026-02-01'),
     ('other','book','one','00000000-0000-0000-0000-000000000002','love','2026-01-01'),
     ('orphan','missing-book','one','00000000-0000-0000-0000-000000000001','shocking','2026-01-01')`);
    const mappings={"funny":"laugh","spicy":"hot","suspenseful":"tense","emotional":"cry","profound":"inspired","heartwarming":"happy","shocking":"shock","good_writing":"impressed","compelling_plot":"excited","great_character":"proud","strong_dialog":"impressed"};
    for(const [old,reaction] of Object.entries(mappings)) {
     await db.query("INSERT INTO public.chapter_reactions(id,book_id,chapter_id,user_id,reaction_type) VALUES($1,'book',$1,'00000000-0000-0000-0000-000000000001',$2)",['mapping-'+old,old]);
    }
   } else {
    await db.exec("INSERT INTO public.chapter_reactions(book_id,chapter_id,user_id,reaction) VALUES('book','one','00000000-0000-0000-0000-000000000001','love')");
   }
   const original=(await db.query('SELECT * FROM public.chapter_reactions ORDER BY book_id,chapter_id,user_id')).rows;
   const migration=await readFile(migrationPath,'utf8');await db.exec(migration);await db.exec(migration);
   assert.deepEqual((await db.query('SELECT * FROM public.chapter_reactions ORDER BY book_id,chapter_id,user_id')).rows,original);
   if(schema.startsWith('legacy')) {
    for(const [old,reaction] of Object.entries({"funny":"laugh","spicy":"hot","suspenseful":"tense","emotional":"cry","profound":"inspired","heartwarming":"happy","shocking":"shock","good_writing":"impressed","compelling_plot":"excited","great_character":"proud","strong_dialog":"impressed"})) {
     assert.equal((await db.query('SELECT reaction FROM public.library_chapter_reaction_votes WHERE chapter_id=$1',['mapping-'+old])).rows[0].reaction,reaction);
    }
    assert.equal((await db.query("SELECT count(*) AS total FROM public.library_chapter_reaction_votes WHERE book_id='missing-book'")).rows[0].total,0);
   }
   await db.query("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
   await db.exec('SET ROLE authenticated');
   const call=async(reaction=null,write=false,selected=null)=>(await db.query("SELECT public.chapter_reactions('book','one',$1,$2,$3) AS result",[reaction,write,selected])).rows[0].result;
   const imported=schema.startsWith('legacy')?'laugh':'love';
   assert.deepEqual((await call()).mine,[imported]);
   assert.deepEqual((await call('mindblown',true,true)).mine,[imported,'mindblown']);
   await db.exec('RESET ROLE');await db.exec(migration);await db.exec('SET ROLE authenticated');
   assert.deepEqual((await call()).mine,[imported,'mindblown']);
   assert.deepEqual((await call('mindblown',true,false)).mine,[imported]);
   assert.deepEqual((await call(imported,true,false)).mine,[]);
   await db.exec('RESET ROLE');await db.exec(migration);await db.exec('SET ROLE authenticated');
   const removed=await call();assert.deepEqual(removed.mine,[]);assert.equal(removed.counts.mindblown,undefined);assert.equal(removed.counts[imported],undefined);
   await assert.rejects(db.query('SELECT * FROM public.library_chapter_reaction_votes'),/permission denied/);
   await db.exec('RESET ROLE');
   assert.deepEqual((await db.query('SELECT * FROM public.chapter_reactions ORDER BY book_id,chapter_id,user_id')).rows,original);
  }finally{await db.close();}
 });
}
