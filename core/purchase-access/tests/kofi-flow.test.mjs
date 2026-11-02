import test from 'node:test';
import assert from 'node:assert/strict';
import {handleKofiPayment} from '../kofi-payment.js';
import {deliverKofi} from '../kofi-delivery.js';

test('Ko-fi verified order registers delivery, sends a code, and finishes exactly once',async()=>{
 const owner='11111111-1111-4111-8111-111111111111';
 const transaction='test-order-001';
 const token='12345678-1234-1234-1234-123456789abc';
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',RESEND_API_KEY:'test-resend',KOFI_FROM_EMAIL:'books@example.com',SITE_URL:'https://alysumwriting.com',KOFI_CODE_ENCRYPTION_KEY:'a'.repeat(64)};
 let registered=null,claimed=false,finished=null,sent=null;
 const fetcher=async(url,options={})=>{
  const address=String(url),body=options.body?JSON.parse(options.body):null;
  if(address.includes('/kofi_author_accounts?'))return Response.json([{owner_id:owner}]);
  if(address.endsWith('/register_kofi_order')){registered=body;return Response.json(true);}
  if(address.endsWith('/claim_kofi_delivery')){
   if(claimed)return Response.json(null);
   claimed=true;
   return Response.json({id:'22222222-2222-4222-8222-222222222222',email:'buyer@example.com',ciphertext:body.p_ciphertext});
  }
  if(address.endsWith('/finish_kofi_delivery')){finished=body;return Response.json(true);}
  if(address==='https://api.resend.com/emails'){sent={body,headers:options.headers};return Response.json({id:'test-email'});}
  throw Error('Unexpected endpoint: '+address);
 };
 const request=new Request('https://alysumwriting.com/api/kofi-webhook',{method:'POST',body:new URLSearchParams({data:JSON.stringify({verification_token:token,type:'Shop Order',kofi_transaction_id:transaction,email:'buyer@example.com',currency:'USD',amount:'5.00',shop_items:[{direct_link_code:'chapter-1',quantity:1}]})})});
 const response=await handleKofiPayment(request,env,{fetcher});
 assert.equal(response.status,200);
 assert.equal(registered.p_owner,owner);
 assert.equal(registered.p_transaction,transaction);
 assert.deepEqual(registered.p_items,[{product_id:'chapter-1',quantity:1}]);
 const first=await deliverKofi(env,{fetcher});
 assert.equal(first.sent,1);
 assert.equal(sent.body.to[0],'buyer@example.com');
 assert.match(sent.body.text,/purchase code:/i);
 assert.equal(finished.p_success,true);
 assert.equal((await deliverKofi(env,{fetcher})).sent,0);
});
