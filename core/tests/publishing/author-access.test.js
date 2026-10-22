import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleAuthorAccess } from '../../server/http-handlers/author-access.mjs';
import { sha256 } from '../../server/http-handlers/paid-access.mjs';
import { normalizeProductKey, saleFromNotification, validateSale } from '../../publishing/author-access.js';
import { buildLibraryPayload } from '../../publishing/post-work.js';
import { normalizePublishedWork } from '../../library/work.js';
const origin='https://alysumwriting.com';
const owner='10000000-0000-4000-8000-000000000001', buyer='20000000-0000-4000-8000-000000000002', connectionId='30000000-0000-4000-8000-000000000003';
const secret='creator-private-test-token';
const source={id:'book',user_id:owner,media_format:'novel',sections:{body:[{id:'free',title:'Sample',content:'sample '.repeat(600)},{id:'locked',title:'Private chapter',content:'PRIVATE BODY '.repeat(600)}]}};
const kofi=()=>({verification_token:secret,type:'Shop Order',kofi_transaction_id:'transaction_123',email:' Reader@Example.com ',currency:'USD',amount:'3.00',shop_items:[{direct_link_code:'product123',quantity:1}]});
const payhip=()=>({signature:'',type:'paid',id:'transaction_123',email:'reader@example.com',currency:'USD',price:300,items:[{product_key:'product123'}]});
function request(action,{method='GET',body,as=owner,headers={},query={},form=false}={}) {
    const url=new URL('/api/author-access',origin);url.searchParams.set('action',action);for(const [k,v] of Object.entries(query))url.searchParams.set(k,v);
    return new Request(url,{method,headers:{...(as?{Authorization:`Bearer ${as}`} : {}),Origin:origin,...headers},body:body===undefined?undefined:form?new URLSearchParams({data:JSON.stringify(body)}).toString():JSON.stringify(body)});
}
async function fixture(provider='kofi') {
    const connection={id:connectionId,owner_id:owner,provider,enabled:true,verifier_hash:await sha256(secret)};
    const writes=[],transactions=new Map(),grants=new Map();
    const services={
        async user(req,required=true){const uid=req.headers.get('Authorization')?.slice(7);if(!uid){if(required)throw Error('Sign in to Alysum.');return null;}return {id:uid,email:uid===buyer?'Reader@Example.com':'owner@example.com',email_confirmed_at:'now'};},
        async db(table,{method='GET',query={},body}={}) {
            if(table==='author_access_connections') {if(method==='POST'){writes.push({table,body});return[];}return (!query.owner_id || query.owner_id===`eq.${owner}`)?[connection]:[];}
            if(table==='books')return query.user_id===`eq.${owner}`?[source]:[];
            if(table==='author_access_books')return[];
            if(table==='rpc/save_author_access_book'){writes.push({table,body});return null;}
            if(table==='rpc/apply_author_access_sale') {
                writes.push({table,body});const key=body.p_transaction;const old=transactions.get(key);const reversed=Boolean(old?.reversed || body.p_reversed);
                transactions.set(key,{reversed});if(body.p_products.includes('product123'))grants.set(key,{status:reversed?'reversed':old?.status || 'paid',emailHash:body.p_email_hash});return null;
            }
            if(table==='rpc/read_author_access'){writes.push({table,body});return body.p_reader===buyer && [...grants.values()].some(g=>g.status==='paid')?[{id:'locked',text:'PRIVATE BODY'}]:[];}
            if(table==='author_access_sales'){if(method==='PATCH')writes.push({table,body,query});return[];}
            throw Error(`Unexpected table ${table}`);
        }
    };
    return {connection,writes,grants,run:req=>handleAuthorAccess(req,{}, {services})};
}
const config=()=>({book:'book',selectedIds:['free','locked'],chapterIds:['locked'],connectionId,productKey:'product123',purchaseUrl:'https://ko-fi.com/s/product123',minimumAmount:300,currency:'USD'});

