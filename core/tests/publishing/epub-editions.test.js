import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEpubListing,wholeBookAccess,validateEpubFile} from '../../ebooks/model.js';
import {publishEpub} from '../../ebooks/publication.js';
import {handleAuthorAccess} from '../../server/http-handlers/author-access.mjs';
const owner='10000000-0000-4000-8000-000000000001',buyer='20000000-0000-4000-8000-000000000002',connection='30000000-0000-4000-8000-000000000003';
const book={id:'epub-book',user_id:owner,publish_meta:{epubEdition:true,workType:'original'},sections:{body:[{id:'one',title:'Dedication',content:'<p>A short dedication.</p>'},{id:'two',title:'Chapter 1',content:'<p>PRIVATE prose.</p>'}]}};
const edition={chapterIds:['one','two']},form={title:'Book',author:'Writer',summary:'Description',genres:['fantasy'],rating:'general',workType:'original',warningMeta:{version:1,reviewed:true,noneApply:true,coreIds:[],entries:[]},price:'4.99',productUrl:'https://ko-fi.com/s/fullbook',connectionId:connection,currency:'USD',rightsConfirmed:true};
function fixture({unlocked=['one','two'],source=book,authenticated=true,exists=true}={}){
 const writes=[],services={
  async user(){if(!authenticated)throw Error('Sign in to Alysum.');return{id:buyer,email:'reader@example.com'};},
  async signEpub(path){writes.push({sign:path});return 'https://private.example/signed';},
  async db(table,{body}={}){
   if(table==='books')return[source];
   if(table==='epub_editions')return exists?[{owner_id:owner,chapter_ids:edition.chapterIds,storage_path:owner+'/epub-book/upload.epub',file_name:'book.epub'}]:[];
   if(table==='author_access_connections')return[{id:connection,owner_id:owner,provider:'kofi'}];
   if(table==='rpc/read_author_access')return unlocked.map(id=>({id,text:'Private'}));
   if(table==='rpc/save_author_access_book'){writes.push(body);return null;}
   throw Error('Unexpected '+table);
  }
 };
 return {writes,run:(action,body)=>handleAuthorAccess(new Request('https://alysumwriting.com/api/author-access?action='+action+'&book=epub-book',{method:body?'POST':'GET',headers:{Authorization:'Bearer test',Origin:'https://alysumwriting.com'},body:body?JSON.stringify(body):undefined}),{},{services})};
}
test('EPUB accepts bounded .epub files only',()=>{validateEpubFile({name:'BOOK.EPUB',size:5});for(const file of [{name:'book.zip',size:5},{name:'book.epub',size:0},{name:'book.epub',size:31*1024*1024}])assert.throws(()=>validateEpubFile(file));});
test('whole EPUB listing contains every section, including short front matter, with no text or storage paths',()=>{
 const data=buildEpubListing(book,edition,form);assert.equal(data.editionFormat,'epub');assert.equal(data.serializationStatus,'complete');assert.deepEqual(data.publishedChapterIds,['one','two']);assert.equal(data.chapters.length,2);assert.ok(data.chapters.every(ch=>ch.locked&&ch.content===''));assert.doesNotMatch(JSON.stringify(data),/PRIVATE|storagePath|signed/);
});
test('partial chapters, changed manuscript and fanfiction cannot configure a complete EPUB',()=>{
 assert.throws(()=>wholeBookAccess(book,{chapterIds:['two']},form));assert.throws(()=>wholeBookAccess({...book,publish_meta:{workType:'fanfiction'}},edition,form));
});
test('failure to protect EPUB stops public listing writes; access always saves first',async()=>{
 const sequence=[];await assert.rejects(publishEpub({book,edition,form,configure:async()=>{sequence.push('access');throw Error('offline');},saveListing:async()=>sequence.push('listing')}));assert.deepEqual(sequence,['access']);
 await publishEpub({book,edition,form,configure:async body=>{sequence.push('protected');assert.deepEqual(body.chapterIds,['one','two']);},saveListing:async data=>{sequence.push('listing');assert.ok(data.chapters.every(ch=>ch.locked));}});assert.deepEqual(sequence,['access','protected','listing']);
});
test('rights, metadata, warning review and price are required before any payment setup',async()=>{
 for(const patch of [{rightsConfirmed:false},{price:'0'},{price:'2.001'},{warningMeta:null},{author:''},{summary:''},{genres:[]},{workType:'fanfiction'}])await assert.rejects(publishEpub({book,edition,form:{...form,...patch},configure:()=>assert.fail('should not configure'),saveListing:()=>assert.fail('should not publish')}));
});
test('private download is allowed only with all purchased sections; partial/refunded/hidden access never signs a file',async()=>{
 for(const unlocked of [[],['one'],['two']]){const f=fixture({unlocked});assert.equal((await f.run('epub-download')).status,403);assert.deepEqual(f.writes,[]);}
 const f=fixture();const response=await f.run('epub-download');assert.equal(response.status,200);assert.equal((await response.json()).fileName,'book.epub');assert.equal(f.writes.length,1);
});
test('anonymous, missing edition and fanfiction downloads cannot create links',async()=>{
 for(const [options,status] of [[{authenticated:false},401],[{exists:false},404],[{source:{...book,publish_meta:{workType:'fanfiction'}}},403]]){const f=fixture(options);assert.equal((await f.run('epub-download')).status,status);assert.deepEqual(f.writes,[]);}
});
test('EPUB server configuration allows short sections only for the entire registered original book',async()=>{
 const body=wholeBookAccess(book,edition,form),f=fixture();const response=await f.run('configure',body);assert.equal(response.status,200,JSON.stringify(await response.json()));assert.equal(f.writes[0].p_chapters.length,2);
 for(const patch of [{chapterIds:['two']},{chapterIds:[]},{pricingMode:'individual'}]){const bad=fixture();assert.equal((await bad.run('configure',{...body,...patch})).status,400);assert.deepEqual(bad.writes,[]);}
 const missing=fixture({exists:false});assert.equal((await missing.run('configure',body)).status,400);
});
