import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('persistent multi-reactions enforce identity, publication, uniqueness and independent removal',async()=>{
 const db=new PGlite(),one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002',post='10000000-0000-0000-0000-000000000001',draft='10000000-0000-0000-0000-000000000002';
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create table public.announcements(id uuid primary key,status text);insert into auth.users values('${one}'),('${two}');insert into public.announcements values('${post}','published'),('${draft}','draft');`);
 const sql=await readFile(new URL('../../../supabase/live-site/supabase-update-reactions.sql',import.meta.url),'utf8');await db.exec(sql);
 const identity=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'));};
 const get=async(ids=[post],expected=null)=>(await db.query('select public.get_announcement_reactions($1,$2) as value',[ids,expected])).rows[0].value;
 const set=async(reaction,selected=true,expected=one,id=post)=>(await db.query('select public.set_announcement_reaction($1,$2,$3,$4) as value',[id,reaction,selected,expected])).rows[0].value;
 await identity(null);assert.deepEqual((await get())[post],{counts:{},mine:[]});await assert.rejects(set('heart'),/permission denied/);
 await identity(one);await set('heart');assert.deepEqual(await set('purple'),{counts:{heart:1,purple:1},mine:['heart','purple']});await set('heart');await set('heart');assert.equal((await get([post],one))[post].counts.heart,1);
 for(const reaction of ['laugh','celebrate','like','surprise'])await set(reaction);assert.equal((await get([post],one))[post].mine.length,6);
 await identity(two);await set('heart',true,two);assert.deepEqual((await get([post],two))[post].mine,['heart']);assert.equal((await get([post],two))[post].counts.heart,2);
 await assert.rejects(set('purple',true,one),/account changed/);await assert.rejects(get([post],one),/account changed/);
 await assert.rejects(db.exec('select * from public.announcement_reactions'),/permission denied/);
 await assert.rejects(db.exec(`insert into public.announcement_reactions values('${post}','${one}','heart',now())`),/permission denied/);
 await identity(one);await set('heart',false);await set('heart',false);assert.equal((await get([post],one))[post].counts.heart,1);assert.ok((await get([post],one))[post].mine.includes('purple'));
 await assert.rejects(set('invalid'),/Choose/);await assert.rejects(set('heart',true,one,draft),/unavailable/);assert.equal(draft in await get([post,draft],one),false);
 await db.exec('reset role');await db.exec(sql);await identity(one);assert.ok((await get([post],one))[post].mine.includes('purple'),'migration reruns preserve selections');
 await db.exec('reset role');await db.exec(`create function public.mc_allowed(text,uuid) returns boolean language sql as $$select false$$;`);await identity(one);await assert.rejects(set('heart'),/restricted/);
 await identity(null);assert.deepEqual((await get())[post].mine,[]);assert.equal((await get())[post].counts.purple,1);
 await db.exec('reset role');await db.exec(`update public.announcements set status='draft' where id='${post}'`);await identity(null);assert.deepEqual(await get(),{});
 await db.exec('reset role');await db.exec(`delete from public.announcements where id='${post}'`);assert.equal((await db.query('select count(*)::int n from public.announcement_reactions')).rows[0].n,0);
 }finally{await db.close();}
});
