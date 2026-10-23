/** Isolated DOM tests for the real reader notice. Set JSDOM_MODULE. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)(process.env.JSDOM_MODULE||'jsdom');
async function harness({uid='reader',eligible=true,owner='owner',fail=false}={}){
 const dom=new JSDOM('<main></main>',{url:'https://alysum.test/read?id=book'}),{window}=dom;
 let current=uid,show=eligible,delay=null;
 const service={session:async()=>current?{user:{id:current}}:null,aiNotice:async()=>{if(fail)throw Error('Unavailable');if(delay)await delay;return show;}};
 const context=vm.createContext({window,document:window.document});
 const module=new vm.SourceTextModule(await fs.readFile(new URL('../../../site-appearance/components/ai-report-notice.js',import.meta.url),'utf8'),{context});
 await module.link(()=>{});await module.evaluate();
 const mount=()=>module.namespace.mountAiReportNotice({host:window.document.querySelector('main'),book:{id:'book',ownerUserId:owner},service});
 const mounted=mount();
 return {dom,window,mounted,mount,service,setUser:id=>{current=id;},setShow:value=>{show=value;},defer:promise=>{delay=promise;}};
}
test('eligible readers see accurate copy and can dismiss for this book/account session',async()=>{
 const h=await harness();try{
  await h.mounted.refresh();assert.equal(h.mounted.notice.hidden,false);
  assert.match(h.mounted.notice.textContent,/not a confirmed finding/);assert.match(h.mounted.notice.textContent,/independently share/);
  h.mounted.notice.querySelectorAll('button')[1].click();assert.equal(h.mounted.notice.hidden,true);
  await h.mounted.refresh();assert.equal(h.mounted.notice.hidden,true);
  h.mounted.destroy();const next=h.mount();await next.refresh();assert.equal(next.notice.hidden,true);
  h.setUser('another-reader');next.reset();await next.refresh();assert.equal(next.notice.hidden,false);
 }finally{h.dom.window.close();}
});
test('owner, ineligible and failed responses never show the notice; guests can see it',async()=>{
 for(const options of [{uid:'owner'},{eligible:false},{fail:true}]){
  const h=await harness(options);try{await h.mounted.refresh();assert.equal(h.mounted.notice.hidden,true);}finally{h.dom.window.close();}
 }
 const h=await harness({uid:''});try{await h.mounted.refresh();assert.equal(h.mounted.notice.hidden,false);}finally{h.dom.window.close();}
});
test('account change or teardown cancels a stale reader response, including anonymous-owner publications',async()=>{
 const h=await harness({owner:null});try{
  let release;h.defer(new Promise(resolve=>{release=resolve;}));
  const pending=h.mounted.refresh();await new Promise(resolve=>setTimeout(resolve,0));
  h.setUser('owner');h.mounted.reset();release();await pending;assert.equal(h.mounted.notice.hidden,true);
  h.setShow(false);await h.mounted.refresh();assert.equal(h.mounted.notice.hidden,true);
 }finally{h.dom.window.close();}
});
test('missing session storage still allows dismissal in this page',async()=>{
 const h=await harness();try{
  Object.defineProperty(h.window,'sessionStorage',{get(){throw Error('Blocked');}});
  await h.mounted.refresh();h.mounted.notice.querySelectorAll('button')[1].click();
  await h.mounted.refresh();assert.equal(h.mounted.notice.hidden,true);
 }finally{h.dom.window.close();}
});
