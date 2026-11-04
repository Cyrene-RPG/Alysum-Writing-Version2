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
 const dom=new JSDOM('<div id="editorActions"></div><main></main>',{url:'https://example.com/editor?book=one',runScripts:'outside-only'});
 const context=dom.getInternalVMContext();
 const api=new vm.SourceTextModule(core,{context});await api.link(()=>{});await api.evaluate();
 const module=new vm.SourceTextModule(ui,{context});await module.link(()=>api);await module.evaluate();
 const storage=options.storage||memoryStore();
 let now=options.nowValue??1_000;
 const handle=module.namespace.mountBreakReminders({
  bookId:'one',getWriterName:()=>'Jane Doe',storage,now:()=>now,hourMs:20,promptDelayMs:0,paintMs:60_000,root:dom.window.document,...options,
 });
 await tick(5);
 return {dom,storage,setNow(value){now=value;},close(){handle.destroy();dom.window.close();}};
}
function overlay(h){return h.dom.window.document.getElementById('breakReminderOverlay');}
function click(h,label){
 const node=[...overlay(h).querySelectorAll('button')].find(b=>b.textContent===label);
 assert.ok(node,label);
 node.click();
}
test('opening a book asks, then Yes leads to 1/2/3 hour choices',async()=>{
 const h=await mount();
 try{
  assert.equal(overlay(h).hidden,false);
  assert.match(overlay(h).textContent,/Would you like to set break reminders/);
  click(h,'Yes');
  assert.deepEqual([...overlay(h).querySelectorAll('button')].map(b=>b.textContent),['1 hour','2 hours','3 hours']);
 }finally{h.close();}
});
test('choosing an interval later shows the stretch copy for that wait',async()=>{
 const h=await mount();
 try{
  click(h,'Yes');
  click(h,'2 hours');
  assert.equal(overlay(h).hidden,true);
  const status=h.dom.window.document.getElementById('break-reminder-status');
  assert.equal(status.hidden,false);
  assert.equal(status.textContent,'Break in 2h');
  assert.equal(h.dom.window.document.getElementById('break-reminders').textContent,'Break in 2h');
  await tick(50);
  assert.equal(overlay(h).hidden,false);
  assert.match(overlay(h).textContent,/Hey Jane, it's been 2 hours/);
  assert.match(overlay(h).textContent,/rehydrate/);
 }finally{h.close();}
});
test('No keeps the session quiet, then Tools can still turn reminders on',async()=>{
 const h=await mount();
 try{
  click(h,'No');
  assert.equal(overlay(h).hidden,true);
  assert.equal(JSON.parse(h.storage.getItem('alysum:editor:break-reminder:one')).enabled,false);
  assert.equal(h.dom.window.document.getElementById('break-reminder-status').hidden,true);
  const tools=h.dom.window.document.getElementById('break-reminders');
  assert.equal(tools.textContent,'Break reminders');
  tools.click();
  assert.equal(overlay(h).hidden,false);
  assert.deepEqual([...overlay(h).querySelectorAll('button')].map(b=>b.textContent),['1 hour','2 hours','3 hours']);
  click(h,'1 hour');
  assert.equal(JSON.parse(h.storage.getItem('alysum:editor:break-reminder:one')).enabled,true);
  assert.equal(h.dom.window.document.getElementById('break-reminder-status').textContent,'Break in 1h');
 }finally{h.close();}
});
test('the live timer opens remaining time, change, and turn off',async()=>{
 const h=await mount({hourMs:60*60*1000});
 try{
  click(h,'Yes');
  click(h,'2 hours');
  h.dom.window.document.getElementById('break-reminder-status').click();
  assert.match(overlay(h).textContent,/Break in 2h/);
  assert.match(overlay(h).textContent,/Check-in every 2 hours/);
  overlay(h).click();
  assert.equal(overlay(h).hidden,true);
  assert.equal(JSON.parse(h.storage.getItem('alysum:editor:break-reminder:one')).enabled,true);
  h.dom.window.document.getElementById('break-reminders').click();
  click(h,'Change');
  click(h,'1 hour');
  assert.equal(JSON.parse(h.storage.getItem('alysum:editor:break-reminder:one')).hours,1);
  h.dom.window.document.getElementById('break-reminder-status').click();
  click(h,'Turn off');
  assert.equal(JSON.parse(h.storage.getItem('alysum:editor:break-reminder:one')).enabled,false);
  assert.equal(h.dom.window.document.getElementById('break-reminder-status').hidden,true);
 }finally{h.close();}
});
