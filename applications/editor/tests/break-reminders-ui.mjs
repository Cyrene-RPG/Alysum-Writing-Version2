import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const {JSDOM}=createRequire(import.meta.url)(process.env.JSDOM_MODULE || 'jsdom');
const ui=await readFile(new URL('../page-ui/break-reminders.js',import.meta.url),'utf8');
const core=await readFile(new URL('../../../core/account/break-reminders.js',import.meta.url),'utf8');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
function memoryStore() {
 const data=new Map();
 return {getItem:(key)=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:(key)=>data.delete(key)};
}
async function mount(options={}) {
 const dom=new JSDOM('<main></main>',{url:'https://example.com/editor?book=one',runScripts:'outside-only'});
 const context=dom.getInternalVMContext();
 const api=new vm.SourceTextModule(core,{context});await api.link(()=>{});await api.evaluate();
 const module=new vm.SourceTextModule(ui,{context});await module.link(()=>api);await module.evaluate();
 const storage=memoryStore();
 let now=1_000;
 const handle=module.namespace.mountBreakReminders({
  bookId:'one',getWriterName:()=>'Jane Doe',storage,now:()=>now,hourMs:20,promptDelayMs:0,root:dom.window.document,...options,
 });
 await tick(5);
 return {dom,storage,close(){handle.destroy();dom.window.close();}};
}
test('opening a book asks, then Yes leads to 1/2/3 hour choices',async()=>{
 const h=await mount();
 try{
  const overlay=h.dom.window.document.getElementById('breakReminderOverlay');
  assert.equal(overlay.hidden,false);
  assert.match(overlay.textContent,/Would you like to set break reminders/);
  [...overlay.querySelectorAll('button')].find(b=>b.textContent==='Yes').click();
  assert.deepEqual([...overlay.querySelectorAll('button')].map(b=>b.textContent),['1 hour','2 hours','3 hours']);
 }finally{h.close();}
});
test('choosing an interval later shows the stretch copy for that wait',async()=>{
 const h=await mount();
 try{
  const overlay=h.dom.window.document.getElementById('breakReminderOverlay');
  [...overlay.querySelectorAll('button')].find(b=>b.textContent==='Yes').click();
  [...overlay.querySelectorAll('button')].find(b=>b.textContent==='2 hours').click();
  assert.equal(overlay.hidden,true);
  await tick(50);
  assert.equal(overlay.hidden,false);
  assert.match(overlay.textContent,/Hey Jane, it's been 2 hours/);
  assert.match(overlay.textContent,/rehydrate/);
 }finally{h.close();}
});
test('No keeps the session quiet',async()=>{
 const h=await mount();
 try{
  const overlay=h.dom.window.document.getElementById('breakReminderOverlay');
  [...overlay.querySelectorAll('button')].find(b=>b.textContent==='No').click();
  assert.equal(overlay.hidden,true);
  assert.equal(JSON.parse(h.storage.getItem('alysum:editor:break-reminder:one')).enabled,false);
 }finally{h.close();}
});
