import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handlePaidAccess, verifyStripeSignature, paymentConfiguration, createPaymentServices, sha256 } from '../../server/http-handlers/paid-access.mjs';
import { validatePrivateOffer, publicEdition, canReadPrivateChapter, matchesPaidSession } from '../../publishing/paid-access.js';
const origin = 'https://experiment-author-paid-acces.alysum-writing-version2.pages.dev';
const ownerId = '10000000-0000-4000-8000-000000000001';
const buyerId = '20000000-0000-4000-8000-000000000002';
const otherId = '30000000-0000-4000-8000-000000000003';
const offerId = '40000000-0000-4000-8000-000000000004';
const orderId = '50000000-0000-4000-8000-000000000005';
const anotherOrderId = '60000000-0000-4000-8000-000000000006';
const account = 'acct_author';
const env = { PAID_ACCESS_ENABLED:'true', PAID_ACCESS_MODE:'test', PAID_ACCESS_ORIGIN:origin, STRIPE_SECRET_KEY:'sk_test_fixture', STRIPE_CONNECT_CLIENT_ID:'ca_fixture', STRIPE_CONNECT_WEBHOOK_SECRET:'whsec_fixture', SUPABASE_SERVICE_ROLE_KEY:'test-service-key' };
const chapters = [{id:'free',title:'Free sample',content:'<p>Free sample.</p>',text:'Free sample.'},{id:'paid',title:'Paid chapter',content:'<p>PRIVATE BODY</p>',text:'PRIVATE BODY'},{id:'last',title:'Last chapter',content:'<p>PRIVATE LAST</p>',text:'PRIVATE LAST'}];
const offer = () => ({livemode:false,id:offerId,owner_id:ownerId,source_book_id:'source',stripe_account:account,title:'Test book',mode:'chapter',amount:300,currency:'usd',chapters:structuredClone(chapters),paid_chapter_ids:['paid','last'],active:true});
const order = () => ({livemode:false,id:orderId,offer_id:offerId,buyer_id:buyerId,stripe_account:account,chapter_ids:['paid'],amount:300,currency:'usd',stripe_session:'cs_test_checkout',payment_intent:null,status:'pending'});
const session = () => ({id:'cs_test_checkout',url:'https://checkout.stripe.com/c/test',livemode:false,mode:'payment',status:'complete',payment_status:'paid',amount_total:300,currency:'usd',client_reference_id:buyerId,metadata:{order_id:orderId,offer_id:offerId},payment_intent:{id:'pi_test',latest_charge:{id:'ch_test',paid:true,amount:300,currency:'usd',amount_refunded:0,refunded:false,disputed:false}}});
function request(action,{method='GET',body,as=buyerId,headers={},query={}}={}) {
 const url=new URL('/api/paid-access',origin);url.searchParams.set('action',action);Object.entries(query).forEach(([k,v])=>url.searchParams.set(k,v));
 return new Request(url,{method,headers:{Origin:origin,...(as?{Authorization:`Bearer ${as}`} : {}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
}
function fixture({livemode=false}={}) {
 const tables={paid_access_connections:[{owner_id:ownerId,stripe_account:account,charges_enabled:true}],paid_access_offers:[offer()],paid_access_orders:[order()],paid_access_oauth_states:[],books:[{id:'source',user_id:ownerId,title:'A private draft',media_format:'novel',is_published:false,publish_meta:{complete:false},sections:{body:structuredClone(chapters)}}],library:[]};
 for (const key of ['paid_access_connections','paid_access_offers','paid_access_orders']) tables[key].forEach(row=>row.livemode=livemode);
 if(livemode) tables.paid_access_orders[0].stripe_session='cs_live_checkout';
 const calls=[];const stripeCalls=[];const events=new Set();let currentSession={...session(),livemode,id:livemode?'cs_live_checkout':'cs_test_checkout'};
 function filter(rows,query={}) { return rows.filter(row=>Object.entries(query).every(([key,value])=>{if(['select','limit','order','on_conflict'].includes(key))return true; if(value.startsWith('eq.'))return String(row[key])===value.slice(3);if(value.startsWith('in.('))return value.slice(4,-1).split(',').includes(row[key]);return true;})); }
 const services={
  async user(req,required=true){ const token=req.headers.get('Authorization')?.slice(7);if(!token){if(required)throw Error('unauthorized');return null;}return {id:token,email_confirmed_at:'now'}; },
  async db(table,options={}){calls.push({table,...structuredClone(options)});const {method='GET',query={},body}=options;
   if(table==='rpc/consume_paid_access_state'){const row=tables.paid_access_oauth_states.find(r=>r.state_hash===body.p_hash&&r.livemode===body.p_livemode&&new Date(r.expires_at)>new Date());if(!row)return[];tables.paid_access_oauth_states=tables.paid_access_oauth_states.filter(r=>r!==row);return[{owner_id:row.owner_id}];}
   if(table==='rpc/apply_paid_access_event'){const row=tables.paid_access_orders.find(r=>r.id===body.p_order);assert.equal(row.livemode,body.p_livemode);assert.equal(row.stripe_account,body.p_account);assert.equal(row.stripe_session,body.p_session);assert.equal(row.amount,body.p_amount);assert.equal(row.currency,body.p_currency);if(events.has(body.p_event))return false;events.add(body.p_event);if(row.status!=='reversed')row.status=body.p_status;row.payment_intent=body.p_intent;return true;}
   const rows=tables[table];assert.ok(rows,`unexpected table ${table}`);
   if(method==='GET')return structuredClone(filter(rows,query));
   if(method==='DELETE'){const matches=filter(rows,query);tables[table]=rows.filter(r=>!matches.includes(r));return matches;}
   if(method==='PATCH'){const matches=filter(rows,query);matches.forEach(row=>Object.assign(row,structuredClone(body)));return structuredClone(matches);}
   if(method==='POST'){
    if(table==='paid_access_orders'&&rows.some(r=>r.id===body.id||(r.buyer_id===body.buyer_id&&r.offer_id===body.offer_id&&['pending','paid'].includes(r.status)&&JSON.stringify(r.chapter_ids)===JSON.stringify(body.chapter_ids))))return[];
    if(table==='paid_access_connections'){const existing=rows.find(r=>r.owner_id===body.owner_id&&r.livemode===body.livemode);if(existing){Object.assign(existing,body);return[structuredClone(existing)];}}
    const row={...(table==='paid_access_orders'?{status:'pending'}:{}),...structuredClone(body)};rows.push(row);return[structuredClone(row)];
   } throw Error('Unexpected mutation');
  },
  async stripe(path,options={}){stripeCalls.push({path,...structuredClone(options)});
   if(path.startsWith('/v1/accounts/'))return {type:'standard',charges_enabled:true};
   if(path==='/oauth/token')return {livemode,scope:'read_write',stripe_user_id:account,access_token:'DO_NOT_STORE',refresh_token:'DO_NOT_STORE'};
   if(path.startsWith('/v1/checkout/sessions/'))return structuredClone(currentSession);
   if(path==='/v1/checkout/sessions')return {...structuredClone(currentSession),status:'open',payment_status:'unpaid'};
   if(path.startsWith('/v1/payment_intents/'))return {metadata:{order_id:orderId}};
   if(path.startsWith('/v1/charges/'))return {payment_intent:'pi_test'};
   throw Error('Unexpected Stripe request '+path);
  }
 };
 return {tables,calls,stripeCalls,services,setSession(value){currentSession=value;},run(req,settings=livemode?{...env,PAID_ACCESS_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture'}:env){return handlePaidAccess(req,settings,{services});}};
}
function event(id,type='checkout.session.completed'){return{id,livemode:false,account,type,data:{object:{id:'cs_test_checkout',metadata:{order_id:orderId},payment_intent:'pi_test'}}};}
function webhook(evt,secret=env.STRIPE_CONNECT_WEBHOOK_SECRET){const raw=JSON.stringify(evt);const timestamp=Math.floor(Date.now()/1000);const signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return request('stripe-webhook',{method:'POST',as:null,body:raw,headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`}});}

test('an explicit origin, enabled environment and mode-matched key are required for checkout',async()=>{
 for(const [settings,target] of [[env,'https://alysumwriting.com'],[{...env,STRIPE_SECRET_KEY:'sk_live_forbidden'},origin],[{...env,PAID_ACCESS_ENABLED:'false'},origin],[{...env,PAID_ACCESS_ORIGIN:'https://other.test'},origin]])assert.equal(paymentConfiguration(settings,target).configured,false);
 const f=fixture();const response=await f.run(request('checkout',{method:'POST',body:{}}),{...env,STRIPE_SECRET_KEY:'sk_live_forbidden'});assert.equal(response.status,503);assert.equal(f.calls.length,0);assert.equal(f.stripeCalls.length,0);
 const cross=await f.run(request('stripe-connect',{method:'POST',headers:{Origin:'https://attacker.test'},body:{}}));assert.equal(cross.status,403);
});
test('missing server setup gives actionable names without secret values or pretend connectivity',async()=>{
 const response=await handlePaidAccess(request('status'),{});const data=await response.json();assert.equal(data.configured,false);assert.equal(data.storageReady,false);assert.equal(data.connection,null);assert.ok(data.missing.includes('SUPABASE_SERVICE_ROLE_KEY'));assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('server validates authentication with Supabase and rejects an invalid token before reads',async()=>{
 const f=createPaymentServices(env,async(url,init)=>{assert.match(String(url),/auth\/v1\/user$/);assert.equal(init.headers.Authorization,'Bearer fake');return Response.json({error:'invalid'},{status:401});});
 await assert.rejects(f.user(request('checkout',{headers:{Authorization:'Bearer fake'}})),/session/);
});
test('provider signatures require the exact body and a fresh timestamp, including rotated signatures',async()=>{
 const raw='{"test":true}';const now=Date.now();const t=Math.floor(now/1000);const good=createHmac('sha256','whsec_test').update(`${t}.${raw}`).digest('hex');
 assert.equal(await verifyStripeSignature(raw,`t=${t},v1=${'0'.repeat(64)},v1=${good}`,'whsec_test',now),true);
 assert.equal(await verifyStripeSignature(raw+' ',`t=${t},v1=${good}`,'whsec_test',now),false);
 assert.equal(await verifyStripeSignature(raw,`t=${t},v1=${good}`,'whsec_test',now+301000),false);
 assert.equal(await verifyStripeSignature(raw,`t=${t},t=${t},v1=${good}`,'whsec_test',now),false);
});
test('metadata never contains private body text; paid chapter API checks the signed-in buyer, not local grants',async()=>{
 const f=fixture();const publicResponse=await f.run(request('edition',{query:{edition:offerId},as:null}));const metadata=await publicResponse.text();assert.doesNotMatch(metadata,/PRIVATE BODY|PRIVATE LAST|owner_id|stripe_account/);
 for(const as of [null,otherId,buyerId]){const denied=await f.run(request('chapter',{query:{edition:offerId,chapter:'paid',grant:'paid'},as}));assert.equal(denied.status,402);assert.doesNotMatch(await denied.text(),/PRIVATE BODY/);}
 const free=await f.run(request('chapter',{query:{edition:offerId,chapter:'free'},as:null}));assert.equal(free.status,200);
 const author=await f.run(request('chapter',{query:{edition:offerId,chapter:'paid'},as:ownerId}));assert.match(await author.text(),/PRIVATE BODY/);
 f.tables.paid_access_orders[0].status='paid';
 const paid=await f.run(request('chapter',{query:{edition:offerId,chapter:'paid'},as:buyerId}));assert.equal(paid.status,200);assert.match(await paid.text(),/PRIVATE BODY/);
 assert.equal((await f.run(request('chapter',{query:{edition:offerId,chapter:'last'},as:buyerId}))).status,402);
});
test('chapter and bundle grants are limited to the correct edition and buyer',()=>{
 const o=offer();assert.equal(canReadPrivateChapter(o,'paid',buyerId,[{...order(),status:'paid'}]),true);
 for(const changed of [{buyer_id:otherId},{offer_id:anotherOrderId},{status:'pending'},{status:'reversed'},{chapter_ids:['last']}])assert.equal(canReadPrivateChapter(o,'paid',buyerId,[{...order(),status:'paid',...changed}]),false);
 assert.equal(canReadPrivateChapter(o,'missing',ownerId,[]),false);
 assert.doesNotMatch(JSON.stringify(publicEdition(o)),/PRIVATE/);
});
test('OAuth binds the callback to a browser cookie and consumes the state once without storing provider tokens',async()=>{
 const f=fixture();const start=await f.run(request('stripe-connect',{method:'POST',body:{},as:ownerId}));assert.equal(start.status,200);const target=new URL((await start.json()).url);assert.equal(target.origin,'https://connect.stripe.com');const state=target.searchParams.get('state');assert.equal(f.tables.paid_access_oauth_states[0].state_hash,await sha256(state));assert.match(start.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
 const callback=()=>request('stripe-callback',{as:null,query:{state,code:'authorization-code'},headers:{Cookie:`alysum_paid_state=${state}`}});
 assert.equal((await f.run(request('stripe-callback',{as:null,query:{state,code:'x'}}))).status,403);
 const connected=await f.run(callback());assert.equal(connected.status,303);assert.match(connected.headers.get('Location'),/connection=connected/);
 assert.doesNotMatch(JSON.stringify(f.tables),/DO_NOT_STORE/);assert.equal((await f.run(callback())).status,403);
});
test('OAuth rejection and expiry never connect an account',async()=>{
 const f=fixture();let response=await f.run(request('stripe-connect',{method:'POST',body:{},as:ownerId}));let state=new URL((await response.json()).url).searchParams.get('state');
 const denied=await f.run(request('stripe-callback',{as:null,query:{state,error:'access_denied'},headers:{Cookie:`alysum_paid_state=${state}`}}));assert.equal(denied.status,303);assert.match(denied.headers.get('Location'),/canceled/);assert.equal(f.stripeCalls.length,0);
 response=await f.run(request('stripe-connect',{method:'POST',body:{},as:ownerId}));state=new URL((await response.json()).url).searchParams.get('state');f.tables.paid_access_oauth_states[0].expires_at='2000-01-01';
 assert.equal((await f.run(request('stripe-callback',{as:null,query:{state,code:'x'},headers:{Cookie:`alysum_paid_state=${state}`}}))).status,403);
});
test('private edition creation reads fresh owned source, keeps all text out of Library and rejects published books',async()=>{
 const f=fixture();const body={bookId:'source',mode:'bundle',price:'4.25',currency:'usd',chapterIds:['free','paid','last'],paidIds:['paid','last']};
 const response=await f.run(request('create-edition',{method:'POST',as:ownerId,body}));assert.equal(response.status,201);assert.equal(f.tables.paid_access_offers.length,2);assert.equal(f.tables.paid_access_offers[1].amount,425);assert.match(f.tables.paid_access_offers[1].chapters[1].text,/PRIVATE BODY/);
 assert.equal(f.calls.some(c=>['library','books'].includes(c.table)&&c.method==='POST'),false);
 assert.equal((await f.run(request('create-edition',{method:'POST',as:otherId,body}))).status,404);
 f.tables.books[0].is_published=true;assert.equal((await f.run(request('create-edition',{method:'POST',as:ownerId,body}))).status,409);
});
test('private paid editions reject saved fan fiction before creating offers or contacting Stripe',async()=>{
 for(const metadata of [{workType:'fanfiction'},{genres:['fanfic']}]){
  const f=fixture();f.tables.books[0].publish_meta=metadata;
  const response=await f.run(request('create-edition',{method:'POST',as:ownerId,body:{bookId:'source',workType:'original',mode:'bundle',price:'4.25',currency:'usd',chapterIds:['free','paid','last'],paidIds:['paid','last']}}));
  assert.equal(response.status,400);assert.match(await response.text(),/Fan fiction cannot/);assert.equal(f.tables.paid_access_offers.length,1);assert.equal(f.stripeCalls.length,0);
 }
});
test('old paid offers cannot start new checkouts after the source is classified as fan fiction',async()=>{
 const f=fixture();f.tables.books[0].publish_meta={workType:'fanfiction'};
 const response=await f.run(request('checkout',{method:'POST',body:{edition:offerId,chapter:'paid',requestId:anotherOrderId}}));
 assert.equal(response.status,400);assert.match(await response.text(),/Fan fiction/);assert.equal(f.stripeCalls.length,0);
 assert.equal(f.tables.paid_access_orders.length,1);
});
test('complete-book validation requires all chapters and cannot lock the entire sample',()=>{
 const base={mode:'book',price:'3.00',currency:'usd',chapterIds:['free','paid','last']};
 assert.throws(()=>validatePrivateOffer(base,chapters,false),/complete/);
 assert.throws(()=>validatePrivateOffer({...base,chapterIds:['free','paid']},chapters,true),/every chapter/);
 const good=validatePrivateOffer(base,chapters,true);assert.deepEqual(good.paidIds,['paid','last']);
 assert.throws(()=>validatePrivateOffer({...base,mode:'bundle',paidIds:base.chapterIds},chapters,false),/free/);
});
test('checkout uses server price and connected account, never platform charges or browser-supplied amounts',async()=>{
 const f=fixture();f.tables.paid_access_orders=[];
 const response=await f.run(request('checkout',{method:'POST',body:{edition:offerId,chapter:'paid',requestId:orderId,amount:1,currency:'eur',stripe_account:'acct_attacker'}}));
 assert.equal(response.status,200);const call=f.stripeCalls.find(c=>c.path==='/v1/checkout/sessions');assert.equal(call.account,account);assert.equal(call.body['line_items[0][price_data][unit_amount]'],'300');assert.equal(call.body['line_items[0][price_data][currency]'],'usd');
 assert.equal(call.body.client_reference_id,buyerId);assert.equal(call.idempotency,`alysum-paid-access-${orderId}`);assert.equal(Object.keys(call.body).some(k=>/application_fee|transfer_data/.test(k)),false);
 assert.equal(f.tables.paid_access_orders[0].status,'pending');assert.equal(f.tables.paid_access_orders[0].stripe_session,'cs_test_checkout');
});
test('a repeated checkout attempt reuses its pending purchase instead of creating another order',async()=>{
 const f=fixture();f.tables.paid_access_orders[0].stripe_session=null;
 const body={edition:offerId,chapter:'paid',requestId:anotherOrderId};
 const response=await f.run(request('checkout',{method:'POST',body}));assert.equal(response.status,200);assert.equal(f.tables.paid_access_orders.length,1);
 assert.equal(f.stripeCalls.find(c=>c.path==='/v1/checkout/sessions').idempotency,`alysum-paid-access-${orderId}`);
});
test('author cannot purchase own edition and a different account cannot confirm someone else’s purchase',async()=>{
 const f=fixture();assert.equal((await f.run(request('checkout',{method:'POST',as:ownerId,body:{edition:offerId,chapter:'paid',requestId:orderId}}))).status,400);
 assert.equal((await f.run(request('confirm',{method:'POST',as:otherId,body:{order:orderId}}))).status,404);assert.equal(f.tables.paid_access_orders[0].status,'pending');
});
test('confirmation retrieves Stripe and grants only fully matched paid sessions',async()=>{
 for(const change of [{payment_status:'unpaid'},{amount_total:1},{currency:'eur'},{client_reference_id:otherId},{livemode:true},{metadata:{order_id:anotherOrderId,offer_id:offerId}}]){
  const f=fixture();f.setSession({...session(),...change});const response=await f.run(request('confirm',{method:'POST',body:{order:orderId}}));assert.notEqual(f.tables.paid_access_orders[0].status,'paid');assert.ok(response.status===200||response.status===409);
 }
 const f=fixture();assert.equal((await f.run(request('confirm',{method:'POST',body:{order:orderId}}))).status,200);assert.equal(f.tables.paid_access_orders[0].status,'paid');assert.equal(f.tables.paid_access_orders[0].payment_intent,'pi_test');
});
test('unverified or mismatched webhook events cannot grant access; valid events are idempotent',async()=>{
 const f=fixture();const bad=await f.run(webhook(event('evt_one'),'whsec_wrong'));assert.equal(bad.status,400);assert.equal(f.tables.paid_access_orders[0].status,'pending');
 const mismatch=event('evt_two');mismatch.account='acct_other';assert.equal((await f.run(webhook(mismatch))).status,409);
 const valid=event('evt_three');assert.equal((await f.run(webhook(valid))).status,200);assert.equal((await f.run(webhook(valid))).status,200);assert.equal(f.tables.paid_access_orders[0].status,'paid');
});
test('refund/dispute revocation is terminal even when an older payment notification arrives later',async()=>{
 const f=fixture();await f.run(webhook(event('evt_paid')));assert.equal(f.tables.paid_access_orders[0].status,'paid');
 await f.run(webhook(event('evt_refund','charge.refunded')));assert.equal(f.tables.paid_access_orders[0].status,'reversed');
 await f.run(webhook(event('evt_late_paid')));assert.equal(f.tables.paid_access_orders[0].status,'reversed');
 assert.equal((await f.run(request('chapter',{query:{edition:offerId,chapter:'paid'}}))).status,402);
});
test('confirmation also detects a refund if its webhook has not arrived yet',async()=>{
 const f=fixture();await f.run(request('confirm',{method:'POST',body:{order:orderId}}));assert.equal(f.tables.paid_access_orders[0].status,'paid');
 const refunded=session();refunded.payment_intent.latest_charge.amount_refunded=50;f.setSession(refunded);
 await f.run(request('confirm',{method:'POST',body:{order:orderId}}));assert.equal(f.tables.paid_access_orders[0].status,'reversed');
});
test('provider disconnect stops new purchases while existing verified reading access remains',async()=>{
 const f=fixture();f.tables.paid_access_orders[0].status='paid';await f.run(webhook(event('evt_disconnect','account.application.deauthorized')));assert.equal(f.tables.paid_access_connections[0].charges_enabled,false);
 assert.equal((await f.run(request('checkout',{method:'POST',body:{edition:offerId,chapter:'last',requestId:anotherOrderId}}))).status,409);
 assert.equal((await f.run(request('chapter',{query:{edition:offerId,chapter:'paid'}}))).status,200);
});
test('payment matching refuses wrong connected accounts and incomplete session identities',()=>{
 const complete={...session(),payment_intent:'pi_test'};assert.equal(matchesPaidSession(order(),complete,account),true);assert.equal(matchesPaidSession(order(),complete,'acct_attacker'),false);assert.equal(matchesPaidSession(order(),{...complete,id:'cs_test_other'},account),false);
});

test('OAuth exchange authenticates with the documented secret-key Basic header and never browser credentials',async()=>{
 const services=createPaymentServices(env,async(url,init)=>{assert.equal(String(url),'https://connect.stripe.com/oauth/token');assert.equal(init.headers.Authorization,`Basic ${btoa(env.STRIPE_SECRET_KEY+':')}`);assert.match(init.body,/grant_type=authorization_code/);return Response.json({stripe_user_id:account,livemode:false,scope:'read_write'});});
 await services.stripe('/oauth/token',{method:'POST',oauth:true,body:{grant_type:'authorization_code',code:'fixture'}});
});
test('invalid request objects and oversized webhook bodies fail before any purchase write',async()=>{
 const f=fixture();for(const body of ['null','[]','"string"','{'])assert.equal((await f.run(request('checkout',{method:'POST',body}))).status,400);
 const response=await f.run(request('stripe-webhook',{method:'POST',body:'x'.repeat(262145)}));assert.equal(response.status,413);assert.equal(f.calls.some(c=>c.method==='POST'),false);
});
test('complete-book purchase order uses manuscript order even when a client reorders chapter IDs',()=>{
 const result=validatePrivateOffer({mode:'book',price:'3.00',currency:'usd',chapterIds:['last','paid','free']},chapters,true);
 assert.deepEqual(result.chapters.map(ch=>ch.id),['free','paid','last']);assert.deepEqual(result.paidIds,['paid','last']);
});
test('an expired provider checkout is retired without starting another charge for the same order',async()=>{
 const f=fixture();f.setSession({...session(),status:'expired',payment_status:'unpaid'});
 const response=await f.run(request('checkout',{method:'POST',body:{edition:offerId,chapter:'paid',requestId:orderId}}));assert.equal(response.status,409);assert.equal(f.tables.paid_access_orders[0].status,'expired');assert.equal(f.stripeCalls.some(c=>c.path==='/v1/checkout/sessions'),false);
});

test('live purchases require explicit live mode and live keys, with a matching HTTPS origin',()=>{
 const live={...env,PAID_ACCESS_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture',PAID_ACCESS_ORIGIN:'https://alysumwriting.com'};
 assert.equal(paymentConfiguration(live,'https://alysumwriting.com').configured,true);
 assert.equal(paymentConfiguration({...live,STRIPE_SECRET_KEY:'sk_test_fixture'},'https://alysumwriting.com').configured,false);
 assert.equal(paymentConfiguration({...live,PAID_ACCESS_MODE:undefined},'https://alysumwriting.com').configured,false);
 assert.equal(paymentConfiguration({...live,PAID_ACCESS_ORIGIN:'http://localhost'},'http://localhost').configured,false);
});
test('live checkout is a real-mode direct charge on the author account, with no platform transfer',async()=>{
 const f=fixture({livemode:true});f.tables.paid_access_orders=[];
 const result=await f.run(request('checkout',{method:'POST',body:{edition:offerId,chapter:'paid',requestId:orderId}}));
 assert.equal(result.status,200);const data=await result.json();assert.match(data.url,/checkout.stripe.com/);
 assert.equal(f.tables.paid_access_orders[0].livemode,true);assert.equal(f.tables.paid_access_orders[0].stripe_session,'cs_live_checkout');
 const call=f.stripeCalls.find(c=>c.path==='/v1/checkout/sessions');assert.equal(call.account,account);assert.equal(Object.keys(call.body).some(k=>/transfer|application_fee/.test(k)),false);
});
test('a verified live purchase grants live reading access and a refund removes it',async()=>{
 const f=fixture({livemode:true});let evt=event('evt_livepaid');evt.livemode=true;evt.data.object.id='cs_live_checkout';
 assert.equal((await f.run(webhook(evt))).status,200);assert.equal(f.tables.paid_access_orders[0].status,'paid');
 assert.equal((await f.run(request('chapter',{query:{edition:offerId,chapter:'paid'}}))).status,200);
 evt=event('evt_liverefund','charge.refunded');evt.livemode=true;
 assert.equal((await f.run(webhook(evt))).status,200);assert.equal(f.tables.paid_access_orders[0].status,'reversed');
 assert.equal((await f.run(request('chapter',{query:{edition:offerId,chapter:'paid'}}))).status,402);
});
test('sandbox editions, purchases and events cannot unlock or impersonate live access',async()=>{
 const liveEnv={...env,PAID_ACCESS_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture'};
 const sandbox=fixture();assert.equal((await sandbox.run(request('edition',{query:{edition:offerId}}),liveEnv)).status,404);
 const real=fixture({livemode:true});assert.equal((await real.run(webhook(event('evt_sandbox')))).status,400);assert.equal(real.tables.paid_access_orders[0].status,'pending');
 assert.equal(canReadPrivateChapter({...offer(),livemode:true},'paid',buyerId,[{...order(),status:'paid'}]),false);
 assert.equal(canReadPrivateChapter(offer(),'paid',buyerId,[{...order(),livemode:true,status:'paid'}]),false);
});
test('live OAuth connection is mode-bound and does not consume a sandbox handshake',async()=>{
 const f=fixture({livemode:true});const response=await f.run(request('stripe-connect',{method:'POST',body:{},as:ownerId}));
 const state=new URL((await response.json()).url).searchParams.get('state');assert.equal(f.tables.paid_access_oauth_states[0].livemode,true);
 const callback=request('stripe-callback',{as:null,query:{state,code:'live-code'},headers:{Cookie:`alysum_paid_state=${state}`}});
 assert.equal((await f.run(callback)).status,303);assert.equal(f.tables.paid_access_connections[0].livemode,true);
});

test('account lists restore only the current reader’s verified purchases and the author’s own editions',async()=>{
 const f=fixture({livemode:true});f.tables.paid_access_orders[0].status='paid';
 const reader=await (await f.run(request('account-editions'))).json();assert.equal(reader.created.length,0);assert.equal(reader.purchased[0].id,offerId);assert.doesNotMatch(JSON.stringify(reader),/PRIVATE|stripe_account|source_book/);
 const stranger=await (await f.run(request('account-editions',{as:otherId}))).json();assert.deepEqual(stranger,{created:[],purchased:[]});
 const author=await (await f.run(request('account-editions',{as:ownerId}))).json();assert.equal(author.created[0].id,offerId);
 f.tables.paid_access_orders[0].status='reversed';const refunded=await (await f.run(request('account-editions'))).json();assert.equal(refunded.purchased.length,0);
});