test('shop product URLs must match their actual provider and product path',()=>{
    assert.equal(normalizeProductKey('kofi','https://ko-fi.com/s/abc123'),'abc123');
    assert.equal(normalizeProductKey('payhip','https://payhip.com/b/abc123'),'abc123');
    assert.equal(normalizeProductKey('kofi','https://ko-fi.com.evil.example/s/abc123'),'');
    assert.equal(normalizeProductKey('payhip','https://ko-fi.com/s/abc123'),'');
});
test('Ko-fi one-time shop receipts normalize their exact items, amount and buyer email',()=>{
    const sale=saleFromNotification('kofi',kofi());assert.equal(validateSale(sale),true);assert.equal(sale.amount,300);assert.equal(sale.email,'reader@example.com');assert.deepEqual(sale.products,['product123']);
    for(const amount of ['-3','3e2','NaN','3.001'])assert.throws(()=>saleFromNotification('kofi',{...kofi(),amount}));
});
test('tips, membership notifications, gifts, zero amounts and explicit tests cannot grant access',()=>{
    assert.equal(saleFromNotification('kofi',{...kofi(),type:'Donation'}),null);
    assert.equal(saleFromNotification('kofi',{...kofi(),is_subscription_payment:true}),null);
    assert.equal(saleFromNotification('kofi',{...kofi(),is_test:true}),null);
    assert.equal(saleFromNotification('payhip',{...payhip(),is_gift:true}),null);
    assert.equal(saleFromNotification('payhip',{...payhip(),type:'subscription.created'}),null);
    assert.equal(validateSale(saleFromNotification('kofi',{...kofi(),amount:'0'})),false);
});
test('a forged Ko-fi token never reaches sale storage',async()=>{
    const f=await fixture();const response=await f.run(request('webhook',{method:'POST',as:null,form:true,query:{connection:connectionId},body:{...kofi(),verification_token:'forged'}}));
    assert.equal(response.status,403);assert.equal(f.writes.length,0);assert.equal(f.grants.size,0);
});
test('Payhip signature is verified against the owning service before processing',async()=>{
    const f=await fixture('payhip');const receipt=payhip();
    let response=await f.run(request('webhook',{method:'POST',as:null,query:{connection:connectionId},body:receipt}));assert.equal(response.status,403);
    receipt.signature=await sha256(secret);response=await f.run(request('webhook',{method:'POST',as:null,query:{connection:connectionId},body:receipt}));assert.equal(response.status,200);assert.equal(f.grants.size,1);
});
test('duplicate purchases and a late paid notification after refund do not duplicate or restore grants',async()=>{
    const f=await fixture('payhip');const receipt={...payhip(),signature:await sha256(secret)};
    const send=body=>f.run(request('webhook',{method:'POST',as:null,query:{connection:connectionId},body}));
    assert.equal((await send(receipt)).status,200);assert.equal((await send(receipt)).status,200);assert.equal(f.grants.size,1);
    assert.equal((await send({...receipt,type:'refunded',amount_refunded:100})).status,200);
    assert.equal((await send(receipt)).status,200);assert.equal(f.grants.get(receipt.id).status,'reversed');
});
test('an unrelated product cannot unlock the configured chapters',async()=>{
    const f=await fixture();const body={...kofi(),shop_items:[{direct_link_code:'different_product'}]};
    assert.equal((await f.run(request('webhook',{method:'POST',as:null,form:true,query:{connection:connectionId},body}))).status,200);assert.equal(f.grants.size,0);
});
test('only the verified account identity and email are passed to private reads',async()=>{
    const f=await fixture();
    await f.run(request('webhook',{method:'POST',as:null,form:true,query:{connection:connectionId},body:kofi()}));
    const signed=await f.run(request('read',{as:buyer,query:{book:'book',reader:owner,email:'owner@example.com'}}));
    assert.deepEqual((await signed.json()).chapters,[{id:'locked',text:'PRIVATE BODY'}]);
    const last=f.writes.at(-1).body;assert.equal(last.p_reader,buyer);assert.equal(last.p_email_hash,await sha256('reader@example.com'));
    const anonymous=await f.run(request('read',{as:null,query:{book:'book',reader:buyer}}));assert.deepEqual((await anonymous.json()).chapters,[]);
    assert.match(anonymous.headers.get('Cache-Control'),/no-store/);
});
test('cross-site author mutations and wrong-owner source books are rejected',async()=>{
    const f=await fixture();
    assert.equal((await f.run(request('configure',{method:'POST',body:config(),headers:{Origin:'https://attacker.example'}}))).status,403);
    assert.equal((await f.run(request('configure',{method:'POST',as:buyer,body:config()}))).status,404);assert.equal(f.writes.length,0);
});
test('private snapshots come from the owned saved manuscript, not the supplied body',async()=>{
    const f=await fixture();const response=await f.run(request('configure',{method:'POST',body:{...config(),chapters:[{id:'locked',text:'INJECTED'}]}}));assert.equal(response.status,200);
    const saved=f.writes.at(-1).body;assert.match(saved.p_chapters[0].text,/PRIVATE BODY/);assert.doesNotMatch(JSON.stringify(saved),/INJECTED/);assert.equal(saved.p_owner,owner);
});
test('mismatched product links and locks on unselected chapters cannot be published',async()=>{
    const f=await fixture();
    assert.equal((await f.run(request('configure',{method:'POST',body:{...config(),purchaseUrl:'https://ko-fi.com/s/otherproduct'}}))).status,400);
    assert.equal((await f.run(request('configure',{method:'POST',body:{...config(),selectedIds:['free']}}))).status,400);
    assert.equal((await f.run(request('configure',{method:'POST',body:{...config(),chapterIds:['free','locked']}}))).status,400);assert.equal(f.writes.length,0);
});
test('a completed book can lock all chapters with one product',async()=>{
    const f=await fixture();assert.equal((await f.run(request('configure',{method:'POST',body:{...config(),complete:true,chapterIds:['free','locked']}}))).status,200);assert.equal(f.writes.at(-1).body.p_chapters.length,2);
});
test('connecting a shop stores only a verifier and never returns raw credentials',async()=>{
    const f=await fixture();const response=await f.run(request('connect',{method:'POST',body:{provider:'kofi',secret}}));assert.equal(response.status,200);
    const serialized=JSON.stringify(f.writes);assert.equal(serialized.includes(secret),false);assert.match(serialized,/verifier_hash/);assert.equal((await response.text()).includes(secret),false);
});
test('locked public chapter payloads contain no private body, even when normalized',()=>{
    const form={chapterIds:['free','locked'],lockedChapterIds:['locked'],isPublished:true,chapterAccess:{productUrl:'https://ko-fi.com/s/product123'}};
    const payload=buildLibraryPayload(source,form);assert.equal(JSON.stringify(payload).includes('PRIVATE BODY'),false);
    assert.equal(payload.chapters.find(ch=>ch.id==='locked').content,'');
    const normalized=normalizePublishedWork({id:'book',data:payload});assert.equal(normalized.chapters.length,2);assert.equal(normalized.chapters.find(ch=>ch.id==='locked').locked,true);
    const malicious=normalizePublishedWork({id:'book',data:{...payload,chapters:[{id:'locked',locked:true,content:'PRIVATE BODY',wordCount:600}]}});assert.equal(malicious.chapters[0].content,'');
});
test('missing database setup fails closed and does not ask for Stripe credentials',async()=>{
    const response=await handleAuthorAccess(request('status'),{});assert.deepEqual(await response.json(),{ready:false});
    assert.equal((await handleAuthorAccess(request('configure',{method:'POST',body:config()}),{})).status,503);
});

