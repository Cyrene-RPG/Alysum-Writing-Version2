import test from 'node:test';
import assert from 'node:assert/strict';
import {createBooksApi} from '../../synchronization-engine/books.js';
const cacheKey='alysum:editor:draft-cache-editor';
function fixture(){
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
 globalThis.window={setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;}};
 let row={id:'shared',user_id:'owner',title:'Shared book',updated:1,created:1,sections:{front:[],body:[{id:'ch',kind:'chapter',title:'Chapter',content:'<p>Original.</p>'}],back:[]},words:1,media_format:'novel',publish_meta:{},published_chapter_ids:[]};
 let failRead=false,failWrite=false,lastPatch,inserts=0;
 const client={rpc:async(name)=>{assert.equal(name,'list_editable_books');if(failRead)throw Error('Network');return {data:row?[structuredClone(row)]:[]};},from:()=>{
  const q={then(resolve,reject){return q.single().then(result=>resolve(result.error?.code==='PGRST116'?{data:[],error:null}:result.error?result:{data:result.data?[result.data]:[],error:null}),reject);},select(){return q;},eq(){return q;},async maybeSingle(){if(failRead)throw Error('Network');return {data:structuredClone(row)};},update(patch){lastPatch=patch;return q;},async single(){if(failWrite)throw Error('permission denied');row={...row,...lastPatch};return {data:structuredClone(row)};},insert(){inserts++;throw Error('Unexpected insert');}};return q;
 }};
 return {api:createBooksApi({mode:'cloud',user:{id:'editor'}},client),get patch(){return lastPatch;},get inserts(){return inserts;},revoke(){row=null;},failReads(){failRead=true;},failWrites(){failWrite=true;},cached(){return JSON.parse(store.get(cacheKey)||'[]');}};
}
test('Studio includes shared books and editor saves preserve the real owner',async()=>{
 const f=fixture();assert.equal((await f.api.listBooks())[0].id,'shared');
 const saved=await f.api.updateBook('shared',{title:'Edited',publish_meta:{private:true},is_published:true});
 assert.equal(saved._synced,true);assert.equal(saved.user_id,'owner');assert.equal(f.cached()[0].user_id,'owner');
 assert.equal('publish_meta' in f.patch,false);assert.equal('is_published' in f.patch,false);
});
test('failed reads cannot reopen shared books using stale cached permission',async()=>{
 const f=fixture();await f.api.listBooks();f.failReads();
 assert.equal(f.api.peekBook('shared'),null);assert.deepEqual(f.api.peekBooks(),[]);
 assert.deepEqual(await f.api.listBooks(),[]);assert.equal(await f.api.getBook('shared'),null);
});
test('revoked access keeps unsynced text locally without recreating or listing the book',async()=>{
 const f=fixture();await f.api.getBook('shared');f.failWrites();
 const saved=await f.api.updateBook('shared',{title:'Unsynced writing'});
 assert.equal(saved._synced,false);assert.match(saved._syncError,/permission/);assert.equal(saved.user_id,'owner');
 f.revoke();assert.equal(await f.api.getBook('shared'),null);assert.deepEqual(await f.api.listBooks(),[]);
 assert.equal(f.cached()[0].title,'Unsynced writing');assert.equal(f.cached()[0]._pending,true);
 assert.deepEqual(await f.api.syncPending(),{synced:0,failed:1});assert.equal(f.inserts,0);
});

test('failed cloud saves do not claim a device copy when browser storage is full',async()=>{const f=fixture();await f.api.getBook('shared');f.failWrites();globalThis.localStorage.setItem=()=>{throw Error('Quota exceeded');};const saved=await f.api.updateBook('shared',{title:'Only in the open editor'});assert.equal(saved._synced,false);assert.equal(saved._cached,false);assert.notEqual(f.cached()[0].title,'Only in the open editor');});
