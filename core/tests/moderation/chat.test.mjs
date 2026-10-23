import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeratorChatService} from '../../moderation/chat.js';
test('chat validates message bounds before transmission and sends only text and retry identity',async()=>{
 const calls=[],service=createModeratorChatService({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'1'}};}});
 await assert.rejects(service.send('   ','request'),/1–4,000/);await assert.rejects(service.send('x'.repeat(4001),'request'),/1–4,000/);assert.equal(calls.length,0);
 await service.send(' hello team ','request');assert.deepEqual(calls[0],{name:'mc_chat_send',args:{p_request_id:'request',p_body:'hello team'}});
 await service.list({before:'20'});assert.deepEqual(calls[1],{name:'mc_chat_list',args:{p_before:'20',p_after:null}});
});
test('chat distinguishes missing setup and revoked access',async()=>{
 const missing=createModeratorChatService({rpc:async()=>({error:{code:'PGRST202'}})});await assert.rejects(missing.list(),/SQL migration/);
 const revoked=createModeratorChatService({rpc:async()=>({error:{code:'42501',message:'Staff access revoked'}})});await assert.rejects(revoked.list(),error=>error.code==='42501');
});
