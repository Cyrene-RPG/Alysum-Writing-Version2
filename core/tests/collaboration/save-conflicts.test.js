import test from 'node:test';import assert from 'node:assert/strict';
import {createBooksApi} from '../../synchronization-engine/books.js';
const clone=v=>structuredClone(v),key='alysum:editor:draft-cache-writer';
const base=()=>({id:'book',user_id:'writer',title:'Original',updated:1,created:1,sections:{front:[],body:[{id:'one',title:'One',content:'<p>Original one</p>'},{id:'two',title:'Two',content:'<p>Original two</p>'}],back:[]},words:4});
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(local=base(),remote=base()){
 const store=new Map([[key,JSON.stringify(local?[local]:[])]]);globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),key:i=>[...store.keys()][i],get length(){return store.size;}};globalThis.window={setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;}};
 let server=clone(remote),readGate=null,writeGate=null,failRead=false,failWrite=false,loseAck=false,loseRead=false,inserts=0,updates=0;const reading=gate(),writing=gate();
 const client={rpc:async()=>({data:server?[clone(server)]:[]}),from(){let patch,insert=false;const filters={};const q={then(resolve,reject){return q.single().then(result=>resolve(result.error?.code==='PGRST116'?{data:[],error:null}:result.error?result:{data:result.data?[result.data]:[],error:null}),reject);},select(){return q;},eq(k,v){filters[k]=v;return q;},update(p){patch=clone(p);updates++;return q;},insert(p){patch=clone(p);insert=true;inserts++;return q;},async maybeSingle(){reading.resolve();if(failRead||loseRead){loseRead=false;throw Error('Network read failed');}const snapshot=clone(server);if(readGate)await readGate;return{data:snapshot};},async single(){writing.resolve();if(writeGate)await writeGate;if(failWrite)throw Error('Network write failed');if(insert){if(server)return{error:{code:'23505'}};server=patch;}else{if(!server||String(server.updated)!==String(filters.updated))return{error:{code:'PGRST116'}};server={...server,...patch};}if(loseAck){loseAck=false;throw Error('Response lost after commit');}return{data:clone(server)};}};return q;}};
 const api=(options)=>createBooksApi({mode:'cloud',user:{id:'writer'}},client,options);
 return{api:api(),another:api,store,loseAck(){loseAck=true;},failNextRead(){loseRead=true;},cache:()=>JSON.parse(store.get(key))[0],server:()=>server,readGate(p){readGate=p;},writeGate(p){writeGate=p;},reading:reading.promise,writing:writing.promise,failRead(v=true){failRead=v;},failWrite(v=true){failWrite=v;},counts:()=>({inserts,updates}),remote(row){server=clone(row);}};
}
test('pending writing survives a newer cloud timestamp in get and list',async()=>{const f=fixture({...base(),title:'Unsynced',updated:100,_cloudUpdated:1,_baseUpdated:1,_pending:true}, {...base(),title:'Cloud',updated:200});assert.equal((await f.api.getBook('book')).title,'Unsynced');assert.equal((await f.api.listBooks())[0].title,'Unsynced');assert.equal(f.cache()._baseUpdated,1);assert.deepEqual(await f.api.syncPending(),{synced:0,failed:1});assert.equal(f.server().title,'Cloud');assert.equal(f.cache().title,'Unsynced');});
test('manual refresh uses the server even when a clean local clock is newer, and advances the next save version',async()=>{
 const f=fixture({...base(),title:'Old tab',updated:999},{...base(),title:'From phone',updated:5});
 assert.equal((await f.api.refreshBook('book')).title,'From phone');assert.equal(f.cache().title,'From phone');
 assert.equal((await f.api.updateBook('book',{title:'Edited after sync'}))._synced,true);assert.equal(f.server().title,'Edited after sync');
});
test('manual refresh cannot replace pending edits or writing stashed during its read',async()=>{
 const pending=fixture({...base(),title:'Local changes',_pending:true,_baseUpdated:1});
 await assert.rejects(pending.api.refreshBook('book'),error=>error.code==='BOOK_LOCAL_PENDING');assert.equal(pending.cache().title,'Local changes');
 const f=fixture(),g=gate();f.readGate(g.promise);const read=f.api.refreshBook('book');await f.reading;
 f.api.stashBook('book',{title:'Typing during sync'});g.resolve();
 await assert.rejects(read,error=>error.code==='BOOK_LOCAL_PENDING');assert.equal(f.cache().title,'Typing during sync');assert.deepEqual(f.counts(),{inserts:0,updates:0});
});
test('failed or revoked manual refresh never returns a cached success or deletes device writing',async()=>{
 const f=fixture();f.failRead();await assert.rejects(f.api.refreshBook('book'),/Network read failed/);assert.equal(f.cache().title,'Original');
 f.failRead(false);f.remote(null);await assert.rejects(f.api.refreshBook('book'),/unavailable online/);assert.equal(f.cache().title,'Original');
});
test('sync read cannot consume a newer stashed edit',async()=>{const f=fixture({...base(),_pending:true,_cloudUpdated:1,_baseUpdated:1}),g=gate();f.readGate(g.promise);const sync=f.api.syncPending();await f.reading;f.api.stashBook('book',{title:'Latest'});g.resolve();assert.equal((await sync).failed,1);assert.equal(f.cache().title,'Latest');assert.equal(f.cache()._pending,true);assert.equal(f.counts().updates,0);});
test('old write completion keeps newer queued typing and advances only its own confirmed base',async()=>{const f=fixture(),g=gate();await f.api.getBook('book');f.writeGate(g.promise);const save=f.api.updateBook('book',{title:'Earlier'});await f.writing;f.api.stashBook('book',{title:'Latest'});g.resolve();assert.equal((await save)._synced,true);assert.equal(f.cache().title,'Latest');assert.equal(f.cache()._pending,true);assert.deepEqual(await f.api.syncPending(),{synced:1,failed:0});assert.equal(f.server().title,'Latest');});
test('stale second writer cannot erase a chapter from the first writer',async()=>{const f=fixture(),other=f.another();const a=await f.api.getBook('book'),b=await other.getBook('book');a.sections.body[0].content='Writer A';b.sections.body[1].content='Writer B';assert.equal((await f.api.updateBook('book',{sections:a.sections},{expectedUpdated:a._cloudUpdated}))._synced,true);const result=await other.updateBook('book',{sections:b.sections},{expectedUpdated:b._cloudUpdated});assert.equal(result._synced,false);assert.match(result._syncError,/another tab/);assert.equal(f.server().sections.body[0].content,'Writer A');assert.equal(f.cache().sections.body[1].content,'Writer B');assert.equal(f.cache()._pending,true);});
test('queued saves from one writer can follow its own acknowledgement',async()=>{const f=fixture();const b=await f.api.getBook('book');const results=await Promise.all([f.api.updateBook('book',{title:'First'},{expectedUpdated:b._cloudUpdated}),f.api.updateBook('book',{title:'Second'},{expectedUpdated:b._cloudUpdated})]);assert.ok(results.every(x=>x._synced));assert.equal(f.server().title,'Second');});
test('failed verification read never inserts an existing pending book',async()=>{const f=fixture({...base(),_pending:true,_baseUpdated:1});f.failRead();assert.equal((await f.api.syncPending()).failed,1);assert.deepEqual(f.counts(),{inserts:0,updates:0});assert.equal(f.cache()._pending,true);});
test('new offline books retain creation marker and upload after reconnection',async()=>{const f=fixture(null,null);f.failWrite();const created=await f.api.insertBook({title:'New'});assert.equal(created._synced,false);assert.equal(f.cache()._createdLocally,true);f.failWrite(false);assert.equal((await f.api.syncPending()).synced,1);assert.equal(f.server().title,'New');assert.equal(f.cache()._pending,undefined);});
test('a pending legacy copy without a base cannot overwrite a changed server book',async()=>{const f=fixture({...base(),_pending:true,title:'Legacy unsynced'});assert.equal((await f.api.syncPending()).failed,1);assert.equal(f.server().title,'Original');assert.equal(f.cache().title,'Legacy unsynced');});
test('explicit version restore refreshes a clean cache without discarding pending writing',async()=>{const f=fixture({...base(),updated:999});f.remote({...base(),title:'Restored version',updated:10});assert.equal((await f.api.getBook('book',{refresh:true})).title,'Restored version');f.api.stashBook('book',{title:'Typing during restore'});assert.equal((await f.api.getBook('book',{refresh:true})).title,'Typing during restore');});
test('two offline tabs retain independent recoverable manuscripts through overwrite and reload',async()=>{
 const f=fixture(),b=f.another(),aBook=await f.api.getBook('book'),bBook=await b.getBook('book');
 aBook.sections.body[0].content='<p>A offline only</p>';bBook.sections.body[1].content='<p>B offline only</p>';
 f.failWrite();await f.api.updateBook('book',{sections:aBook.sections});b.stashBook('book',{sections:bBook.sections});
 let copies=b.listRecoveryCopies('book');assert.ok(copies.some(c=>c.book.sections.body[0].content==='<p>A offline only</p>'));
 f.failWrite(false);assert.equal((await b.updateBook('book',{sections:bBook.sections}))._synced,true);
 copies=f.another().listRecoveryCopies('book');assert.equal(copies.length,1);assert.equal(copies[0].book.sections.body[0].content,'<p>A offline only</p>');
 assert.equal(f.server().sections.body[1].content,'<p>B offline only</p>');
});
test('reconnection saves the latest writing in a newly created offline book without reloading',async()=>{
 const f=fixture(null,null);f.failWrite();const created=await f.api.insertBook({title:'Offline new'});f.failWrite(false);
 const saved=await f.api.updateBook(created.id,{title:'Latest title',sections:created.sections});assert.equal(saved._synced,true);assert.equal(f.server().id,created.id);assert.equal(f.server().title,'Latest title');assert.equal(f.another().listRecoveryCopies(created.id).length,0);
});
test('a lost server response is acknowledged only after an exact authoritative read',async()=>{
 const f=fixture();await f.api.getBook('book');f.loseAck();const saved=await f.api.updateBook('book',{title:'Committed'});assert.equal(saved._synced,true);assert.equal(f.cache()._pending,undefined);assert.equal(f.another().listRecoveryCopies('book').length,0);
 assert.equal((await f.api.updateBook('book',{title:'Next edit'}))._synced,true);
});
test('a later retry acknowledges an already committed identical manuscript',async()=>{
 const f=fixture();await f.api.getBook('book');f.loseAck();f.failNextRead();assert.equal((await f.api.updateBook('book',{title:'Committed'}))._synced,false);
 assert.equal((await f.api.updateBook('book',{title:'Committed'}))._synced,true);assert.equal(f.cache()._pending,undefined);
});
test('a real conflict involving private notes is never mistaken for an acknowledgement',async()=>{
 const f=fixture();const b=await f.api.getBook('book');const remote=structuredClone(b);remote.updated=20;remote.sections.body[0].notes=[{id:'n',kind:'note',title:'Private',content:'Other note'}];f.remote(remote);
 b.sections.body[0].notes=[{id:'n',kind:'note',title:'Private',content:'My note'}];const result=await f.api.updateBook('book',{sections:b.sections});assert.equal(result._synced,false);assert.equal(f.server().sections.body[0].notes[0].content,'Other note');
});
test('a stalled save times out, preserves writing, and permits a later confirmed retry',async()=>{
 const f=fixture(),api=f.another({writeTimeoutMs:10}),g=gate();await api.getBook('book');f.writeGate(g.promise);
 const saved=await api.updateBook('book',{title:'Retained'});assert.equal(saved._synced,false);assert.match(saved._syncError,/too long/);assert.equal(f.cache().title,'Retained');assert.equal(f.cache()._pending,true);
 g.resolve();await new Promise(setImmediate);assert.equal((await api.updateBook('book',{title:'Retained'}))._synced,true);assert.equal((await api.updateBook('book',{title:'New writing'}))._synced,true);
});
test('a delayed acknowledgement never deletes the newer copy of the same tab',async()=>{
 const f=fixture(),g=gate();await f.api.getBook('book');f.writeGate(g.promise);const saved=f.api.updateBook('book',{title:'Earlier'});await f.writing;f.api.stashBook('book',{title:'Later'});g.resolve();await saved;
 const copies=f.another().listRecoveryCopies('book');assert.equal(copies.length,1);assert.equal(copies[0].book.title,'Later');
});
test('an ambiguous initial insert keeps one stable ID and can save subsequent new writing',async()=>{
 const f=fixture(null,null);f.loseAck();const created=await f.api.insertBook({title:'Initial'});assert.equal(created._synced,false);assert.equal(created.id,f.server().id);
 const saved=await f.api.updateBook(created.id,{title:'Continued writing',sections:created.sections});assert.equal(saved._synced,true);assert.equal(f.server().id,created.id);assert.equal(f.counts().inserts,1);
});
test('a timed-out old request cannot overwrite a newer confirmed save',async()=>{
 const f=fixture(),api=f.another({writeTimeoutMs:10}),g=gate();await api.getBook('book');f.writeGate(g.promise);
 assert.equal((await api.updateBook('book',{title:'Old request'}))._synced,false);f.writeGate(null);
 assert.equal((await api.updateBook('book',{title:'Latest request'}))._synced,true);g.resolve();await new Promise(setImmediate);
 assert.equal(f.server().title,'Latest request');assert.equal(f.cache().title,'Latest request');
});
test('recovery copies never cross account or book boundaries',async()=>{
 const f=fixture();await f.api.getBook('book');f.api.stashBook('book',{title:'Private writing'});
 const otherAccount=createBooksApi({mode:'cloud',user:{id:'other'}},{from(){throw Error('No cloud request expected');}});
 assert.deepEqual(otherAccount.listRecoveryCopies('book'),[]);assert.deepEqual(f.another().listRecoveryCopies('other-book'),[]);
});
test('first offline-book upload preserves settings edited before reconnection',async()=>{
 const f=fixture(null,null);f.failWrite();const b=await f.api.insertBook({title:'Offline'});f.failWrite(false);
 const saved=await f.api.updateBook(b.id,{publish_meta:{summary:'Private settings'}});assert.equal(saved._synced,true);assert.equal(f.server().publish_meta.summary,'Private settings');
});
test('pending sync reconciles an ambiguous creation before applying continued edits',async()=>{
 const f=fixture(null,null);f.loseAck();const b=await f.api.insertBook({title:'Initial'});f.api.stashBook(b.id,{title:'Continued'});
 assert.deepEqual(await f.api.syncPending(),{synced:1,failed:0});assert.equal(f.server().title,'Continued');assert.equal(f.counts().inserts,1);
});
test('storage pressure cannot replace another tab’s unjournaled pending copy',async()=>{
 const f=fixture({...base(),title:'Legacy pending A',_pending:true,_writerSession:'old-tab',_localRevision:'old'});await f.api.getBook('book');
 for(const key of [...f.store.keys()])if(key.startsWith('alysum:editor:pending-copy:'))f.store.delete(key);
 const original=globalThis.localStorage.setItem;globalThis.localStorage.setItem=(key,value)=>{if(key.startsWith('alysum:editor:pending-copy:'))throw Error('Quota');original(key,value);};
 f.failWrite();const result=await f.api.updateBook('book',{title:'New tab B'});assert.equal(result._synced,false);assert.equal(result._cached,false);assert.equal(f.cache().title,'Legacy pending A');
});
test('typing during a save, then reloading, still saves the latest writing',async()=>{
 // Mirrors the editor page: it keeps passing the version it opened with while a save is in flight.
 const f=fixture(),g=gate();const opened=await f.api.getBook('book');f.writeGate(g.promise);
 const save=f.api.updateBook('book',{title:'First'},{expectedUpdated:opened._cloudUpdated});await f.writing;
 f.api.stashBook('book',{title:'Second'},{expectedUpdated:opened._cloudUpdated});g.resolve();f.writeGate(null);assert.equal((await save)._synced,true);
 f.api.stashBook('book',{title:'Typed before closing'},{expectedUpdated:opened._cloudUpdated});
 const reopened=f.another();assert.deepEqual(await reopened.syncPending(),{synced:1,failed:0});assert.equal(f.server().title,'Typed before closing');
});