test('a failed private snapshot save stops publication before any public write',async()=>{
    let code=await readFile(new URL('../../../applications/studio/page-ui/publish-save.js',import.meta.url),'utf8');
    code=code.replace(/(["'])(@alysum\/publishing\/|\/core\/writing-engine\/)([^"']+)\1/g,(_match,_quote,prefix,tail)=>JSON.stringify(new URL((prefix.startsWith('@')?'../../publishing/':'../../writing-engine/')+tail,import.meta.url).href));
    const {runPublishSave}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
    await assert.rejects(runPublishSave({isPublished:true,listed:true,session:{mode:'cloud',user:{id:owner}},book:source,chapters:source.sections.body,
        readForm:()=>({title:'Book',genres:['fantasy'],rating:'general',warningMeta:{version:1,reviewed:true,noneApply:true,coreIds:[],entries:[],note:''},chapterIds:['free','locked'],lockedChapterIds:['locked']}),
        loadDraftCoverFile:async()=>null,saveChapterAccess:async()=>{throw Error('Private save unavailable');},
        api:{updateBook(){assert.fail('Must not save');}},supabase:{from(){assert.fail('Must not publish');}},postError:{}}),/Private save unavailable/);
});

test('real Supabase adapter requests a JSON representation when saving the connection',async()=>{
    const calls=[];
    const fetcher=async(url,options)=>{
        calls.push({url:String(url),options});
        if(String(url).endsWith('/auth/v1/user'))return Response.json({id:owner,email:'owner@example.com',email_confirmed_at:'now'});
        if(options.method==='POST') {
            assert.match(options.headers.Prefer,/return=representation/);
            return Response.json([JSON.parse(options.body)],{status:201});
        }
        return Response.json([]);
    };
    const response=await handleAuthorAccess(request('connect',{method:'POST',body:{provider:'kofi',secret}}),{SUPABASE_SERVICE_ROLE_KEY:'server-test-key'},{fetcher});
    assert.equal(response.status,200);assert.match((await response.json()).webhookUrl,/api\/author-access/);
    const stored=JSON.parse(calls.find(call=>call.options.method==='POST').options.body);assert.equal(stored.verifier_hash,await sha256(secret));assert.equal(JSON.stringify(stored).includes(secret),false);
});

async function loadPublishSave() {
    let code=await readFile(new URL('../../../applications/studio/page-ui/publish-save.js',import.meta.url),'utf8');
    code=code.replace(/(["'])(@alysum\/publishing\/|\/core\/writing-engine\/)([^"']+)\1/g,(_match,_quote,prefix,tail)=>JSON.stringify(new URL((prefix.startsWith('@')?'../../publishing/':'../../writing-engine/')+tail,import.meta.url).href));
    return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
test('short locked chapters give a named error before any write or automatic takedown',async()=>{
    const {runPublishSave}=await loadPublishSave();
    for(const chapters of [[{id:'locked',title:'Chapter 2',content:'short '.repeat(100)}],[{id:'free',title:'Sample',content:'word '.repeat(600)},{id:'locked',title:'Chapter 2',content:'short '.repeat(100)}]]) {
        const postError={};
        await runPublishSave({isPublished:true,listed:true,session:{mode:'cloud',user:{id:owner}},book:source,chapters,
            readForm:()=>({title:'Book',genres:['fantasy'],rating:'general',warningMeta:{version:1,reviewed:true,noneApply:true,coreIds:[],entries:[],note:''},chapterIds:chapters.map(ch=>ch.id),lockedChapterIds:['locked']}),
            saveChapterAccess(){assert.fail('Must not configure');},api:{updateBook(){assert.fail('Must not save');}},supabase:{from(){assert.fail('Must not update or unlist');}},postError});
        assert.match(postError.textContent,/Chapter 2/);assert.match(postError.textContent,/100 \/ 500/);assert.match(postError.textContent,/listing has not changed/);
    }
});
test('a lock missing from the publication selection gives the chapter name before writes',async()=>{
    const {runPublishSave}=await loadPublishSave();const postError={};
    await runPublishSave({isPublished:true,listed:true,session:{mode:'cloud',user:{id:owner}},book:source,chapters:source.sections.body,
        readForm:()=>({title:'Book',genres:['fantasy'],rating:'general',warningMeta:{version:1,reviewed:true,noneApply:true,coreIds:[],entries:[],note:''},chapterIds:['free'],lockedChapterIds:['locked']}),
        saveChapterAccess(){assert.fail('Must not configure');},api:{updateBook(){assert.fail('Must not save');}},supabase:{from(){assert.fail('Must not publish');}},postError});
    assert.match(postError.textContent,/Private chapter/);assert.match(postError.textContent,/Manuscript/);
});
test('restored locks select publication, and unpublishing clears the lock control',async()=>{
    let code=await readFile(new URL('../../../applications/studio/page-ui/publish-access.js',import.meta.url),'utf8');
    code=code.replace(/from '(\/core\/[^']+)'/g,(_match,path)=>'from '+JSON.stringify(new URL('../..'+path.slice(5),import.meta.url).href));
    const {bindLockSelection}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
    class Checkbox extends EventTarget {constructor(checked){super();this.checked=checked;}}
    const publish=new Checkbox(false),lock=new Checkbox(true);bindLockSelection(publish,lock);assert.equal(publish.checked,true);
    publish.checked=false;publish.dispatchEvent(new Event('change'));assert.equal(lock.checked,false);
    lock.checked=true;lock.dispatchEvent(new Event('change'));assert.equal(publish.checked,true);
});
