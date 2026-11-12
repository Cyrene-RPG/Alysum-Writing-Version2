import test from 'node:test';
import assert from 'node:assert/strict';
import {handleKofiPayment} from '../kofi-payment.js';
const env={KOFI_VERIFICATION_TOKEN:'secret',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service'};
const post=data=>new Request('https://alysumwriting.com/api/kofi-webhook',{method:'POST',body:new URLSearchParams({data:JSON.stringify(data)})});
test('invalid webhook token cannot register purchases',async()=>{
 const response=await handleKofiPayment(post({verification_token:'wrong',type:'Shop Order'}),env,{fetcher:()=>{throw Error('Unexpected database call');}});
 assert.equal(response.status,401);
});
test('valid order forwards amount and items to server-side RPC',async()=>{
 let body;
 const response=await handleKofiPayment(post({verification_token:'12345678-1234-1234-1234-123456789abc',type:'Shop Order',kofi_transaction_id:'tx',email:'buyer@example.com',currency:'USD',amount:'5.00',shop_items:[{direct_link_code:'chapter-1',quantity:1}]}),env,{fetcher:async(_url,options)=>{if(String(_url).includes('kofi_author_accounts'))return Response.json([{owner_id:'11111111-1111-4111-8111-111111111111'}]);if(String(_url).includes('register_kofi_order')){body=JSON.parse(options.body);return new Response('true',{status:200});}return new Response(null,{status:201});}});
 assert.equal(response.status,200);assert.equal(body.p_total,'5.00');assert.equal(body.p_items[0].product_id,'chapter-1');
});
