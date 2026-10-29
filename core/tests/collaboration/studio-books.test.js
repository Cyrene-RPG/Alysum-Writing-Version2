import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStudioBooks, loadSharedCreators } from '../../collaboration/studio-books.js';
test('Studio separates shared books by actual owner and retains local own drafts',()=>{
 const books=[{id:'mine',user_id:'me'},{id:'shared',user_id:'creator'},{id:'legacy'},{id:'revision',user_id:'creator',draft_parent_id:'mine'}];
 const copy=structuredClone(books),split=splitStudioBooks(books,'me');
 assert.deepEqual(split.owned.map(b=>b.id),['mine','legacy']);assert.deepEqual(split.shared.map(b=>b.id),['shared','revision']);
 assert.deepEqual(splitStudioBooks(books,null).owned,books);assert.deepEqual(books,copy);
});
test('creator names come from checked ownership, are deduplicated and tolerate failed lookups',async()=>{
 const books=[{id:'mine',user_id:'me'},{id:'a',user_id:'one',author:'Untrusted byline'},{id:'b',user_id:'one'},{id:'c',user_id:'two'},{id:'d',user_id:'three'}],calls=[];
 const names=await loadSharedCreators(books,'me',{async listBookCollaborators(id){calls.push(id);if(id==='c')throw Error('revoked');return {isOwner:false,owner:{userId:id==='d'?'wrong':'one',displayName:'The creator'}};}});
 assert.equal(calls.length,3);assert.equal(calls.includes('mine'),false);assert.deepEqual([...names],[['one','The creator']]);
});
