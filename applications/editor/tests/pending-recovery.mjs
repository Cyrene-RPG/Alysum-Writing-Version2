import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
test('other-tab recovery is visible, downloadable as an importable backup, and refreshes on storage changes',async()=>{
 const dom=new JSDOM('<div id="saveFeedback" hidden></div>',{url:'https://example.test/editor'});let copies=[],blob,download;
 const context=vm.createContext({window:dom.window,document:dom.window.document,Blob,URL:{createObjectURL:value=>{blob=value;return 'blob:recovery';},revokeObjectURL(){}},setTimeout:fn=>fn()});
 const mod=new vm.SourceTextModule(await readFile(new URL('../page-ui/pending-recovery.js',import.meta.url),'utf8'),{context});await mod.link(()=>{});await mod.evaluate();
 try{
  mod.namespace.mountPendingRecovery({api:{listRecoveryCopies:id=>{assert.equal(id,'book');return copies;}},bookId:'book',anchor:dom.window.document.getElementById('saveFeedback')});
  const panel=dom.window.document.getElementById('saveFeedback').nextElementSibling;assert.equal(panel.hidden,true);
  copies=[{book:{id:'book',title:'My recovered book',updated:1,sections:{body:[{id:'ch',content:'Private writing'}]}}}];dom.window.dispatchEvent(new dom.window.Event('storage'));
  assert.equal(panel.hidden,false);assert.match(panel.textContent,/Other unsynced writing/);
  dom.window.document.addEventListener('click',event=>{if(event.target.tagName==='A'){download=event.target.download;event.preventDefault();}});
  panel.querySelector('button').click();const backup=JSON.parse(await blob.text());assert.equal(backup.format,'alysum-book-backup');assert.equal(backup.version,1);assert.equal(backup.book.sections.body[0].content,'Private writing');assert.match(download,/-recovery-1.json$/);
  copies=[];dom.window.dispatchEvent(new dom.window.Event('focus'));assert.equal(panel.hidden,true);
 }finally{dom.window.close();}
});
