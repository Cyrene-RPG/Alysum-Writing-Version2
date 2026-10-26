import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookComment, threadChapterComments, fetchChapterComments, postChapterComment } from '../../library/book-comments.js';
test('comments retain parent identity and group replies under the correct root',()=>{
 const root={id:'one',parentId:null},other={id:'two',parentId:null},reply={id:'reply',parentId:'one'},nested={id:'nested',parentId:'reply'};
 assert.deepEqual(threadChapterComments([root,other,reply,nested]),[{comment:root,replies:[reply,nested]},{comment:other,replies:[]}]);
 assert.equal(normalizeBookComment({id:'reply',text:'Hi',parent_id:'one'}).parentId,'one');
 assert.equal(threadChapterComments([{id:'a',parentId:'b'},{id:'b',parentId:'a'}]).length,2);
 assert.equal(threadChapterComments([{id:'orphan',parentId:'missing'}]).length,1);
});
test('fetch includes replies and posting persists the exact parent comment',async()=>{
 let selected='',inserted;const builder={select(value){selected=value;return this;},eq(){return this;},order:async()=>({data:[{id:'r',text:'Hi',parent_id:'p'}]}),insert(value){inserted=value;return this;},maybeSingle:async()=>({data:{id:'r',...inserted}})};
 const client={from:()=>builder};const rows=await fetchChapterComments(client,'book','chapter');assert.equal(rows[0].parentId,'p');assert.match(selected,/parent_id/);
 const reply=await postChapterComment(client,{bookId:'book',chapterId:'chapter',userId:'author',text:'Thanks',parentId:'p'});
 assert.equal(inserted.parent_id,'p');assert.equal(reply.parentId,'p');
 await postChapterComment(client,{bookId:'book',chapterId:'chapter',userId:'author',text:'A new comment'});assert.equal(inserted.parent_id,null);
});
