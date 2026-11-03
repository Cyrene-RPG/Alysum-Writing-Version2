import test from 'node:test';
import assert from 'node:assert/strict';
import {createModerationService} from '../../moderation/service.js';
test('private messages send only text, recipient, and a retry identifier',async()=>{
 const calls=[];
 const service=createModerationService({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'thread'}};}});
 await service.call('direct_message',{userId:'user-1',subject:'Private check-in',body:'On-site only.'},'request-1');
 assert.deepEqual(calls[0],{name:'mc_call',args:{p_action:'direct_message',p_payload:{userId:'user-1',subject:'Private check-in',body:'On-site only.',requestId:'request-1'}}});
 await service.call('invite_staff',{threadId:'thread',staffId:'staff-2'},'request-2');
 assert.equal(calls[1].args.p_payload.requestId,'request-2');
});
test('private-message setup errors stay distinct from revoked access',async()=>{
 const missing=createModerationService({rpc:async()=>({error:{code:'PGRST202'}})});
 await assert.rejects(missing.call('direct_message',{userId:'user-1'}),/SQL migration/);
 const revoked=createModerationService({rpc:async()=>({error:{code:'42501',message:'Staff access revoked'}})});
 await assert.rejects(revoked.call('conversations'),error=>error.code==='42501');
});
