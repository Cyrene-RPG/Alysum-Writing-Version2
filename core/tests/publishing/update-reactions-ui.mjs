import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const tick=()=>new Promise(r=>setTimeout(r,15));
async function fixture(){
 const dom=new JSDOM('<article id="post"></article>',{url:'https://example.test/updates?post=post'}),context=vm.createContext({window:dom.window,document:dom.window.document,location:dom.window.location,setTimeout,Map,Set});
 const data=new vm.SourceTextModule(await readFile(new URL('../../publishing/update-reactions.js',import.meta.url),'utf8'),{context});await data.link(()=>{});await data.evaluate();
 const ui=new vm.SourceTextModule(await readFile(new URL('../../../applications/updates/page-ui/reactions.js',import.meta.url),'utf8'),{context});await ui.link(()=>data);await ui.evaluate();
 let user='one',authCallback,fail=false,hold=null,calls=0;const votes=new Map();
 const snapshot=()=>({counts:{heart:[...votes.values()].filter(s=>s.has('heart')).length,purple:[...votes.values()].filter(s=>s.has('purple')).length},mine:[...(votes.get(user)||[])]});
 const client={auth:{getSession:async()=>({data:{session:{user:{id:user}}}}),onAuthStateChange:cb=>{authCallback=cb;return{data:{subscription:{unsubscribe(){}}}};}},rpc:async(name,args)=>{
  if(name==='get_announcement_reactions')return{data:{post:snapshot()}};
  calls++;const mine=votes.get(user)||new Set();args.p_selected?mine.add(args.p_reaction):mine.delete(args.p_reaction);votes.set(user,mine);const result=snapshot();
  if(hold)await hold;if(fail){fail=false;throw Error('lost response');}return{data:result};
 }};
 const controller=ui.namespace.createUpdateReactionFeed(client);controller.clear();controller.add([{article:dom.window.document.querySelector('article'),post:{id:'post',title:'An update'}}]);await tick();
 const button=id=>dom.window.document.querySelectorAll('.update-reaction')[id];
 return{dom,controller,button,get calls(){return calls;},fail(){fail=true;},hold(p){hold=p;},change(id,event='SIGNED_IN'){user=id;authCallback(event,id?{user:{id}}:null);},close(){controller.destroy();dom.window.close();}};
}
test('multiple selections toggle independently; rapid taps cannot send duplicate writes; reload-before-retry resolves uncertain commits',async()=>{
 const f=await fixture();try{
 assert.equal(f.button(0).disabled,false,'initial feed clear does not discard signed-in session');
 f.button(0).click();f.button(0).click();await tick();assert.equal(f.calls,1);assert.equal(f.button(0).getAttribute('aria-pressed'),'true');
 f.button(1).click();await tick();assert.equal(f.button(0).getAttribute('aria-pressed'),'true');assert.equal(f.button(1).getAttribute('aria-pressed'),'true');
 f.button(0).click();await tick();assert.equal(f.button(0).getAttribute('aria-pressed'),'false');assert.equal(f.button(1).getAttribute('aria-pressed'),'true');
 f.fail();f.button(0).click();await tick();assert.equal(f.button(0).disabled,true);assert.match(f.dom.window.document.querySelector('.update-reaction-status').textContent,/Could not confirm/);
 f.dom.window.document.querySelector('.update-reaction-retry').click();await tick();assert.equal(f.button(0).getAttribute('aria-pressed'),'true','read recovers a write whose response was lost');
 }finally{f.close();}
});
test('account changes discard late results while same-account token refresh preserves writes',async()=>{
 const f=await fixture();try{
 let finish;f.hold(new Promise(r=>finish=r));f.button(0).click();f.change('two');await tick();finish();await tick();assert.equal(f.button(0).getAttribute('aria-pressed'),'false');assert.match(f.button(0).getAttribute('aria-label'),/1 reaction/);
 f.hold(null);f.button(1).click();f.change('two','TOKEN_REFRESHED');await tick();assert.equal(f.button(1).getAttribute('aria-pressed'),'true');
 f.change(null,'SIGNED_OUT');await tick();assert.equal(f.button(0).disabled,true);assert.equal(f.button(1).getAttribute('aria-pressed'),'false');assert.equal(f.dom.window.document.querySelector('.update-reaction-signin').hidden,false);
 }finally{f.close();}
});
