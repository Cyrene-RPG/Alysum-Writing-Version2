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
 const api=createSnippetDownloadApi(client,{origin,getBook:()=>({id:'archangel-book',title:'Archangel'}),fetcher:async(url,init)=>{
  assert.equal(url.href,origin+'/api/snippet-download');assert.equal(init.headers.Authorization,'Bearer test-session');assert.equal(init.body,file);assert.equal(init.headers['X-Book-ID'],'archangel-book');
  return Response.json({url:'/api/snippet-download?token='+id,expiresAt:Date.now()+600000});
 }});assert.equal((await api.prepare(file)).url,origin+'/api/snippet-download?token='+id);
 const foreign=createSnippetDownloadApi(client,{origin,getBook:()=>({id:'archangel-book',title:'Archangel'}),fetcher:async()=>Response.json({url:'https://other.test/?token='+id,expiresAt:Date.now()+600000})});
 await assert.rejects(foreign.prepare(file),/invalid/);
});

test('other WIPs are rejected before a session lookup or PNG upload', async () => {
 let touched=false;
 const api=createSnippetDownloadApi({auth:{getSession(){touched=true;}}},{origin,getBook:()=>({id:'other-book',title:'Another WIP'}),fetcher:async()=>{touched=true;}});
 await assert.rejects(api.prepare(new Blob([png])),/only with Archangel/);
 assert.equal(touched,false);
});
