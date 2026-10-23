import test from 'node:test';
import assert from 'node:assert/strict';
import {sendStaffEmailCode,verifyStaffEmailCode,emailCodeRetrySeconds} from '../../moderation/email-auth.js';
test('Code requests use the staff email without creating accounts',async()=>{
 let args;await sendStaffEmailCode({auth:{signInWithOtp:async a=>(args=a,{error:null})}},'staff@example.test');
 assert.deepEqual(args,{email:'staff@example.test',options:{shouldCreateUser:false}});
});
test('Email verification preserves every digit and rejects malformed codes',async()=>{
 let calls=0,args;const client={auth:{verifyOtp:async a=>(calls++,args=a,{data:{user:{id:'staff'}},error:null})}};
 await assert.rejects(verifyStaffEmailCode(client,'staff@example.test','12345','staff'),/complete numeric/);
 assert.equal(calls,0);
 await verifyStaffEmailCode(client,'staff@example.test','012345','staff');
 assert.deepEqual(args,{email:'staff@example.test',token:'012345',type:'email'});
 for(const code of ['01234567','0123456789']){
 await verifyStaffEmailCode(client,'staff@example.test',code,'staff');assert.equal(args.token,code);
 }
 for(const code of ['12345678901','https://example.test','12345a']){
 await assert.rejects(verifyStaffEmailCode(client,'staff@example.test',code,'staff'),/complete numeric/);
 }
});
test('Invalid or expired codes propagate the provider error',async()=>{
 await assert.rejects(verifyStaffEmailCode({auth:{verifyOtp:async()=>({error:Error('Code expired')})}},'staff@example.test','123456','staff'),/expired/);
});
test('A code for a different account clears the separate staff session',async()=>{
 let signedOut=false;
 const client={auth:{verifyOtp:async()=>({data:{user:{id:'other'}}}),signOut:async()=>{signedOut=true;}}};
 await assert.rejects(verifyStaffEmailCode(client,'staff@example.test','123456','staff'),/same staff account/);
 assert.equal(signedOut,true);
});

test('Provider cooldown durations are respected instead of assuming sixty seconds',()=>{
 assert.equal(emailCodeRetrySeconds({message:'For security purposes, you can only request this after 98 seconds.'}),98);
 assert.equal(emailCodeRetrySeconds({status:429}),60);
 assert.equal(emailCodeRetrySeconds({message:'Code invalid'}),0);
});
