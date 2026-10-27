import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../../applications/main-site/public/sw.js',import.meta.url),'utf8');
const studio=await readFile(new URL('../../../applications/studio/pages/studio.html',import.meta.url),'utf8');
function fixture({fetchResponse=async()=>new Response(studio),cached=true}={}){
 const listeners={},entries=new Map();if(cached)entries.set('/studio',new Response('<p>Old Studio menu</p>'));
 const key=request=>typeof request==='string'?request:new URL(request.url).pathname;
 const cache={async match(request){return entries.get(key(request))?.clone();},async put(request,response){entries.set(key(request),response);}};
 const context=vm.createContext({URL,Response,Request,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,25)),fetch:fetchResponse,
   caches:{async open(){return cache;}},self:{location:{origin:'https://alysumwriting.com'},addEventListener:(name,fn)=>listeners[name]=fn}});
 vm.runInContext(source,context);
 async function navigate(path){
  let response;const pending=[];
  listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://alysumwriting.com'+path,headers:new Headers({accept:'text/html'})},respondWith(value){response=Promise.resolve(value);},waitUntil(value){pending.push(value);}});
  return{response:await response,pending,entries};
 }
 return{navigate,entries};
}
test('online Studio serves the deployed reminder controls instead of an old cached menu',async()=>{
 const f=fixture();const {response}=await f.navigate('/studio');assert.match(await response.text(),/id="bookMenuReminders"/);
 assert.match(await f.entries.get('/studio').clone().text(),/id="bookReminderForm"/);
});
test('offline Studio keeps its cached bookshelf available without clearing draft storage',async()=>{
 const f=fixture({fetchResponse:async()=>{throw Error('offline');}});
 const {response,pending}=await f.navigate('/studio');assert.match(await response.text(),/Old Studio menu/);await Promise.all(pending);
});
test('a slow Studio request falls back quickly, then updates the cache for the next visit',async()=>{
 let finish;const f=fixture({fetchResponse:()=>new Promise(resolve=>finish=resolve)});
 const {response,pending}=await f.navigate('/studio');assert.match(await response.text(),/Old Studio menu/);
 finish(new Response(studio));await Promise.all(pending);assert.match(await f.entries.get('/studio').clone().text(),/id="bookMenuReminders"/);
});
test('a server error falls back to the saved Studio document',async()=>{
 const {response}=await fixture({fetchResponse:async()=>new Response('server error',{status:503})}).navigate('/studio');assert.match(await response.text(),/Old Studio menu/);
});
test('the editor still opens its cached shell immediately and updates in the background',async()=>{
 let finish;const f=fixture({cached:false,fetchResponse:()=>new Promise(resolve=>finish=resolve)});f.entries.set('/editor',new Response('Saved editor'));
 const {response,pending}=await f.navigate('/editor');assert.equal(await response.text(),'Saved editor');finish(new Response('New editor'));await Promise.all(pending);
});
test('legacy Studio HTML URLs still redirect to the canonical page',async()=>{
 const {response}=await fixture().navigate('/studio.html');assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://alysumwriting.com/studio');
});
