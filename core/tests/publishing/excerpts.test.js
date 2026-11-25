import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExcerpt, countExcerptWords, createExcerptApi, excerptUrl, MAX_EXCERPT_WORDS, MAX_EXCERPT_CHARACTERS } from "../../publishing/excerpts.js";
const longText=Array.from({length:4500},(_,i)=>`word${i}`).join(' ');
const token='a'.repeat(48);
test('4,500 words are preserved in a long section without truncation',()=>{
 const data=normalizeExcerpt({excerpt:longText,title:'Long section',author:'Writer',sections:['PRIVATE MANUSCRIPT'],bookId:'private'});
 assert.equal(data.wordCount,4500);assert.equal(data.excerpt,longText);
 assert.deepEqual(Object.keys(data).sort(),['title','author','excerpt','wordCount'].sort());
});
test('limits enforce both words and characters',()=>{
 assert.throws(()=>normalizeExcerpt({excerpt:'word '.repeat(MAX_EXCERPT_WORDS + 1)}));
 assert.throws(()=>normalizeExcerpt({excerpt:'x'.repeat(MAX_EXCERPT_CHARACTERS + 1)}));
 assert.equal(normalizeExcerpt({excerpt:'x'.repeat(MAX_EXCERPT_CHARACTERS)}).excerpt.length,MAX_EXCERPT_CHARACTERS);
 assert.throws(()=>normalizeExcerpt({excerpt:' \n\t '}));
 assert.equal(normalizeExcerpt({excerpt:'word '.repeat(MAX_EXCERPT_WORDS)}).wordCount,MAX_EXCERPT_WORDS);
});
test('ten long chapter selections survive creation and reading in order', async () => {
 const excerpt = Array.from({length:10}, (_, i) => `Chapter ${i+1}\n` + 'passage '.repeat(5000).trim()).join('\n\n');
 let snapshot;
 const api = createExcerptApi({async rpc(name, args) {
   if (name === 'create_wip_excerpt') {
     snapshot = {title:args.p_title, author:args.p_author, excerpt:args.p_excerpt};
     return {data:{id:'share',token}};
   }
   assert.equal(name,'get_wip_excerpt');
   return {data:snapshot};
 }}, {origin:'https://alysum.example'});
 await api.create('book', {excerpt});
 assert.equal((await api.read(token)).excerpt, excerpt);
});
test('URLs contain only an unguessable token, not the section or manuscript id',()=>{
 const url=new URL(excerptUrl(token,'https://alysum.example/editor?book=private'));
 assert.equal(url.pathname,`/shared-section/${token}`);assert.equal(url.search,'');assert.equal(url.hash,'');
 assert.throws(()=>excerptUrl('../books','https://alysum.example'));
});
test('create sends only the selected snapshot and maps storage fields at the API boundary',async()=>{
 const calls=[];const api=createExcerptApi({async rpc(name,args){calls.push({name,args});return {data:{id:'uuid',token,title:'Section',word_count:4500,created_at:'2026-10-18T00:00:00Z'},error:null};}},{origin:'https://alysum.example'});
 const share=await api.create('book-1',{excerpt:longText,title:'Section',author:'Writer',privateChapter:'SECRET'});
 assert.equal(calls[0].name,'create_wip_excerpt');assert.equal(calls[0].args.p_excerpt,longText);
 assert.equal(JSON.stringify(calls).includes('SECRET'),false);assert.equal(share.wordCount,4500);
 assert.equal(share.url,`https://alysum.example/shared-section/${token}`);assert.equal('word_count' in share,false);
});
test('reader returns no section after revocation and rejects malformed tokens before RPC',async()=>{
 let revoked=false,calls=0;
 const api=createExcerptApi({async rpc(name){calls++;if(name==='revoke_wip_excerpt'){revoked=true;return {data:true};}return {data:revoked?null:{title:'Section',author:'Writer',excerpt:longText,created_at:'2026-10-18'}};}},{origin:'https://alysum.example'});
 assert.equal(await api.read('bad-token'),null);assert.equal(calls,0);
 assert.equal((await api.read(token)).excerpt,longText);await api.revoke('uuid');assert.equal(await api.read(token),null);
});
test('restoring a disabled link makes the original token readable again', async () => {
 let disabled = true;
 const api = createExcerptApi({async rpc(name, args) {
   if (name === 'restore_wip_excerpt') {
     if (args.p_id !== 'owned-id') return {data:false};
     disabled = false;
     return {data:true};
   }
   assert.equal(name,'get_wip_excerpt');
   assert.equal(args.p_token,token);
   return {data:disabled ? null : {excerpt:longText}};
 }}, {origin:'https://alysum.example'});
 assert.equal(await api.read(token),null);
 await assert.rejects(api.restore('other-id'),/could not be re-enabled/);
 await api.restore('owned-id');
 assert.equal((await api.read(token)).excerpt,longText);
});
test('missing schema is reported as unavailable rather than creating a fake local link',async()=>{
 const api=createExcerptApi({async rpc(){return {error:{message:'Could not find the function create_wip_excerpt in the schema cache'}};}},{origin:'https://alysum.example'});
 await assert.rejects(api.create('book',{excerpt:'Selected text'}),/has not been enabled/);
});
test('newlines and Unicode remain plain text',()=>{
 const excerpt='Hello <script>doNotRun()</script>\n\n你好 👋';assert.equal(normalizeExcerpt({excerpt}).excerpt,excerpt);assert.equal(countExcerptWords('one\n\ntwo'),2);
});

test('chapter updates target one saved page, including pages from older disabled links', async () => {
 const calls=[];
 const api=createExcerptApi({
   from(table) {
     assert.equal(table,'wip_excerpts');
     return {select:()=>({eq:(key,id)=>{
       assert.deepEqual([key,id],['id','link']);
       return {single:async()=>({data:{excerpt:'First\n\f\nOld second'}})};
     }})};
   },
   async rpc(name,args){calls.push({name,args});return {data:null};}
 },{origin:'https://alysum.example'});
 const pages=await api.managedPages('link');
 assert.deepEqual(pages[1],{number:2,text:'Old second',source:''});
 await api.updatePage('link',pages[1],'  Revised passage  ','chapter-7');
 assert.deepEqual(calls,[{name:'update_wip_excerpt_page',args:{
   p_id:'link',p_page:2,p_expected:'Old second',p_text:'Revised passage',p_source:'chapter-7'
 }}]);
 await assert.rejects(api.updatePage('link',pages[1],'A\n\f\nB','chapter-7'),/one page/);
 assert.equal(calls.length,1);
});

test('new selections keep their private source chapter IDs in page order', async () => {
 let args;
 const api=createExcerptApi({async rpc(name,data){args=data;return {data:{id:'link',token}};}},{origin:'https://alysum.example'});
 await api.create('book',{excerpt:'One\n\f\nTwo'},['a','b']);
 assert.deepEqual(args.p_sources,['a','b']);
 await api.create('book',{excerpt:'Edited text'},['a','b']);
 assert.equal('p_sources' in args,false);
});
