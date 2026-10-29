import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('daily goal renders live totals, caps the fill and handles goal settings and day rollover',async()=>{
 const dom=new JSDOM('<div id="actions"></div><div id="toolbar"></div>',{url:'https://example.test/editor'});
 const timers=[];dom.window.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};
 const context=vm.createContext({window:dom.window,document:dom.window.document,Date,clearTimeout(){}});
 const mod=new vm.SourceTextModule(await readFile(new URL('../page-ui/daily-goal.js',import.meta.url),'utf8'),{context});await mod.link(()=>{});await mod.evaluate();
 let stats={enabled:true,mode:'track',wordsToday:20,todayGoal:200};
 const goal=mod.namespace.mountEditorDailyGoal({anchor:dom.window.document.getElementById('actions'),getStats:()=>stats});
 try{
  const row=dom.window.document.querySelector('.writer-daily-goal'),bar=row.querySelector('progress'),count=row.querySelector('span');
  assert.equal(row.previousElementSibling.id,'actions');assert.equal(row.nextElementSibling.id,'toolbar');
  assert.equal(count.textContent,'20/200 words');assert.equal(bar.value,20);assert.equal(bar.max,200);
  stats.wordsToday=250;goal.refresh();assert.equal(bar.value,200);assert.equal(count.textContent,'250/200 words');
  stats.wordsToday=19;goal.refresh();assert.equal(bar.value,19);
  stats.todayGoal=500;goal.refresh();assert.equal(bar.max,500);
  stats.mode='pace';stats.paceGoal=80;goal.refresh();assert.equal(count.textContent,'19/80 words');
  stats={enabled:true,mode:'track',wordsToday:0,todayGoal:200};assert.ok(timers[0].delay>0&&timers[0].delay<=86400050);timers[0].fn();assert.equal(count.textContent,'0/200 words');
  stats.todayGoal=0;goal.refresh();assert.equal(bar.hidden,true);assert.equal(count.textContent,'0 words today');assert.equal(row.querySelector('a').getAttribute('href'),'/settings#daily-goal');
  stats.enabled=false;goal.refresh();assert.equal(row.hidden,true);
  stats.enabled=true;stats.todayGoal=100;dom.window.dispatchEvent(new dom.window.Event('storage'));assert.equal(row.hidden,false);assert.equal(bar.max,100);
 }finally{goal.destroy();dom.window.close();}
});
