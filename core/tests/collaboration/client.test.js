import test from 'node:test';
import assert from 'node:assert/strict';
import {createBookEditorsApi,bookInviteUrl,bookEditorsError,isBookEditorsSchemaMissing} from '../../collaboration/book-editors-client.js';

const token='a'.repeat(64);
test('new links use a fragment and old tokens still work',()=>{
 assert.equal(bookInviteUrl(token,'https://example.test'),'https://example.test/book-invite#token='+token);
 assert.match(bookInviteUrl('a'.repeat(48)),/#token=/);
 assert.throws(()=>bookInviteUrl('bad'),/confirm/);
});
test('permission failures are not labelled as an undeveloped backend',()=>{
 assert.equal(isBookEditorsSchemaMissing({message:'permission denied for table book_editors',code:'42501'}),false);
 assert.match(bookEditorsError({code:'42501'}).message,/permission/);
 assert.match(bookEditorsError({message:'infinite recursion detected in policy for relation books'}).message,/permissions/);
 assert.match(bookEditorsError({code:'PGRST202'}).message,/finish the collaboration setup/);
 assert.match(bookEditorsError(new Error('Failed to fetch')).message,/connection/);
});
test('roster normalizes IDs and excludes private email fields',async()=>{
 const api=createBookEditorsApi({rpc:async()=>({data:{owner:{user_id:'owner',display_name:'Owner',email:'private@example.test',role:'owner',is_you:true},editors:[{user_id:'editor',display_name:'Editor',role:'editor'}],is_owner:true}})});
 const roster=await api.listBookCollaborators('book');
 assert.equal(roster.owner.userId,'owner');assert.equal(roster.editors[0].userId,'editor');assert.equal(roster.isOwner,true);
 assert.equal('email' in roster.owner,false);
});
test('incomplete backend responses never imply owner permission or successful mutation',async()=>{
 const api=createBookEditorsApi({rpc:async()=>({data:{}})});
 await assert.rejects(api.listBookCollaborators('book'),/permissions/);
 await assert.rejects(api.createBookEditorInvite('book'),/confirm the invite/);
 await assert.rejects(api.acceptBookEditorInvite(token),/confirm access/);
 await assert.rejects(api.revokeBookEditor('book','person'),/confirm the editor/);
});
test('invalid invite tokens are rejected before a server request',async()=>{
 let calls=0;const api=createBookEditorsApi({rpc:async()=>{calls++;}});
 await assert.rejects(api.acceptBookEditorInvite('bad'),/invalid/);assert.equal(calls,0);
});
test('create and accept use checked server results',async()=>{
 const calls=[];const api=createBookEditorsApi({rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='create_book_editor_invite'?{token,expires_at:'expiry',path:'https://untrusted.test'}:{book_id:'book / 1'}};}},{origin:'https://example.test'});
 const created=await api.createBookEditorInvite('book','  person@example.test  ');
 assert.equal(created.url,'https://example.test/book-invite#token='+token);assert.equal(created.expiresAt,'expiry');
 assert.equal(calls[0][1].p_email,'person@example.test');
 assert.equal((await api.acceptBookEditorInvite(token)).bookId,'book / 1');
});
