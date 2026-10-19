import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExcerpt, countExcerptWords, createExcerptApi, excerptUrl } from "../../publishing/excerpts.js";
const longText=Array.from({length:4500},(_,i)=>`word${i}`).join(' ');
const token='a'.repeat(48);
test('4,500 words are preserved in a long section without truncation',()=>{
 const data=normalizeExcerpt({excerpt:longText,title:'Long section',author:'Writer',sections:['PRIVATE MANUSCRIPT'],bookId:'private'});
 assert.equal(data.wordCount,4500);assert.equal(data.excerpt,longText);
 assert.deepEqual(Object.keys(data).sort(),['title','author','excerpt','wordCount'].sort());
});
test('limits enforce both words and characters',()=>{
 assert.throws(()=>normalizeExcerpt({excerpt:'word '.repeat(20001)}));
 assert.throws(()=>normalizeExcerpt({excerpt:'x'.repeat(150001)}));
 assert.throws(()=>normalizeExcerpt({excerpt:' \n\t '}));
 assert.equal(normalizeExcerpt({excerpt:'word '.repeat(20000)}).wordCount,20000);
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
test('missing schema is reported as unavailable rather than creating a fake local link',async()=>{
 const api=createExcerptApi({async rpc(){return {error:{message:'Could not find the function create_wip_excerpt in the schema cache'}};}},{origin:'https://alysum.example'});
 await assert.rejects(api.create('book',{excerpt:'Selected text'}),/has not been enabled/);
});
test('newlines and Unicode remain plain text',()=>{
 const excerpt='Hello <script>doNotRun()</script>\n\n你好 👋';assert.equal(normalizeExcerpt({excerpt}).excerpt,excerpt);assert.equal(countExcerptWords('one\n\ntwo'),2);
});
