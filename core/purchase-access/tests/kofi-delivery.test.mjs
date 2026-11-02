import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverKofi} from '../kofi-delivery.js';
const env={RESEND_API_KEY:'test-key',KOFI_FROM_EMAIL:'books@example.com',SITE_URL:'https://alysumwriting.com',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',KOFI_CODE_ENCRYPTION_KEY:'a'.repeat(64)};
test('queued order produces email and marks delivery sent',async()=>{
 let claimed=false,finished,mail;
 const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('/claim_kofi_delivery')){
   if(claimed)return Response.json(null);
   claimed=true;
   return Response.json({id:'11111111-1111-4111-8111-111111111111',email:'reader@example.com',ciphertext:body.p_ciphertext});
  }
  if(url.endsWith('/finish_kofi_delivery')){finished=body;return Response.json(true);}
  if(url==='https://api.resend.com/emails'){mail={body,headers:options.headers};return Response.json({id:'email-id'});}
  throw Error('Unexpected endpoint');
 };
 const result=await deliverKofi(env,{fetcher});
 assert.equal(result.sent,1);
 assert.equal(mail.body.to[0],'reader@example.com');
 assert.match(mail.body.text,/purchase code/i);
 assert.match(mail.body.text,/purchase-passes/);
 assert.equal(mail.headers['Idempotency-Key'],'11111111-1111-4111-8111-111111111111');
 assert.equal(finished.p_success,true);
});
test('failed email is returned to queue',async()=>{
 let claimed=false,finished;
 const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('/claim_kofi_delivery')){
   if(claimed)return Response.json(null);
   claimed=true;return Response.json({id:'22222222-2222-4222-8222-222222222222',email:'reader@example.com',ciphertext:body.p_ciphertext});
  }
  if(url.endsWith('/finish_kofi_delivery')){finished=body;return Response.json(true);}
  if(url==='https://api.resend.com/emails')return Response.json({error:'unavailable'},{status:503});
  throw Error('Unexpected endpoint');
 };
 const result=await deliverKofi(env,{fetcher});
 assert.equal(result.sent,0);
 assert.equal(finished.p_success,false);
});
