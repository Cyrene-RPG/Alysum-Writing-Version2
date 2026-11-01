import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPassFixture,OWNER,BUYER,OTHER,source} from './fixture.mjs';
import {handleAuthorAccess} from '../../server/http-handlers/author-access.mjs';
import {sha256} from '../../server/http-handlers/paid-access.mjs';
import {createPurchasePassServices} from '../../server/http-handlers/purchase-passes.mjs';
const connection='40000000-0000-4000-8000-000000000004';
async function earlierFixture(){
 const f=await createPassFixture();
 await f.db.exec('create table library(id text primary key,user_id uuid,data jsonb);');
 await f.db.exec(await readFile(new URL('../../../supabase/live-site/supabase-author-chapter-access.sql',import.meta.url),'utf8'));
 await f.db.query('insert into author_access_connections(id,owner_id,provider,verifier_hash) values($1,$2,$3,$4)',[connection,OWNER,'kofi',await sha256('fixture-token')]);
 await f.services.db('rpc/save_author_access_book',{method:'POST',body:{p_book:'book',p_owner:OWNER,p_connection:connection,p_product:'old-product',p_url:'https://ko-fi.com/s/old-product',p_minimum:300,p_currency:'USD',p_chapters:[{id:'one',title:'Chapter 1',text:'PURCHASED EARLIER ONE',wordCount:600},{id:'two',title:'Chapter 2',text:'PURCHASED EARLIER TWO',wordCount:600}]}});
 await f.db.query('insert into library(id,user_id,data) values($1,$2,$3)',['book',OWNER,JSON.stringify({isPublished:true,publishedChapterIds:['one','two','three'],chapters:source.sections.body.map(c=>({...c,wordCount:600}))})]);
 await f.services.db('rpc/apply_author_access_sale',{method:'POST',body:{p_connection:connection,p_transaction:'purchase-before-retirement',p_email_hash:await sha256('earlier@example.com'),p_products:['old-product'],p_amount:300,p_currency:'USD',p_reversed:false}});
 const services={...f.services,async user(request,required=true){if(!request.headers.has('Authorization')&&!required)return null;const user=await f.services.user(request);return{...user,email:user.id===BUYER?'earlier@example.com':'other@example.com'};}};
 f.earlier=async(action,{as=BUYER,body,query={}}={})=>{const url=new URL('https://alysumwriting.com/api/author-access');url.searchParams.set('action',action);for(const[k,v]of Object.entries(query))url.searchParams.set(k,v);return handleAuthorAccess(new Request(url,{method:body?'POST':'GET',headers:as?{Authorization:'Bearer '+as}:{},body:body?JSON.stringify(body):undefined}),{},{services});};
 return f;
}
test('real SQL: earlier verified-email purchases remain discoverable and claimable; retirement never changes stored grants or private snapshots',async()=>{
 const f=await earlierFixture();try{
  assert.equal((await f.earlier('read',{as:OTHER,query:{book:'book'}})).status,200);assert.deepEqual((await(await f.earlier('read',{as:OTHER,query:{book:'book'}})).json()).chapters,[]);
  const listing=await(await f.earlier('purchases')).json();assert.equal(listing.purchases[0].id,'book');assert.doesNotMatch(JSON.stringify(listing),/PURCHASED EARLIER/);
  const text=await(await f.earlier('read',{query:{book:'book'}})).json();assert.deepEqual(text.chapters.map(c=>c.id),['one','two']);assert.match(JSON.stringify(text),/PURCHASED EARLIER/);
  const snapshots=(await f.db.query('select * from author_access_books')).rows,grants=(await f.db.query('select * from author_access_sales')).rows;
  assert.equal(grants[0].buyer_id,BUYER);
  for(const action of ['connect','configure'])assert.equal((await f.earlier(action,{as:OWNER,body:{book:'book',chapterIds:[],secret:'replace-old-token'}})).status,410);
  assert.deepEqual((await f.db.query('select * from author_access_books')).rows,snapshots);assert.deepEqual((await f.db.query('select * from author_access_sales')).rows,grants);
  const publicRow=(await f.db.query('select data from library')).rows[0].data;assert.ok(publicRow.chapters.slice(0,2).every(c=>c.locked&&c.content===''));assert.doesNotMatch(JSON.stringify(publicRow),/PURCHASED EARLIER/);
  assert.equal((await(await f.earlier('read',{query:{book:'book'}})).json()).chapters.length,2);
 }finally{await f.db.close();}
});
test('real SQL: new pass buyers read through Library compatibility without receiving another bundle; refunds and revocations remain separate',async()=>{
 const f=await earlierFixture();try{
  const created=await f.run('create',{body:{requestId:crypto.randomUUID(),bookId:'book',mode:'bundle',chapterIds:['three'],title:'Later chapter',price:'1.00',currency:'USD'}});const pass=(await created.json()).pass;
  const batch=await(await f.run('generate',{body:{requestId:crypto.randomUUID(),passId:pass.id,count:1}})).json();await f.run('redeem',{as:BUYER,body:{code:batch.codes[0]}});
  const read=await(await f.run('book-read',{as:BUYER,query:{book:'book'}})).json();assert.deepEqual(read.chapters.map(c=>c.id),['three']);assert.doesNotMatch(JSON.stringify(read),/PRIVATE ONE|PRIVATE TWO|PURCHASED EARLIER/);
  assert.deepEqual((await(await f.run('book-read',{as:OTHER,query:{book:'book'}})).json()).chapters,[]);
  await f.services.db('rpc/apply_author_access_sale',{method:'POST',body:{p_connection:connection,p_transaction:'purchase-before-retirement',p_email_hash:await sha256('earlier@example.com'),p_products:['old-product'],p_amount:300,p_currency:'USD',p_reversed:true}});
  assert.deepEqual((await(await f.earlier('read',{query:{book:'book'}})).json()).chapters,[]);assert.equal((await(await f.run('book-read',{as:BUYER,query:{book:'book'}})).json()).chapters.length,1);
 }finally{await f.db.close();}
});
test('real SQL: whole-book EPUB passes require an active buyer grant before signing; bundle and stranger requests cannot download',async()=>{
 const f=await createPassFixture();try{
  await f.db.exec('create table epub_editions(book_id text,owner_id uuid,chapter_ids jsonb,storage_path text,file_name text)');
  await f.db.query('update books set publish_meta=$1 where id=$2',[JSON.stringify({workType:'original',epubEdition:true}),'book']);
  await f.db.query('insert into epub_editions values($1,$2,$3,$4,$5)',['book',OWNER,JSON.stringify(['one','two','three']),OWNER+'/book/upload.epub','book.epub']);
  let signed=0;f.services.signEpub=async path=>{signed++;assert.equal(path,OWNER+'/book/upload.epub');return 'https://private.example/file';};
  const input={requestId:crypto.randomUUID(),bookId:'book',mode:'book',chapterIds:[],title:'EPUB',price:'3.00',currency:'USD'};
  assert.equal((await f.run('create',{body:{...input,mode:'bundle',chapterIds:['one']}})).status,400);
  const pass=(await(await f.run('create',{body:input})).json()).pass;const batch=await(await f.run('generate',{body:{requestId:crypto.randomUUID(),passId:pass.id,count:1}})).json();
  assert.equal((await f.run('epub-download',{as:BUYER,query:{pass:pass.id}})).status,403);assert.equal(signed,0);
  await f.run('redeem',{as:BUYER,body:{code:batch.codes[0]}});assert.equal((await f.run('epub-download',{as:BUYER,query:{pass:pass.id}})).status,200);assert.equal(signed,1);
  const grant=(await f.db.query('select id from purchase_pass_grants')).rows[0];await f.run('revoke',{body:{passId:pass.id,grantId:grant.id}});assert.equal((await f.run('epub-download',{as:BUYER,query:{pass:pass.id}})).status,403);assert.equal(signed,1);
 }finally{await f.db.close();}
});
test('EPUB signing uses server credentials and verifies the exact private storage response',async()=>{
 const env={SUPABASE_SERVICE_ROLE_KEY:'server-fixture'},base='https://jrfxgpkpbacajhcwimgz.supabase.co';
 const service=createPurchasePassServices(env,async(url,request)=>{assert.match(url,/storage\/v1\/object\/sign\/book-epubs\//);assert.equal(request.headers.Authorization,'Bearer server-fixture');assert.equal(JSON.parse(request.body).expiresIn,60);return Response.json({signedURL:'/object/sign/book-epubs/'+OWNER+'/book/upload.epub?token=fixture'});});
 assert.equal(await service.signEpub(OWNER+'/book/upload.epub'),base+'/storage/v1/object/sign/book-epubs/'+OWNER+'/book/upload.epub?token=fixture');
 const bad=createPurchasePassServices(env,async()=>Response.json({signedURL:'https://attacker.example/file?token=fixture'}));await assert.rejects(bad.signEpub(OWNER+'/book/upload.epub'));
});
test('Library purchase-pass requests use verified session tokens and reject an account switch while private text is loading',async()=>{
 const {readPurchasePassBook}=await import('../../purchase-access/reading.js');
 let current=BUYER;const client={auth:{getSession:async()=>({data:{session:{access_token:'fixture-token',user:{id:current}}}})}};
 const result=await readPurchasePassBook(client,'book',async(url,options)=>{assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.match(url,/action=book-read/);return Response.json({chapters:[{id:'three',text:'PAID THREE'}]});});assert.equal(result[0].text,'PAID THREE');
 await assert.rejects(readPurchasePassBook(client,'book',async()=>{current=OTHER;return Response.json({chapters:[{id:'three',text:'PAID THREE'}]});}),/account changed/);
});
