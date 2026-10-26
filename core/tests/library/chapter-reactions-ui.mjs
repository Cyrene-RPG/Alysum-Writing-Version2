import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const {JSDOM}=createRequire(import.meta.url)(process.env.JSDOM_MODULE || 'jsdom');
const ui=await readFile(new URL('../../../applications/library/page-ui/chapter-reactions.js',import.meta.url),'utf8');
const core=await readFile(new URL('../../library/chapter-reactions.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function mount(handler,{signedIn=true}={}) {
 const dom=new JSDOM('<main><section id="reactions"></section></main>',{url:'https://example.com/read?id=book&chapter=one',runScripts:'outside-only'});
 const context=dom.getInternalVMContext();const api=new vm.SourceTextModule(core,{context});await api.link(()=>{});await api.evaluate();
 const module=new vm.SourceTextModule(ui,{context});await module.link(()=>api);await module.evaluate();
 const root=dom.window.document.querySelector('section'),calls=[];
 module.namespace.mountChapterReactions(root,{work:{id:'book'},chapterId:'one',supabase:{rpc:async(name,args)=>{calls.push(args);return handler(args,calls.length);}},session:signedIn?{user:{id:'reader'}}:null});
 await tick();return {dom,root,calls,buttons:[...root.querySelectorAll('.reader-reaction')],close:()=>dom.window.close()};
}
test('reactions load, switch, remove and ignore repeated taps while saving',async()=>{
 let release;let server={counts:{cry:1},mine:'cry'};
 const h=await mount(async args=>{if(args.p_write){await new Promise(r=>{release=r;});server={counts:args.p_reaction?{[args.p_reaction]:1}:{},mine:args.p_reaction};}return {data:server};});
 try{
  assert.equal(h.buttons[2].getAttribute('aria-pressed'),'true');
  h.buttons[0].click();h.buttons[3].click();assert.equal(h.calls.length,2);assert.equal(h.calls[1].p_reaction,'love');
  release();await tick();assert.equal(h.buttons[0].getAttribute('aria-pressed'),'true');assert.equal(h.buttons[2].getAttribute('aria-pressed'),'false');
  h.buttons[0].click();assert.equal(h.calls[2].p_reaction,null);release();await tick();assert.equal(h.buttons[0].getAttribute('aria-pressed'),'false');
 }finally{h.close();}
});
test('uncertain save clears selection and requires a confirmed read before another mutation',async()=>{
 const h=await mount(async args=>args.p_write?{error:{message:'Network failed'}}:{data:{counts:{love:2},mine:null}});
 try{
  h.buttons[0].click();await tick();assert.equal(h.root.querySelector('.reader-reaction-retry').hidden,false);assert.ok(h.buttons.every(b=>b.disabled));
  h.buttons[1].click();assert.equal(h.calls.length,2);
  h.root.querySelector('.reader-reaction-retry').click();await tick();assert.equal(h.calls[2].p_write,false);assert.ok(h.buttons.every(b=>!b.disabled));
 }finally{h.close();}
});
test('signed-out readers see real counts and a sign-in link without mutation',async()=>{
 const h=await mount(async()=>({data:{counts:{love:7},mine:null}}),{signedIn:false});
 try{assert.match(h.buttons[0].getAttribute('aria-label'),/7 reactions/);assert.ok(h.buttons.every(b=>b.disabled));assert.ok(h.root.querySelector('a').href.includes('/login?next='));h.buttons[0].click();assert.equal(h.calls.length,1);}finally{h.close();}
});
test('a response for a detached chapter cannot repaint the new chapter',async()=>{
 let release;const h=await mount(()=>new Promise(resolve=>{release=resolve;}));
 try{h.root.remove();const newRoot=h.dom.window.document.createElement('section');newRoot.textContent='Next chapter';h.dom.window.document.body.append(newRoot);release({data:{counts:{love:99},mine:'love'}});await tick();assert.equal(newRoot.textContent,'Next chapter');}finally{h.close();}
});
