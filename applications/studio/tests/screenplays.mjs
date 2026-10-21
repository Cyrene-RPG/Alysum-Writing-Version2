import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const playwright=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),browserName=process.env.EDITOR_BROWSER||'chromium';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const fixture='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/applications/studio/studio-css/screenplay.css"></head><body style="background:#151515;color:#eee;margin:16px"><main id="mount" class="script-workbench"></main><script type="module">import {createScreenplaysApi} from "/core/screenplays/client.js";import {block} from "/core/screenplays/model.js";import {mountScreenplayEditor} from "/applications/studio/page-ui/screenplay-editor.js";window.api=createScreenplaysApi(null,"browser-test");const id="test";let row=api.read(id);if(!row){api.backup(id,{title:"Test screenplay",titlePage:false,blocks:[block("scene","")]},0);row=api.read(id);}window.screenplay=await mountScreenplayEditor({mount:document.querySelector("#mount"),record:row,api,preview:true});window.ready=true;</script></body></html>';
let rewrites=[];try{rewrites=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8')).rewrites;}catch{}
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}let pathname=url.pathname;for(const rule of rewrites){const pattern=rule.source.replace(/:path\*/g,'(.*)').replace(/:splat/g,'(.*)');const match=pathname.match(new RegExp('^'+pattern+'$'));if(match){pathname=rule.destination.replace(/:path\*/g,match[1]||'').replace(/:splat/g,match[1]||'');break;}}const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw Error('Outside fixture');res.setHeader('Content-Type',({'.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.woff2':'font/woff2'}[extname(path)]||'text/javascript'));res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await playwright[browserName].launch({headless:true});await mkdir('test-results/screenplays',{recursive:true});
try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/fixture');await page.waitForFunction(()=>window.ready);
    const editor=page.locator('[data-manuscript]');await editor.click();
    await page.keyboard.type('INT. OBSERVATORY - NIGHT');await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-manuscript] p').nth(1).getAttribute('data-type'),'action');
    await page.keyboard.type('The telescope turns.');await page.keyboard.press('Enter');await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-manuscript] p').nth(2).getAttribute('data-type'),'character');
    await page.keyboard.type('MARA');await page.keyboard.press('Enter');await page.keyboard.type('Look closer.');
    assert.equal(await page.locator('[data-manuscript] p').nth(3).getAttribute('data-type'),'dialogue');
    await page.keyboard.press('Control+a');await page.keyboard.press('Control+i');
    assert.ok(await editor.locator('i,em').count()>0,'Formatting shortcuts work');
    await page.keyboard.press('Control+z');assert.equal(await editor.locator('i,em').count(),0,'Custom history undoes formatting');
    await page.evaluate(async()=>{await screenplay.flush();});await page.reload();await page.waitForFunction(()=>window.ready);
    assert.match(await editor.textContent(),/Look closer/,'Device draft survives reload');
    await page.evaluate(async()=>{const {block}=await import('/core/screenplays/model.js');screenplay.setDocument({title:'Export test',author:'Writer',titlePage:true,blocks:[block('scene','INT. ROOM - DAY'),block('character','MARA'),block('dialogue','A speech. '.repeat(500)),block('character','ELI'),block('dialogue','A reply.')]});});
    await page.locator('[data-view]').click();assert.equal(await editor.isVisible(),false);assert.ok(await page.locator('[data-paper] .script-sheet').count()>2);assert.match(await page.locator('[data-paper]').textContent(),/\(MORE\)/);
    const bounds=await page.locator('[data-paper] .script-paper-line').evaluateAll(lines=>lines.every(line=>{const p=line.parentElement.getBoundingClientRect(),r=line.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom+1&&r.right<=p.right+1;}));assert.equal(bounds,true,'No page text escapes physical sheets');
    await page.screenshot({path:'test-results/screenplays/'+browserName+'-pages.png',fullPage:false});
    await page.evaluate(()=>{window.print=()=>{};});await page.locator('[data-print]').click();
    assert.ok(await page.locator('#scriptPrint .script-sheet').count()>2,'Print uses same paginated layout');
    if(browserName==='chromium'){await page.pdf({path:'test-results/screenplays/screenplay.pdf',preferCSSPageSize:true,printBackground:true});}
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    await page.locator('[data-view]').click();
    await page.locator('[data-files]').click();const dl=page.waitForEvent('download');await page.locator('[data-export=fdx]').click();const file=await dl;const path=await file.path();const xml=await readFile(path,'utf8');assert.match(xml,/<FinalDraft/);
    const roundtrip=await page.evaluate(async xml=>{const {parseFdx}=await import('/applications/studio/page-ui/screenplay-io.js');return parseFdx(xml).document;},xml);assert.equal(roundtrip.blocks.length,5);assert.equal(roundtrip.author,'Writer');
    await page.locator('[data-dialog] header button').click();
    for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.screenshot({path:'test-results/screenplays/'+browserName+'-'+width+'.png',fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No mobile page overflow');}
    // Test native Studio/format chooser with its preview-only data substitutions.
    await page.setViewportSize({width:1440,height:1000});
    await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();return route.continue();});
    await page.goto(base+'/screenplay-preview');await page.locator('#newBookCard').waitFor();await page.locator('#newBookCard').click();
    assert.equal(await page.locator('[data-format=written]').count(),1);assert.equal(await page.locator('[data-format=audio]').count(),1);await page.locator('[data-format=script]').click();
    await page.locator('[data-manuscript]').waitFor();assert.equal(await page.locator('#studioShell').isVisible(),false);
    await page.screenshot({path:'test-results/screenplays/'+browserName+'-native-studio.png',fullPage:false});
    assert.deepEqual(errors,[],'No browser exceptions');
    console.log('PASS '+browserName+' screenplay: native Studio choice, keyboard flow, formatting, undo, recovery, pagination, print, FDX exchange and mobile');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
