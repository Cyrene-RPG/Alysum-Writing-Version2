import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const setup=`
import {mountWriterChrome} from '/applications/editor/page-ui/page/chrome.js';
import {mountTypewriter} from '/applications/editor/page-ui/page/typewriter.js';
const $=id=>document.getElementById(id);
$('loadingPanel').classList.add('hidden');$('writerShell').classList.remove('hidden');
$('bookTitle').value='Sample manuscript';$('chapterTitle').value='Chapter 4';
$('pageEditor').contentEditable='true';$('pageEditor').textContent='Keep this manuscript and its editing state unchanged.';
window.originalEditor=$('pageEditor');window.originalActions=$('editorActions');window.actionCalls=[];
for(const id of ['open-story-bible','compare-drafts','share-snippet'])$(id).addEventListener('click',()=>window.actionCalls.push(id));
const ids=['treeToggle','settingsCollapse','railToggle','tabChapters','tabBook','chaptersPane','bookPane','bookTree','settingsPane','settingsTopbar','writerTabs','bookFootSettings','tabSettings','settingsBackTop','mobileTreeOpen','mobileRailOpen'];
const args=Object.fromEntries(ids.map(id=>[id,$(id)]));
mountWriterChrome({...args,shell:$('writerShell'),tree:$('chapterTree'),backdrop:$('writerShellBackdrop')});
mountTypewriter({pageEl:$('pageEditor'),editor:{focus:()=>$('pageEditor').focus()},typewriterExit:$('typewriterExit'),focusMode:$('focusMode')});
window.toolsReady=true;`;
const server=createServer(async(req,res)=>{
 try {
  let path=new URL(req.url,'http://localhost').pathname;
  if(path==='/fixture')path='/applications/editor/pages/editor.html';
  else if(path==='/manifest.webmanifest')path='/applications/main-site/public/manifest.webmanifest';
  else if(path.startsWith('/css/editor/'))path=path.replace('/css/editor/','/applications/editor/editor-css/');
  else if(path.startsWith('/css/library/'))path=path.replace('/css/library/','/applications/library/library-css/');
  else if(path.startsWith('/css/'))path=path.replace('/css/','/applications/main-site/pages-css/');
  const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error('Invalid file');
  let bytes=await readFile(file);
  if(path==='/applications/editor/pages/editor.html')bytes=Buffer.from(bytes.toString().replace(/<script src="\/js\/pwa-register[^>]*><\/script>/,'').replace(/<script src="https:\/\/cdn.jsdelivr.net[^>]*><\/script>/,'').replace(/<script type="module" src="\/js\/editor\/page.js[^>]*><\/script>/,'<script type="module">'+setup+'</script>'));
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.webmanifest':'application/manifest+json'}[extname(file)]||'application/octet-stream'));res.end(bytes);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const name=process.env.EDITOR_TOOLS_BROWSER||'chromium',browser=await pw[name].launch();
const out='test-results/editor-mobile-tools';await mkdir(out,{recursive:true});
try {
 for(const width of [320,390,720,721,1280]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:width<=720,hasTouch:width<=720}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/fixture');await page.waitForFunction(()=>window.toolsReady);
  const inDrawer=()=>page.locator('#editorActions').evaluate(node=>node.parentElement.id);
  assert.equal(await inDrawer(),width<=720?'writerMobileActions':'editorActionRow');
  assert.ok(await page.evaluate(()=>document.getElementById('editorActions')===window.originalActions));
  const actionIds=['open-story-bible','compare-drafts','share-snippet'];
  for(const id of actionIds)assert.equal(await page.locator('#'+id).count(),1);
  if(width<=720){
   assert.equal(await page.locator('#writerWritePane > .snippet-editor-action').count(),0,'no action row above formatting on phones');
   assert.equal(await page.locator('#writerMobileActions').evaluate(n=>n.inert),true,'closed drawer actions are inert');
   const title=await page.locator('#writerMobileTitlebar').boundingBox(),focus=await page.locator('#focusMode').boundingBox(),toolbar=await page.locator('#writerToolbar').boundingBox();
   assert.ok(focus.y>=title.y+title.height && focus.y+focus.height<=toolbar.y,'Focus mode is between title and formatting');
   await page.screenshot({path:out+'/'+name+'-'+width+'-editor.png',fullPage:true});
   for(const id of actionIds){
    await page.locator('#mobileRailOpen').tap();
    await page.waitForFunction(()=>document.getElementById('mobileRailOpen').getAttribute('aria-expanded')==='true');
    assert.equal(await page.locator('#writerRail .writer-rail-title').textContent(),'Editor tools');
    assert.ok(await page.locator('#'+id).evaluate(n=>{const b=n.getBoundingClientRect();return b.width>=44&&b.height>=44;}));
    if(id===actionIds[0])await page.locator('#writerRail').screenshot({path:out+'/'+name+'-'+width+'-menu.png'});
    await page.locator('#'+id).tap();
    assert.equal(await page.locator('#mobileRailOpen').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#writerShellBackdrop').evaluate(n=>n.hidden),true);
   }
   assert.deepEqual(await page.evaluate(()=>window.actionCalls),actionIds,'existing button listeners still fire once');
   await page.locator('#mobileRailOpen').tap();await page.keyboard.press('Escape');
   assert.equal(await page.locator('#mobileRailOpen').getAttribute('aria-expanded'),'false');
   await page.locator('#focusMode').tap();
   assert.equal(await page.locator('html').evaluate(n=>n.classList.contains('is-typewriter')),true,'Focus mode enters the existing distraction-free view');
   await page.waitForFunction(()=>document.getElementById('editorActions').parentElement.id==='editorActionRow');
   assert.equal(await page.locator('#share-snippet').isVisible(),true,'Typewriter retains its existing controls');
   await page.locator('#typewriterExit').tap();
   await page.waitForFunction(()=>document.getElementById('editorActions').parentElement.id==='writerMobileActions');
   await page.locator('#mobileRailOpen').tap();await page.setViewportSize({width:1280,height:844});
   await page.waitForFunction(()=>document.getElementById('editorActions').parentElement.id==='editorActionRow');
   assert.equal(await page.locator('#writerShell').evaluate(n=>n.classList.contains('is-rail-drawer-open')),false,'resize clears stale drawer state');
   assert.equal(await page.locator('#writerRail .writer-rail-title').textContent(),'Listing look');
   await page.setViewportSize({width,height:844});await page.waitForFunction(()=>document.getElementById('editorActions').parentElement.id==='writerMobileActions');
  }else{
   assert.equal(await page.locator('#open-story-bible').isVisible(),true,'desktop keeps the original action row');
   assert.equal(await page.locator('#writerMobileActions').isVisible(),false);
   await page.screenshot({path:out+'/'+name+'-'+width+'-desktop.png',fullPage:true});
  }
  assert.equal(await page.locator('#focusMode').textContent(),'Focus mode');
  assert.equal(await page.locator('#focusMode').isVisible(),true);
  await page.locator('#focusMode').click();
  assert.equal(await page.locator('#typewriterExit').isVisible(),true);
  await page.locator('#typewriterExit').click();
  assert.equal(await page.locator('#typewriterExit').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.getElementById('pageEditor')===window.originalEditor));
  assert.equal(await page.locator('#pageEditor').textContent(),'Keep this manuscript and its editing state unchanged.');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(name+': editor tools move at phone widths, preserve desktop/Typewriter behavior and button listeners, close on selection/Escape and survive resize without replacing manuscript DOM.');
}finally{await browser.close();server.close();}
