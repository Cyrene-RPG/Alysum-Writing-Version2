import test from 'node:test';
import assert from 'node:assert/strict';
import {enforceModerationNetwork} from '../../server/http-handlers/moderation-network.mjs';
const context=ip=>({request:{cf:{},headers:new Headers({'cf-connecting-ip':ip})},next:async()=>new Response('allowed')});
test('Trusted-edge addresses are checked and blocked without exposing private rule details',async()=>{
 let sent;const response=await enforceModerationNetwork(context('192.0.2.77'),{fetchImpl:async(_url,args)=>{sent=JSON.parse(args.body);return Response.json(true);}});
 assert.equal(response.status,403);assert.deepEqual(sent,{p_address:'192.0.2.77'});assert.ok(!(await response.text()).includes('reason'));
});
test('No Cloudflare metadata means no reliance on a user-supplied header',async()=>{
 const c=context('192.0.2.78');delete c.request.cf;let calls=0;
 assert.equal((await enforceModerationNetwork(c,{fetchImpl:async()=>{calls++;throw Error();}})).status,200);assert.equal(calls,0);
});
test('Database failure does not break the public website',async()=>{
 assert.equal((await enforceModerationNetwork(context('192.0.2.79'),{fetchImpl:async()=>{throw Error('offline');}})).status,200);
});
