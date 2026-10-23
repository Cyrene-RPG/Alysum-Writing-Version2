/** Real UI in an isolated DOM. JSDOM_MODULE points to an installed jsdom. */
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';import {webcrypto} from 'node:crypto';import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)(process.env.JSDOM_MODULE||'jsdom');
const pause=()=>new Promise(r=>setTimeout(r,5));async function until(check){for(let i=0;i<100;i++){if(check())return;await pause();}throw Error('Chat did not settle');}
const message=(id,body='Message '+id)=>({id:String(id),senderId:'other',name:'Sample Moderator',role:'moderator',body,createdAt:new Date().toISOString()});
async function harness({empty=false}={}){
 const dom=new JSDOM('<main></main>',{url:'https://alysum.test/moderation?view=chat',pretendToBeVisual:true}),{window}=dom;
 const context=vm.createContext({document:window.document,window,crypto:webcrypto,setTimeout,clearTimeout});
 const module=new vm.SourceTextModule(await fs.readFile(new URL('../../../applications/moderation/page-ui/chat.js',import.meta.url),'utf8'),{context});await module.link(()=>{});await module.evaluate();
 const records=empty?[]:[message(1),message(2),message(3,'<img src=x onerror=bad()>')],calls=[],keys=new Map();let failSend=false,failRead=null,pending=null,lost=false;
 const service={list:async({before=null,after=null}={})=>{if(pending)await pending;if(failRead)throw failRead;const filtered=records.filter(m=>(!before||BigInt(m.id)<BigInt(before))&&(!after||BigInt(m.id)>BigInt(after)));const items=after?filtered.slice(0,2):filtered.slice(-2);return {items,hasOlder:records.some(m=>BigInt(m.id)<BigInt(items[0]?.id||'0')),hasNewer:after&&filtered.length>2};},send:async(body,key)=>{calls.push({body,key});if(!keys.has(key)){const row=message(records.length+1,body);row.senderId='me';records.push(row);keys.set(key,row);}if(failSend)throw Error('Connection interrupted');return {id:keys.get(key).id};}};
 const mounted=module.namespace.mountModeratorChat({host:window.document.querySelector('main'),service,userId:'me',pollMs:60000,onAccessLost:()=>{lost=true;}});
 await until(()=>window.document.querySelector('button[type=submit]')?.disabled===false);
 const input=window.document.querySelector('textarea'),form=window.document.querySelector('form');
 return {dom,window,mounted,records,calls,input,form,get lost(){return lost;},failSend:v=>{failSend=v;},failRead:e=>{failRead=e;},defer:p=>{pending=p;},submit(){form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));},destroy(){mounted.destroy();dom.window.close();}};
}
test('chat renders plain text, loads earlier messages, catches up and deduplicates',async()=>{
 const h=await harness();try{
  assert.equal(h.window.document.querySelectorAll('li').length,2);assert.equal(h.window.document.querySelectorAll('img').length,0);assert.match(h.mounted.root.textContent,/<img src=x/);
  [...h.window.document.querySelectorAll('button')].find(b=>b.textContent==='Load earlier messages').click();await until(()=>h.window.document.querySelectorAll('li').length===3);
  h.records.push(message(4),message(5),message(6));await h.mounted.refresh();await until(()=>h.window.document.querySelectorAll('li').length===6);
  await h.mounted.refresh();assert.equal(h.window.document.querySelectorAll('li').length,6);
 }finally{h.destroy();}
});
test('empty history collapses and the composer accepts the first message',async()=>{
 const h=await harness({empty:true});try{
  assert.equal(h.window.document.querySelector('.mc-chat-scroll').hidden,true);
  assert.match(h.mounted.root.textContent,/No messages yet/);
  h.input.value='First message';h.submit();await until(()=>h.window.document.querySelectorAll('li').length===1);
  assert.equal(h.window.document.querySelector('.mc-chat-scroll').hidden,false);assert.equal(h.input.value,'');
 }finally{h.destroy();}
});
test('uncertain send preserves draft and retry identity; a successful retry does not duplicate',async()=>{
 const h=await harness();try{
  h.failSend(true);h.input.value='Hello team';h.submit();await until(()=>!h.input.readOnly);
  assert.equal(h.input.value,'Hello team');assert.match(h.mounted.root.textContent,/Connection interrupted/);
  h.failSend(false);h.submit();await until(()=>h.input.value==='');assert.equal(h.calls[0].key,h.calls[1].key);assert.equal(h.records.filter(m=>m.body==='Hello team').length,1);
  h.input.value='A new message';h.submit();await until(()=>h.calls.length===3&&!h.input.readOnly);assert.notEqual(h.calls[1].key,h.calls[2].key);
 }finally{h.destroy();}
});
test('access revocation clears chat and pending responses cannot restore it after teardown',async()=>{
 const h=await harness();try{
  h.failRead(Object.assign(Error('Staff access revoked'),{code:'42501'}));await h.mounted.refresh();assert.equal(h.lost,true);assert.equal(h.window.document.querySelector('.mc-chat'),null);
 }finally{h.destroy();}
 const pending=await harness();try{
  let release;pending.defer(new Promise(r=>{release=r;}));const request=pending.mounted.refresh();pending.mounted.destroy();release();await request;assert.equal(pending.window.document.querySelector('.mc-chat'),null);
 }finally{pending.destroy();}
});
test('failed ordinary refresh keeps history and draft; Ctrl+Enter sends without swallowing plain Enter',async()=>{
 const h=await harness();try{
  h.input.value='Draft stays';h.failRead(Error('Network unavailable'));await h.mounted.refresh();assert.equal(h.input.value,'Draft stays');assert.equal(h.window.document.querySelectorAll('li').length,2);
  h.failRead(null);h.input.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(h.calls.length,0);
  h.input.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));await until(()=>h.calls.length===1);
 }finally{h.destroy();}
});
