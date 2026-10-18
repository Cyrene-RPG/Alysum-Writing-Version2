import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSnippetDownload, MAX_PNG_BYTES } from '../../server/http-handlers/snippet-download.mjs';
import { createSnippetDownloadApi } from '../../publishing/snippet-download.js';
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=', 'base64'));
const id = 'a'.repeat(48), origin = 'https://alysumwriting.com';
function fixture() {
 const store = new Map(); let clock = Date.now();
 const dependencies = { cache: { put: async (k,r) => store.set(k.url,r.clone()), match: async k => store.get(k.url)?.clone() }, authorize: async () => true, now: () => clock, token: () => id };
 return { dependencies, expire() { clock += 300001; } };
}
function upload(body = png, headers = {}) { return new Request(origin+'/api/snippet-download', {method:'POST',body,headers:{'Content-Type':'image/png','X-File-Name':'my-card.png',Origin:origin,...headers}}); }
test('server returns a reusable HTTP attachment with exact PNG bytes, then expires it', async () => {
 const f=fixture(); const response=await handleSnippetDownload(upload(),f.dependencies);assert.equal(response.status,201);
 const prepared=await response.json();assert.match(prepared.url,/token=aaaa/);
 for(let attempt=0;attempt<2;attempt++){
  const download=await handleSnippetDownload(new Request(origin+prepared.url),f.dependencies);
  assert.equal(download.headers.get('Content-Disposition'),'attachment; filename="my-card.png"');
  assert.equal(download.headers.get('Content-Type'),'image/png');assert.equal(download.headers.get('Cache-Control'),'private, no-store');
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()),png);
 }
 const head=await handleSnippetDownload(new Request(origin+prepared.url,{method:'HEAD'}),f.dependencies);assert.equal((await head.arrayBuffer()).byteLength,0);
 f.expire();assert.equal((await handleSnippetDownload(new Request(origin+prepared.url),f.dependencies)).status,410);
});
test('unauthenticated, cross-origin, oversized, and non-PNG uploads are rejected', async () => {
 const f=fixture();assert.equal((await handleSnippetDownload(upload(),{...f.dependencies,authorize:async()=>false})).status,401);
 assert.equal((await handleSnippetDownload(upload(png,{Origin:'https://other.test'}),f.dependencies)).status,403);
 assert.equal((await handleSnippetDownload(upload(png,{'Content-Length':String(MAX_PNG_BYTES+1)}),f.dependencies)).status,413);
 assert.equal((await handleSnippetDownload(upload('not a PNG'),f.dependencies)).status,400);
 assert.equal((await handleSnippetDownload(upload(png,{'Content-Type':'text/html'}),f.dependencies)).status,415);
});
test('the client prepares only a PNG under the signed-in session and rejects foreign download URLs', async () => {
 const client={auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}};
 const file=new Blob([png],{type:'image/png'});file.name='card.png';
 const api=createSnippetDownloadApi(client,{origin,getBook:()=>({id:'archangel-book',title:'Another WIP'}),fetcher:async(url,init)=>{
  assert.equal(url.href,origin+'/api/snippet-download');assert.equal(init.headers.Authorization,'Bearer test-session');assert.equal(init.body,file);assert.equal(init.headers['X-Book-ID'],'archangel-book');
  return Response.json({url:'/api/snippet-download?token='+id,expiresAt:Date.now()+600000});
 }});assert.equal((await api.prepare(file)).url,origin+'/api/snippet-download?token='+id);
 const foreign=createSnippetDownloadApi(client,{origin,getBook:()=>({id:'archangel-book',title:'Another WIP'}),fetcher:async()=>Response.json({url:'https://other.test/?token='+id,expiresAt:Date.now()+600000})});
 await assert.rejects(foreign.prepare(file),/invalid/);
});

test('a missing WIP is rejected before a session lookup or PNG upload', async () => {
 let touched=false;
 const api=createSnippetDownloadApi({auth:{getSession(){touched=true;}}},{origin,getBook:()=>null,fetcher:async()=>{touched=true;}});
 await assert.rejects(api.prepare(new Blob([png])),/Open a WIP/);
 assert.equal(touched,false);
});

// Exercise the deployed authorization path, including its ownership filter.
import { onRequest } from '../../../functions/api/snippet-download.js';
test('the deployed endpoint accepts any owned WIP and rejects unowned WIPs', async () => {
 const originalFetch = globalThis.fetch, originalCaches = globalThis.caches;
 const f = fixture();
 globalThis.caches = {default: f.dependencies.cache};
 try {
  for (const owned of [true, false]) {
   let lookups = 0;
   globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({id:'owner-123'});
    const query = new URL(url).searchParams;
    assert.equal(query.get('id'), 'eq.other-book');
    assert.equal(query.get('user_id'), 'eq.owner-123');
    assert.equal(query.has('title'), false);
    lookups++;
    return Response.json(owned ? [{id:'other-book'}] : []);
   };
   const response = await onRequest({request:upload(png, {Authorization:'Bearer test-session', 'X-Book-ID':'other-book'}), env:{}});
   assert.equal(lookups, 1);
   assert.equal(response.status, owned ? 201 : 401);
  }
 } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
});
