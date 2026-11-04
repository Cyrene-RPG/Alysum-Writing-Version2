/** Recipient inbox in an isolated DOM. JSDOM_MODULE points to an installed jsdom. */
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';import {webcrypto} from 'node:crypto';import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)(process.env.JSDOM_MODULE||'jsdom');
const pause=()=>new Promise(r=>setTimeout(r,5));async function until(check){for(let i=0;i<100;i++){if(check())return;await pause();}throw Error('Inbox did not settle');}
function dialogPolyfill(el){if(typeof el.showModal==='function')return;el.open=false;el.showModal=function(){this.open=true;this.setAttribute('open','');};el.close=function(){this.open=false;this.removeAttribute('open');};}
async function harness({signedIn=true,thread='thread-1',resolved=false,bookId=null,deadline=null,listings=[]}={}){
 const html=await fs.readFile(new URL('../../../applications/moderation/pages/inbox.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://alysum.test/moderation-inbox'+(thread?'?thread='+encodeURIComponent(thread):''),pretendToBeVisual:true});
 const {window}=dom;dialogPolyfill(window.document.getElementById('md-dialog'));
 const context=vm.createContext({document:window.document,window,location:window.location,history:window.history,crypto:webcrypto,setTimeout,clearTimeout,URL,URLSearchParams,Error});
 const resolvedAt=resolved?'2026-11-03T22:50:00.000Z':null;
 const threads=[{id:'thread-1',subject:'Book under review',deadline,updated_at:'2026-11-03T22:40:00.000Z',recipient_read_at:null,resolved_at:resolvedAt,book_id:bookId}];
 const threadRow={id:'thread-1',subject:'Book under review',deadline,bookId,resolvedAt,deadlineEnforcedAt:listings[0]?.enforcedAt||null,listingAppealStatus:listings[0]?.appealStatus||null,total:1,messages:[{id:'m1',side:'staff',body:'Thank you in advance!',createdAt:'2026-11-03T22:40:00.000Z'}]};
 const calls=[];
 const clientMod=new vm.SyntheticModule(['supabase'],function(){this.setExport('supabase',{auth:{getSession:async()=>({data:{session:signedIn?{user:{id:'user-1'}}:null},error:null}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}}});},{context,identifier:'client.js'});
 const serviceMod=new vm.SyntheticModule(['createModerationService'],function(){this.setExport('createModerationService',()=>({call:async(action,payload)=>{calls.push({action,payload});if(action==='my_inbox')return {threads,sanctions:[],listings,total:threads.length};if(action==='my_thread')return threadRow;throw Error('unexpected '+action);}}));},{context,identifier:'service.js'});
 const commonMod=new vm.SourceTextModule(await fs.readFile(new URL('../../../applications/moderation/page-ui/common.js',import.meta.url),'utf8'),{context,identifier:'common.js'});
 const deadlineMod=new vm.SourceTextModule(await fs.readFile(new URL('../../../applications/moderation/page-ui/deadline.js',import.meta.url),'utf8'),{context,identifier:'deadline.js'});
 const listingAppealMod=new vm.SourceTextModule(await fs.readFile(new URL('../../../applications/moderation/page-ui/listing-appeal.js',import.meta.url),'utf8'),{context,identifier:'listing-appeal.js'});
 await clientMod.link(()=>{});await clientMod.evaluate();await serviceMod.link(()=>{});await serviceMod.evaluate();await commonMod.link(()=>{});await commonMod.evaluate();await deadlineMod.link(()=>{});await deadlineMod.evaluate();
 await listingAppealMod.link(spec=>{if(spec.includes('common.js'))return commonMod;throw Error('unexpected import '+spec);});await listingAppealMod.evaluate();
 const inboxMod=new vm.SourceTextModule(await fs.readFile(new URL('../../../applications/moderation/page-ui/inbox.js',import.meta.url),'utf8'),{context,identifier:'inbox.js'});
 await inboxMod.link(spec=>{if(spec.startsWith('/core/authentication/client'))return clientMod;if(spec.startsWith('/core/moderation/service'))return serviceMod;if(spec.includes('common.js'))return commonMod;if(spec.includes('deadline.js'))return deadlineMod;if(spec.includes('listing-appeal.js'))return listingAppealMod;throw Error('unexpected import '+spec);});
 await inboxMod.evaluate();
 if(signedIn)await until(()=>window.document.getElementById('mc-page-error'));
 else await until(()=>/Sign in to read/.test(window.document.getElementById('md-screen')?.textContent||''));
 if(signedIn&&thread)await until(()=>window.document.getElementById('md-dialog')?.open);
 return {dom,window,calls,destroy(){dom.window.close();}};
}
test('signed-in recipient inbox paints without staff #md-nav and keeps the static sidebar',async()=>{
 const h=await harness({thread:''});try{
  const nav=h.window.document.querySelector('.md-sidebar nav');
  assert.equal(h.window.document.getElementById('md-nav'),null);
  assert.equal(nav.querySelectorAll('a').length,3);
  assert.match(h.window.document.getElementById('md-identity').textContent,/Your private conversations/);
  assert.match(h.window.document.getElementById('md-screen').textContent,/Book under review/);
  assert.equal(h.window.document.getElementById('mc-page-error').textContent,'');
  assert.equal(h.calls[0].action,'my_inbox');
 }finally{h.destroy();}
});
test('notification ?thread= opens the conversation instead of a blank page',async()=>{
 const h=await harness({thread:'thread-1'});try{
  assert.equal(h.window.document.getElementById('md-nav'),null);
  assert.match(h.window.document.getElementById('md-screen').textContent,/Book under review/);
  assert.equal(h.window.document.getElementById('md-dialog').open,true);
  assert.match(h.window.document.getElementById('md-dialog-body').textContent,/Thank you in advance!/);
  assert.equal(h.calls.some(c=>c.action==='my_thread'&&c.payload.id==='thread-1'),true);
  assert.equal(h.window.location.search,'');
 }finally{h.destroy();}
});
test('open book conversations with a response date warn that the library listing will unpublish',async()=>{
 const h=await harness({thread:'thread-1',bookId:'book-1',deadline:'2026-11-10'});try{
  assert.match(h.window.document.getElementById('md-dialog-body').textContent,/unpublished from the Library/);
  assert.match(h.window.document.getElementById('md-dialog-body').textContent,/Studio copy stays/);
 }finally{h.destroy();}
});
test('resolved conversations stay readable and hide the reply form',async()=>{
 const h=await harness({thread:'thread-1',resolved:true});try{
  assert.match(h.window.document.getElementById('md-screen').textContent,/Resolved/i);
  assert.match(h.window.document.getElementById('md-dialog-body').textContent,/This conversation is resolved/);
  assert.equal(h.window.document.getElementById('mc-user-reply'),null);
  assert.match(h.window.document.getElementById('md-dialog-body').textContent,/Thank you in advance!/);
 }finally{h.destroy();}
});
test('auto-unpublished listings offer an appeal ticket',async()=>{
 const listings=[{id:'thread-1',subject:'Please update your book cover',enforcedAt:'2026-11-03T22:50:00.000Z'}];
 const h=await harness({thread:'',listings});try{
  assert.match(h.window.document.getElementById('md-screen').textContent,/Library listings/);
  assert.match(h.window.document.getElementById('md-screen').textContent,/Submit appeal ticket/);
  assert.match(h.window.document.getElementById('md-screen').textContent,/Studio copy is unchanged/);
 }finally{h.destroy();}
});
test('signed-out recipient inbox still reaches sign-in',async()=>{
 const h=await harness({signedIn:false,thread:''});try{
  assert.match(h.window.document.getElementById('md-screen').textContent,/Sign in to read/);
  assert.equal(h.window.document.querySelector('a[href="/login?next=%2Fmoderation-inbox"]').textContent,'Sign in');
  assert.equal(h.calls.length,0);
 }finally{h.destroy();}
});
