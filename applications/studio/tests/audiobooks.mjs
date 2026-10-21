import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=resolve(new URL('../../../',import.meta.url).pathname);
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--text:#eee;--muted:#aaa;--accent:#8047c8;--border:#444;--alysum-ui-panel:#191919;--alysum-ui-chrome:#111;--alysum-ui-raised:#292929}
body{margin:0;background:#111;color:#eee;font-family:Arial,sans-serif}button{font:inherit}
</style><link rel="stylesheet" href="/applications/studio/studio-css/audiobooks.css"></head><body>
<button id="new">New book</button><button id="upload">Upload book</button><main id="editor"></main>
<script type="module">
import {mountBookFormatChoice} from '/applications/studio/page-ui/book-format-choice.js';
import {mountAudiobookEditor} from '/applications/studio/page-ui/audiobook-editor.js';
const owner='10000000-0000-0000-0000-000000000001',id='20000000-0000-0000-0000-000000000001';
window.calls={written:0,imports:0,created:[],saved:[],uploads:0,removed:0};window.navigation='';
let book={id,title:'My audiobook',owner_id:owner,linked_book_id:null,description:'',narrator:'',credits:'',rights_confirmed:false},tracks=[];
const writtenBooks=[{id:'written',user_id:owner,title:'My written book'},{id:'foreign',user_id:'other',title:'Shared foreign book'}];
const api={get:async()=>structuredClone(book),tracks:async()=>structuredClone(tracks),save:async(_,details)=>{window.calls.saved.push(details);book={...book,...details};return structuredClone(book);},
 upload:async(_,file,details)=>{window.calls.uploads++;if(window.failUpload){window.failUpload=false;throw Error('Upload interrupted. Try again.');}const track={id:'track',title:details.title,duration_seconds:details.duration,size_bytes:file.size};tracks.push(track);return structuredClone(track);},
 preview:async()=>URL.createObjectURL(new Blob([window.wavBytes],{type:'audio/wav'})),removeTrack:async()=>{window.calls.removed++;tracks=[];return {cleanupFailed:false};}};
const choice=mountBookFormatChoice({session:{mode:new URLSearchParams(location.search).get('local')?'local':'cloud',user:{id:owner}},getBooks:()=>writtenBooks,
 createWritten:async()=>{window.calls.written++;return {id:'written-new'};},importWritten:()=>window.calls.imports++,
 createAudio:async(details)=>{window.calls.created.push(details);return {id};},navigate:url=>window.navigation=url});
document.querySelector('#new').onclick=event=>choice.open('new',event.currentTarget);
document.querySelector('#upload').onclick=event=>choice.open('upload',event.currentTarget);
if(new URLSearchParams(location.search).has('editor'))await mountAudiobookEditor({mount:document.querySelector('#editor'),id,api,writtenBooks:writtenBooks.filter(row=>row.user_id===owner)});
window.ready=true;
</script></body></html>`;
function wav(){
 const bytes=Buffer.alloc(44+16000),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 bytes.write('RIFF');view.setUint32(4,bytes.length-8,true);bytes.write('WAVE',8);bytes.write('fmt ',12);
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);
 view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);bytes.write('data',36);view.setUint32(40,16000,true);return bytes;
}
const server=createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
 let path=url.pathname==='/audiobook-preview'?'/applications/studio/pages/audiobook-preview.html':url.pathname;
 path=path.replace('/css/studio/','/applications/studio/studio-css/').replace('/js/studio/','/applications/studio/page-ui/');path=resolve(root,'.'+path);
 if(!path.startsWith(root+'/'))throw Error('Outside fixture');const content=await readFile(path);res.setHeader('Content-Type',extname(path)==='.css'?'text/css':extname(path)==='.html'?'text/html':'text/javascript');res.end(content);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/fixture`,browser=await chromium.launch({headless:true});
try{
 await mkdir('test-results/audiobooks',{recursive:true});
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>window.ready);
  await page.click('#new');await page.getByRole('button',{name:'Written book'}).click();
  assert.equal(await page.evaluate(()=>window.calls.written),1);assert.match(await page.evaluate(()=>window.navigation),/editor\?book=written-new/);
  await page.click('#upload');await page.getByRole('button',{name:'Written book'}).click();assert.equal(await page.evaluate(()=>window.calls.imports),1);
  await page.click('#new');await page.getByRole('button',{name:'Audiobook',exact:false}).click();
  await page.getByLabel('Title',{exact:true}).fill('Narrated edition');
  assert.equal(await page.locator('select option[value=foreign]').count(),0,'Only own written books can be linked');
  await page.getByLabel('Audio edition of').selectOption('written');await page.getByRole('button',{name:'Create audiobook',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.calls.created[0].linked_book_id),'written');assert.match(await page.evaluate(()=>window.navigation),/audiobook-studio/);
  await page.click('#upload');await page.getByRole('button',{name:'Audiobook',exact:false}).click();
  await page.getByLabel('Title',{exact:true}).fill('Standalone audio');await page.getByRole('button',{name:'Continue to recordings'}).click();
  assert.equal(await page.evaluate(()=>window.calls.created[1].linked_book_id),'');assert.match(await page.evaluate(()=>window.navigation),/upload=1/);
  await page.goto(base+'?editor=1');await page.waitForFunction(()=>window.ready);
  await page.getByLabel('Narrator',{exact:true}).fill('Commissioned narrator');
  await page.getByLabel('Recording credits').fill('Recorded at Example Studio');
  await page.getByLabel('I have permission',{exact:false}).check();await page.getByRole('button',{name:'Save details'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-details-status]').textContent==='Details saved.');
  assert.equal(await page.evaluate(()=>window.calls.saved[0].narrator),'Commissioned narrator');
  await page.locator('input[type=file]').setInputFiles({name:'chapter.wav',mimeType:'audio/wav',buffer:wav()});
  await page.getByLabel('Recording title').fill('Chapter one');await page.evaluate(()=>window.failUpload=true);
  await page.getByRole('button',{name:'Upload recording',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-upload-status]').textContent.includes('interrupted'));
  assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),1,'Failure retains the selected file');
  await page.getByRole('button',{name:'Upload recording',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-upload-status]').textContent.includes('remains private'));
  assert.equal(await page.locator('.audio-track').count(),1);assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),0);
  await page.evaluate(bytes=>window.wavBytes=new Uint8Array(bytes),[...wav()]);
  await page.getByRole('button',{name:'Preview recording'}).click();assert.equal(await page.locator('.audio-track audio').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'No horizontal overflow');
  await page.screenshot({path:`test-results/audiobooks/studio-${width}.png`,fullPage:true});
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remove',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-track-status]').textContent==='Recording removed.');assert.equal(await page.locator('.audio-track').count(),0);
  await page.goto(base+'?local=1');await page.waitForFunction(()=>window.ready);await page.click('#new');await page.getByRole('button',{name:'Audiobook',exact:false}).click();
  assert.match(await page.locator('[data-error]').textContent(),/Sign in online/);assert.equal(await page.evaluate(()=>window.calls.created.length),0);
  assert.deepEqual(errors,[]);console.log(`PASS audiobook create, upload retry, credits, preview, removal at ${width}px`);await page.close();
 }
 for(const width of [1440,320]){
  const page=await browser.newPage({viewport:{width,height:950}}),external=[],errors=[];
  page.on('request',request=>{if(/supabase|\/core\/authentication\//i.test(request.url())||!['GET','HEAD'].includes(request.method()))external.push(request.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base.replace('/fixture','/audiobook-preview'));
  await page.click('#preview-new');await page.locator('dialog [data-format=audio]').click();
  await page.getByLabel('Title',{exact:true}).fill('Demo recording project');await page.getByRole('button',{name:'Create audiobook',exact:true}).click();
  await page.locator('#preview-editor h1').waitFor();assert.equal(await page.locator('#preview-editor h1').textContent(),'Demo recording project');
  await page.getByLabel('I have permission',{exact:false}).check();await page.getByRole('button',{name:'Save details',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-details-status]').textContent==='Details saved.');
  await page.locator('input[type=file]').setInputFiles({name:'demo.wav',mimeType:'audio/wav',buffer:wav()});
  await page.getByRole('button',{name:'Upload recording',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-upload-status]').textContent.includes('remains private'));
  await page.getByRole('button',{name:'Preview recording'}).click();
  assert.match(await page.locator('.audio-track audio').getAttribute('src'),/^blob:/,'Demo plays a local file');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`test-results/audiobooks/demo-${width}.png`,fullPage:true});
  assert.deepEqual(external,[],'Demo never uses auth, backend requests, or network uploads');assert.deepEqual(errors,[]);
  await page.reload();await page.click('#preview-sample');await page.locator('#preview-editor h1').waitFor();
  assert.equal(await page.locator('.audio-track').count(),0,'Demo data resets after reload');
  console.log(`PASS no-login demo with local audio at ${width}px`);await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
