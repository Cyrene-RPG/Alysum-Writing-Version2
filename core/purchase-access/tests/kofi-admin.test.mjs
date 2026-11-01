import test from 'node:test';
import assert from 'node:assert/strict';
import {handleKofiAdmin} from '../kofi-admin.js';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'};
const user='11111111-1111-4111-8111-111111111111',pass='22222222-2222-4222-8222-222222222222';
function fake({connected=true,other=false}={}){
 const writes=[];
 async function fetcher(url,opts={}){
  const u=String(url);
  if(u.includes('/auth/v1/user'))return Response.json({id:user,email_confirmed_at:'2026-01-01'});
  if(u.includes('/purchase_passes?'))return Response.json([{id:pass,title:'Chapter 3',owner_id:user,amount:150,currency:'USD'}]);
  if(u.includes('/kofi_author_accounts?'))return Response.json(connected?[{owner_id:user}]:[]);
  if(u.includes('/kofi_pass_products?')&&opts.method==='POST'){writes.push(JSON.parse(opts.body));return Response.json(writes);}
  if(u.includes('/kofi_pass_products?'))return Response.json(other?[{pass_id:'33333333-3333-4333-8333-333333333333'}]:[]);
  throw Error('Unexpected request '+u);
 }
 return {fetcher,writes};
}
const request=(body)=>new Request('https://example.pages.dev/api/kofi-products',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify(body)});
test('author can save Ko-fi URL as inactive mapping',async()=>{
 const f=fake();
 const res=await handleKofiAdmin(request({productUrl:'https://ko-fi.com/s/1034cbe6ff',passId:pass,enabled:false}),env,f);
 assert.equal(res.status,200);assert.deepEqual(f.writes[0],{product_id:'1034cbe6ff',pass_id:pass,enabled:false});
});
test('author cannot enable unverified sales',async()=>{
 const f=fake();const res=await handleKofiAdmin(request({productId:'1034cbe6ff',passId:pass,enabled:true}),env,f);
 assert.equal(res.status,409);assert.equal(f.writes.length,0);
});
test('mapping requires connected account',async()=>{
 const f=fake({connected:false});const res=await handleKofiAdmin(request({productId:'1034cbe6ff',passId:pass,enabled:false}),env,f);
 assert.equal(res.status,409);
});
test('rejects takeover of another author product',async()=>{
 const f=fake({other:true});const res=await handleKofiAdmin(request({productId:'1034cbe6ff',passId:pass,enabled:false}),env,f);
 assert.equal(res.status,409);assert.equal(f.writes.length,0);
});
