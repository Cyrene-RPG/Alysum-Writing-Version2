import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {threadChapterComments} from '../../library/book-comments.js';
const {JSDOM}=createRequire(import.meta.url)(process.env.JSDOM_MODULE||'jsdom');
const source=await readFile(new URL('../../../applications/library/page-ui/comment-editor.js',import.meta.url),'utf8');
const sanitizer=await readFile(new URL('../../../applications/library/page-ui/comment-html.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
async function harness({viewer='owner',fail=false,delayed=false,targetCommentId=""}={}){
 const dom=new JSDOM('<section id="comments"></section>',{url:'https://example.com/read?id=book',runScripts:'outside-only'}),context=dom.getInternalVMContext();
 const roots=[{id:'one',text:'<p>First reader</p>',userId:'reader1',displayName:'Reader One',parentId:null},{id:'two',text:'<p>Second reader</p>',userId:'reader2',displayName:'Reader Two',parentId:null},{id:'oldreply',text:'<p>Earlier answer</p>',userId:'owner',displayName:'Author Name',parentId:'one'}];
 const calls=[];let release,shouldFail=fail;
 const mocks={authorProfileUrl:()=>null,authorNameHtml:({label})=>label,authorInitial:s=>s[0],countWordsInHtml:s=>String(s).split(/\s+/).length,COMMENT_HTML_MAX:8000,threadChapterComments,
 fetchChapterComments:async()=>{if(delayed)await new Promise(r=>release=r);return roots;},deleteChapterComment:async id=>calls.push({delete:id}),
 postChapterComment:async(_client,input)=>{calls.push(input);if(shouldFail)throw Error('Save failed');return {id:'newreply',...input};}};
 const clean=new vm.SourceTextModule(sanitizer,{context});await clean.link(()=>{});await clean.evaluate();
 const main=new vm.SourceTextModule(source,{context});await main.link(async spec=>{
  if(spec.includes('comment-html'))return clean;
  const names=spec.includes('book-comments')?['COMMENT_HTML_MAX','threadChapterComments','fetchChapterComments','deleteChapterComment','postChapterComment']:spec.includes('author-links')?['authorProfileUrl']:spec.includes('author-link.js')?['authorNameHtml']:spec.includes('word-count')?['countWordsInHtml']:['authorInitial'];
  const module=new vm.SyntheticModule(names,function(){for(const n of names)this.setExport(n,mocks[n]);},{context});await module.link(()=>{});await module.evaluate();return module;
 });await main.evaluate();
 const root=dom.window.document.querySelector('section');main.namespace.mountCommentThread(root,{work:{id:'book',ownerUserId:'owner',author:'Author Name'},chapterId:'chapter',targetCommentId,supabase:{from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{username:'author',display_name:'Author Name'}})})},session:viewer?{mode:'cloud',user:{id:viewer,email:'private@example.com'}}:null});await tick();
 return{dom,root,calls,release:()=>release(),setFail:value=>shouldFail=value,close:()=>dom.window.close()};
}
test('author replies target a specific comment, preserve failed drafts and nest the confirmed answer',async()=>{
 const h=await harness({fail:true});try{
  assert.equal(h.root.querySelectorAll('[data-reply]').length,2);
  h.root.querySelector('[data-reply="two"]').click();assert.match(h.root.querySelector('#readerReplyLabel').textContent,/Reader Two/);
  const editor=h.root.querySelector('#readerCommentEditor');editor.innerHTML='<p>Thank you!</p>';
  h.root.querySelector('#readerCommentPost').click();await tick();assert.equal(h.calls[0].parentId,'two');assert.match(editor.innerHTML,/Thank you/);assert.equal(h.root.querySelector('#readerReplyContext').hidden,false);
  h.setFail(false);h.root.querySelector('#readerCommentPost').click();await tick();
  assert.equal(h.root.querySelector('[data-comment="two"]').parentElement.querySelector('[data-comment="newreply"]')!==null,true);
  assert.equal(h.root.querySelector('[data-comment="newreply"] .reader-comment-author').textContent,'Author');
  assert.equal(h.root.querySelector('#readerCommentEditor').innerHTML,'');assert.equal(h.root.querySelector('#readerReplyContext').hidden,true);
 }finally{h.close();}
});
test('cancel retains the draft, and deleting a root removes only its reply branch',async()=>{
 const h=await harness();try{
  h.root.querySelector('#readerCommentEditor').innerHTML='<p>My draft</p>';h.root.querySelector('[data-reply="one"]').click();h.root.querySelector('#readerReplyCancel').click();assert.match(h.root.querySelector('#readerCommentEditor').innerHTML,/My draft/);
  h.root.querySelector('[data-delete="one"]').click();await tick();assert.equal(h.root.querySelector('[data-comment="oldreply"]'),null);assert.ok(h.root.querySelector('[data-comment="two"]'));assert.match(h.root.querySelector('#readerCommentEditor').innerHTML,/My draft/);
 }finally{h.close();}
});
test('readers and guests see threaded author responses without author reply controls',async()=>{
 for(const viewer of ['reader1',null]){const h=await harness({viewer});try{assert.equal(h.root.querySelectorAll('[data-reply]').length,0);assert.ok(h.root.querySelector('.reader-comment-replies [data-comment="oldreply"]'));}finally{h.close();}}
});
test('initial comment loading preserves typed drafts and detached views ignore late loads',async()=>{
 const h=await harness({delayed:true});try{h.root.querySelector('#readerCommentEditor').innerHTML='<p>Still writing</p>';h.release();await tick();assert.match(h.root.querySelector('#readerCommentEditor').innerHTML,/Still writing/);}finally{h.close();}
 const stale=await harness({delayed:true});try{stale.root.remove();stale.release();await tick();assert.equal(stale.root.querySelector('[data-comment="one"]'),null);}finally{stale.close();}
});

test('an initial fetch cannot overwrite a comment posted while it was loading',async()=>{
 const h=await harness({delayed:true});try{
  h.root.querySelector('#readerCommentEditor').innerHTML='<p>Posted during loading</p>';h.root.querySelector('#readerCommentPost').click();await tick();h.release();await tick();
  assert.ok(h.root.querySelector('[data-comment="newreply"]'));assert.ok(h.root.querySelector('[data-comment="one"]'));
 }finally{h.close();}
});

test('notification links focus and highlight the exact comment, with an unavailable state for deleted targets',async()=>{
 const h=await harness({viewer:null,targetCommentId:'oldreply'});try{
  assert.equal(h.dom.window.document.activeElement.dataset.comment,'oldreply');assert.ok(h.root.querySelector('[data-comment="oldreply"]').classList.contains('is-notification-target'));
 }finally{h.close();}
 const missing=await harness({viewer:null,targetCommentId:'deleted'});try{assert.match(missing.root.querySelector('#readerCommentStatus').textContent,/no longer available/);}finally{missing.close();}
});
