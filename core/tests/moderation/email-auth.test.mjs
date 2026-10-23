import test from 'node:test';
import assert from 'node:assert/strict';
import {sendStaffEmailCode,verifyStaffEmailCode} from '../../moderation/email-auth.js';
test('Code requests use the staff email without creating accounts',async()=>{
 let args;await sendStaffEmailCode({auth:{signInWithOtp:async a=>(args=a,{error:null})}},'staff@example.test');
 assert.deepEqual(args,{email:'staff@example.test',options:{shouldCreateUser:false}});
});
test('Only a six-digit code is submitted to Supabase email verification',async()=>{
 let calls=0,args;const client={auth:{verifyOtp:async a=>(calls++,args=a,{data:{user:{id:'staff'}},error:null})}};
 await assert.rejects(verifyStaffEmailCode(client,'staff@example.test','12345','staff'),/six-digit/);
 assert.equal(calls,0);
 await verifyStaffEmailCode(client,'staff@example.test','012345','staff');
 assert.deepEqual(args,{email:'staff@example.test',token:'012345',type:'email'});
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
