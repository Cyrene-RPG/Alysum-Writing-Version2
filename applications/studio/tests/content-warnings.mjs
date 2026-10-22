import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const playwright=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),browserName=process.env.WARNING_BROWSER||'chromium';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const rules=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8')).rewrites;
const server=createServer(async(req,res)=>{try{
    let pathname=new URL(req.url,'http://localhost').pathname;
    for(const rule of rules){const match=pathname.match(new RegExp('^'+rule.source.replace(/:path\*/g,'(.*)').replace(/:splat/g,'(.*)')+'$'));if(match){pathname=rule.destination.replace(/:path\*/g,match[1]||'').replace(/:splat/g,match[1]||'');break;}}
    const file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/'))throw Error('Outside fixture');
    res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2'}[extname(file)]||'text/javascript'));res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await playwright[browserName].launch({headless:true});await mkdir('test-results/content-warnings',{recursive:true});
try{
    const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[],dataRequests=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{const url=new URL(route.request().url());if(/supabase|auth\/v1|rest\/v1/.test(url.href))dataRequests.push(url.href);return url.origin===base?route.continue():route.abort();});
    await page.goto(base+'/content-warning-preview');await page.waitForFunction(()=>window.warningPreview);
    assert.equal(await page.locator('[data-core-warning]').count(),4);
    assert.equal(await page.locator('[data-core-none]').isChecked(),false,'Legacy broad warnings do not imply no core warnings');
    assert.match(await page.evaluate(()=>warningPreview.validate()),/core/);
    await page.locator('#postBtn').click();assert.match(await page.locator('#postError').textContent(),/core/);
    await page.locator('#saveDraftBtn').click();assert.match(await page.locator('#pubStatus').textContent(),/saved on this device/);
    await page.locator('[data-core-none]').check();
    const graphic=page.locator('[data-core-warning="graphic-violence"]');await graphic.check();
    assert.equal(await page.locator('[data-core-none]').isChecked(),false);
    assert.equal(await graphic.evaluate(el=>el===document.activeElement),true,'Core changes preserve keyboard focus');
    await page.locator('[data-core-none]').check();assert.equal(await graphic.isChecked(),false);
    const search=page.locator('#warningSearch');
    await search.fill('CNC');await page.locator('[data-add-warning="consensual-non-consent-roleplay"]').click();
    assert.equal(await page.locator('[data-core-none]').isChecked(),true,'Consensual adult roleplay does not mark assault');
    await search.fill('noncon');await page.locator('[data-add-warning="sexual-assault-non-consensual-sex"]').click();assert.equal(await page.locator('[data-core-none]').isChecked(),false);
    await page.locator('[data-core-none]').check();
    await search.fill('birth control');await page.locator('[data-add-warning="contraceptive-sabotage"]').click();
    const attack='<img src=x onerror=window.warningXss=true>';
    await search.fill(attack);await page.locator('[data-warning-custom]').click();assert.equal(await page.locator('#warningPicker img').count(),0);assert.equal(await page.evaluate(()=>window.warningXss),undefined);
    await search.fill('pet loss');await page.locator('[data-add-warning="pet-death"]').click();
    const pet=page.locator('[data-warning-entry="pet-death"]');await pet.locator('[data-warning-details]').click();
    await pet.locator('[data-warning-field="depiction"]').selectOption('mentioned');await pet.locator('[data-warning-field="timing"]').selectOption('past');
    await pet.locator('[data-warning-field="detail"]').selectOption('brief');await pet.locator('[data-warning-field="frequency"]').selectOption('isolated');
    await pet.locator('[data-warning-field="scope"]').selectOption('chapters');await pet.locator('[data-warning-chapter="sample-two"]').check();
    await page.locator('#warningNote').fill('Only mentioned after the event.');
    const state=await page.evaluate(()=>warningPreview.read());
    assert.equal(state.entries.find(item=>item.id==='pet-death').chapterIds[0],'sample-two');assert.equal(await page.evaluate(()=>warningPreview.validate()),'');
    assert.ok(state.entries.some(item=>item.id==='death')&&state.entries.some(item=>item.id==='self-harm'),'Old selections are preserved');
    await page.locator('.warning-reader-preview>summary').click();
    assert.match(await page.locator('[data-warning-preview]').textContent(),/Chapter 2/);assert.match(await page.locator('[data-warning-preview]').textContent(),/mentioned/);
    const perChapter=await page.evaluate(async()=>{
        const {renderContentWarnings}=await import('/site-appearance/components/content-warnings.js');
        const mount=document.createElement('div');document.body.append(mount);
        renderContentWarnings(mount,warningPreview.read(),{chapterId:'sample-one',chapters:warningPreview.chapters});const one=mount.textContent;
        renderContentWarnings(mount,warningPreview.read(),{chapterId:'sample-two',chapters:warningPreview.chapters});const two=mount.textContent;mount.remove();return {one,two};
    });assert.ok(!perChapter.one.includes('Pet death')&&perChapter.two.includes('Pet death'),'Chapter reader shows only matching scoped warnings');
    await page.locator('#saveDraftBtn').click();await page.reload();await page.waitForFunction(()=>window.warningPreview);
    assert.deepEqual(await page.evaluate(()=>warningPreview.read()),state,'All details survive saving and reopening');
    await page.locator('#postBtn').click();assert.match(await page.locator('#pubStatus').textContent(),/Nothing was published/);
    await page.locator('#warningCategory').selectOption('Consensual BDSM and power exchange — adults');
    assert.ok(await page.locator('#warningResults button').count()>20);await page.locator('[data-warning-more]').click();assert.ok(await page.locator('#warningResults button').count()>30);
    await page.locator('#warningPicker').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/content-warnings/'+browserName+'-desktop.png',fullPage:false});
    for(const width of [390,320]){
        await page.setViewportSize({width,height:900});await page.locator('#warningPicker').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Publishing layout fits '+width+'px');
        await page.screenshot({path:'test-results/content-warnings/'+browserName+'-'+width+'.png',fullPage:false});
    }
    assert.deepEqual(errors,[]);assert.deepEqual(dataRequests,[],'Preview never uses live accounts or tables');
    console.log('PASS '+browserName+' warning picker: core decisions, aliases, adult descriptors, legacy selections, chapter scope, persistence, preview safety and mobile');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
