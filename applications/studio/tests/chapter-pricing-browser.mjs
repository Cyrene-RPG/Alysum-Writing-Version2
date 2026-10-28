import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const fixture=`
import {bindPricingGuide} from '/applications/studio/page-ui/pricing-guide.js';
import {bindChapterAccess} from '/applications/studio/page-ui/publish-access.js';
const chapters=[{id:'one',title:'Chapter 1 — A new beginning',content:'word '.repeat(1000)},{id:'two',title:'Chapter 2 — The long road home',content:'word '.repeat(3000)},{id:'three',title:'Chapter 3 — The discovery',content:'word '.repeat(6000)}];
const $=id=>document.getElementById(id);
$('workTitle').value='The Lantern Keeper';$('workSummary').value='A sample manuscript for testing the publishing controls.';
$('chapterList').innerHTML=chapters.map(ch=>'<label class="pub-chapter"><input type="checkbox" data-chapter-id="'+ch.id+'" checked>'+ch.title+'</label>').join('');
$('chapterSelect').innerHTML=chapters.map(ch=>'<option>'+ch.title+'</option>').join('');
$('previewBody').innerHTML='<p>The lantern glowed in the quiet window. A new chapter was about to begin.</p>';
$('previewLabel').textContent=chapters[0].title;$('previewWords').textContent='1,000 words';
bindPricingGuide(chapters,async()=>chapters);
const access=await bindChapterAccess({supabase:{},book:{id:'test-book',publish_meta:{chapterAccessPending:true,lockedChapterIds:['one','two','three'],chapterAccess:{pricingMode:'individual',connectionId:'shop',currency:'USD',chapterProducts:chapters.map((ch,i)=>({chapterId:ch.id,productUrl:'https://ko-fi.com/s/chapter'+(i+1),minimum:['0.75','1.25','2.00'][i]}))}}},chapters});
window.pricingTest={access,ready:true};`;
const responses=[];
const server=createServer(async(req,res)=>{
    try {
        const pathname=new URL(req.url,'http://localhost').pathname;
        let path=pathname;
        if(path.startsWith('/css/studio/'))path=path.replace('/css/studio/','/applications/studio/studio-css/');
        if(path.startsWith('/css/editor/'))path=path.replace('/css/editor/','/applications/editor/editor-css/');
        if(path==='/pricing-calculator/')path='/pricing-calculator/index.html';
        if(path==='/mobile-publishing-test')path='/applications/studio/pages/publish.html';
        const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error('Invalid file');
        let bytes=await readFile(file);
        if(pathname==='/mobile-publishing-test')bytes=Buffer.from(bytes.toString().replace(/<script type="module" src="\/js\/studio\/publish.js[^>]*><\/script>/,'<script type="module">'+fixture+'</script>'));
        if(path==='/applications/studio/page-ui/publish-access.js')bytes=Buffer.from(bytes.toString().replace("import { authorAccessRequest } from '/core/publishing/author-access-client.js';",`const authorAccessRequest=async(s,action)=>action==='status'?{ready:true,individualPricing:true}:action==='connections'?{connections:[{id:'shop',provider:'kofi',enabled:true}]}:{config:null};`));
        res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'}[extname(file)]||'application/octet-stream'));res.end(bytes);
    }catch(error){responses.push(req.url);res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const name=process.env.PRICING_BROWSER||'chromium';const browser=await pw[name].launch();
const out='test-results/chapter-pricing';await mkdir(out,{recursive:true});
try {
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(base+'/mobile-publishing-test');
    await page.waitForFunction(()=>window.pricingTest?.ready);
    assert.equal(await page.locator('#manuscriptPreview').getAttribute('open'),null);
    assert.equal(await page.locator('#pricingChapterTotal').textContent(),'$4.00');
    assert.equal(await page.locator('#pricingBookSuggestion').textContent(),'$2.99');
    for(const width of [320,360,390,430,768]){
        await page.setViewportSize({width,height:844});
        await page.locator('#pricingGuide').scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'publishing page fits '+width);
        assert.ok(await page.locator('#pricingGuide input, #pricingRecalculate, #chapterAccessCard input:not([type=checkbox]), #chapterAccessCard select').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).every(n=>{const b=n.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.left>=0&&b.right<=innerWidth;})),'price controls fit and have touch target height at '+width);
        await page.locator('#pricingGuide').screenshot({path:out+'/'+name+'-'+width+'-calculator.png'});
        await page.locator('#chapterAccessCard').screenshot({path:out+'/'+name+'-'+width+'-chapter-prices.png'});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#manuscriptPreview summary').tap();await page.locator('#previewBody').waitFor({state:'visible'});
    await page.locator('#manuscriptPreview').screenshot({path:out+'/'+name+'-390-preview.png'});
    await page.locator('#manuscriptPreview summary').tap();assert.equal(await page.locator('#previewBody').isVisible(),false);
    await page.locator('#pricingSales').fill('10');assert.equal(await page.locator('#pricingEarnings').textContent(),'$29.90');
    const prices=page.locator('.chapter-product-fields input[type=number]');await prices.first().fill('1.50');
    assert.equal(await page.locator('#pricingChapterTotal').textContent(),'$4.75');
    await page.locator('#chapterPricingMode').selectOption('bundle');await page.locator('#chapterProduct').waitFor({state:'visible'});
    assert.equal(await prices.first().isVisible(),false);
    await page.locator('#chapterPricingMode').selectOption('individual');assert.equal(await prices.first().inputValue(),'1.50');
    await page.locator('#pricingGuide details summary').tap();
    await page.locator('[data-estimate-id=one]').fill('2.50');assert.equal(await page.locator('#pricingChapterTotal').textContent(),'$5.75');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'expanded chapter table stays within mobile page');
    await page.locator('#pricingGuide').screenshot({path:out+'/'+name+'-390-calculator-expanded.png'});
    await page.locator('#pricingRecalculate').tap();await page.waitForFunction(()=>document.getElementById('pricingUpdateStatus').textContent.includes('No new saved'));
    await page.goto(base+'/pricing-calculator/');await page.locator('#book').waitFor();
    for(const width of [320,390,768]){
        await page.setViewportSize({width,height:844});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'standalone fits '+width);
        await page.screenshot({path:out+'/'+name+'-'+width+'-standalone.png',fullPage:true});
    }
    await page.locator('#customBook').fill('7.25');await page.locator('#words').fill('100000');
    assert.equal(await page.locator('#customBook').inputValue(),'7.25');assert.equal(await page.locator('#earnings').textContent(),'$725.00');
    assert.deepEqual(errors,[]);assert.deepEqual(responses.filter(path=>!path.startsWith('/favicon.ico')),[]);
    console.log(name+': mobile widths 320/360/390/430/768, touch interactions, preview, prices, live totals and standalone calculator passed.');
}finally{await browser.close();server.close();}
