import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';

// Real editor/reference modules and styles; invented local data, no live accounts.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=resolve(new URL('../../../',import.meta.url).pathname);
const fixture=`<!doctype html><html><head><meta charset="utf-8"><style>
:root{--text:#eee;--muted:#aaa;--accent:#8047c8;--border:#444;--bg:#151515}
</style>${['page/shell','page/main','page/typewriter','document','draft-revisions'].map(name=>`<link rel="stylesheet" href="/applications/editor/editor-css/${name}.css">`).join('')}</head><body>
<header class="wd-welcome-bar">Alysum</header><nav class="wd-nav-wrap">Studio</nav>
<div class="wrap"><div class="writer-shell" id="shell"><aside class="writer-tree">Chapters</aside>
<main class="writer-main"><div class="writer-main-scroll" id="writePane"><div class="writer-toolbar">Formatting</div><article class="writer-page" id="page" contenteditable="true" tabindex="0"><p>Editable writing.</p></article></div></main>
<aside class="writer-rail">Notes</aside></div></div>
<button class="writer-typewriter-exit" id="exit" hidden aria-label="Leave typewriter mode">×</button>
<button id="referenceButton" hidden>Reference</button>
<script type="module">
import {mountDraftRevisions} from '/applications/editor/page-ui/draft-revisions.js';
import {mountTypewriter} from '/applications/editor/page-ui/page/typewriter.js';
const longText='<p>Reference words that stay read-only. '.repeat(160)+'</p>';
const book={id:'sample',title:'Sample book',sections:{body:[{id:'one',title:'One',content:longText},{id:'two',title:'Two',content:longText}]}};
window.sampleBook=structuredClone(book);window.originalWritePane=document.querySelector('#writePane');
window.typewriter=mountTypewriter({pageEl:document.querySelector('#page'),editor:{focus:()=>document.querySelector('#page').focus()},typewriterExit:document.querySelector('#exit')});
window.references=mountDraftRevisions({button:document.querySelector('#referenceButton'),shell:document.querySelector('#shell'),writePane:window.originalWritePane,getBook:()=>book,api:{getBook:async()=>book,listBooks:async()=>[book]},session:{mode:'local'},saveCurrent:async()=> 'saved'});
</script></body></html>`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
  const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+'/'))throw Error('Outside fixture');
  const content=await readFile(path);res.setHeader('Content-Type',extname(path)==='.css'?'text/css':'text/javascript');res.end(content);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,721,720,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture?book=sample&referenceBook=sample`);
  await page.locator('.draft-reference').waitFor({state:'attached'});
  if(width<=720)await page.locator('.draft-mobile-tabs [data-pane=reference]').click();
  await page.selectOption('.draft-reference select','two');
  if(width<=720)await page.locator('.draft-mobile-tabs [data-pane=write]').click();
  await page.locator('.draft-divider').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  const split=await page.locator('.draft-divider').getAttribute('aria-valuenow');
  for(let cycle=0;cycle<3;cycle++){
   await page.evaluate(()=>window.typewriter.setTypewriter(true));
   await page.waitForTimeout(30); // Flush MutationObserver and layout.
   assert.equal(await page.locator('.draft-workspace').count(),1,'Typewriter must retain reference workspace');
   assert.equal(await page.evaluate(()=>document.querySelector('#writePane')===window.originalWritePane),true,'Existing editing DOM is retained');
   assert.equal(await page.locator('.draft-reference select').inputValue(),'two');
   assert.equal(await page.locator('.draft-divider').getAttribute('aria-valuenow'),split);
   assert.match(page.url(),/referenceBook=sample/);
   assert.equal(await page.locator('.writer-toolbar').isVisible(),false);
   if(width>720){
    const write=await page.locator('#writePane').boundingBox(),reference=await page.locator('.draft-reference').boundingBox();
    assert.ok(write.width>150&&reference.width>100&&reference.height>200,'Both panes have usable dimensions');
    assert.ok(write.x+write.width<=reference.x+1,'Panes do not overlap');
   }else{
    await page.locator('.draft-mobile-tabs [data-pane=reference]').click();
    assert.equal(await page.locator('.draft-reference').isVisible(),true);assert.equal(await page.locator('#writePane').isVisible(),false);
   }
   const scroll=await page.locator('.draft-reference-text').evaluate(el=>{el.scrollTop=120;return {top:el.scrollTop,overflow:getComputedStyle(el).overflowY,height:el.clientHeight,total:el.scrollHeight,editable:el.isContentEditable};});
   assert.ok(scroll.top>0&&scroll.total>scroll.height,'Reference scrolls inside its pane');assert.equal(scroll.overflow,'auto');assert.equal(scroll.editable,false);
   if(width<=720)await page.locator('.draft-mobile-tabs [data-pane=write]').click();
   await page.locator('#page').fill('Edited writing '+cycle);
   assert.equal(await page.evaluate(()=>window.sampleBook.sections.body[1].content.includes('Edited writing')),false);
   await page.locator('#exit').click();
   assert.equal(await page.locator('.draft-workspace').count(),1,'Leaving Typewriter preserves comparison');
   assert.equal(await page.locator('.writer-toolbar').isVisible(),true);
  }
  await page.evaluate(()=>document.querySelector('#shell').classList.add('is-preview'));
  await page.waitForFunction(()=>!document.querySelector('.draft-workspace'));
  assert.equal(await page.evaluate(()=>document.querySelector('#writePane')===window.originalWritePane),true);
  assert.equal(new URL(page.url()).searchParams.has('referenceBook'),false);
  assert.deepEqual(errors,[]);console.log('PASS Typewriter/reference at '+width+'px');await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
