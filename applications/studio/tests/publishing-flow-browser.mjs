import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(new URL('../../../', import.meta.url).pathname);
const rules = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8')).rewrites;
const book = {id:'test',user_id:'me',title:'Beneath Dying Stars',_cloudUpdated:1,sections:{front:[],back:[],body:[
    {id:'one',title:'Chapter 1',content:'word '.repeat(3000)},
    {id:'two',title:'Chapter 2',content:'word '.repeat(3000)},
]},publish_meta:{genres:['fantasy'],rating:'mature',tags:['Found family'],draftChapterIds:['one','two']}};
const stubs = {
    '/core/authentication/client.js': `export const supabase={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:JSON.parse(localStorage.getItem('fixture:listing')||'null')};},async upsert(row){localStorage.setItem('fixture:listing',JSON.stringify(row));return {error:null};},update(row){this.row=row;return this;},then(done){localStorage.setItem('fixture:listing',JSON.stringify(this.row));done({error:null});}};}};`,
    '/core/desktop/studio-session.js': `export async function requireStudioSession(){return {mode:'cloud',user:{id:'me'}};}`,
    '/core/synchronization-engine/books.js': `const initial=${JSON.stringify(book)};const get=()=>JSON.parse(localStorage.getItem('fixture:book')||JSON.stringify(initial));export function createBooksApi(){return {getBook:async()=>get(),readOnlineBook:async()=>get(),async updateBook(id,patch){const saved={...get(),...patch,_cloudUpdated:get()._cloudUpdated+1,_synced:true};localStorage.setItem('fixture:book',JSON.stringify(saved));return saved;}};}`,
    '/core/account/workspace-profile.js': `export const peekWorkspaceProfile=()=>({name:'Sample Writer'});`,
    '/core/publishing/author-access-client.js': `export async function authorAccessRequest(s,action){return action==='status'?{ready:true,individualPricing:true,mixedPricing:true}:action==='connections'?{connections:[{id:'shop',provider:'kofi',enabled:true}]}:action==='book'?{config:null}:{saved:true};}`,
};
const missing=[];
const server=createServer(async(req,res)=>{try{
    let path=new URL(req.url,'http://localhost').pathname;
    if(['/studio','/book'].includes(path)){res.setHeader('Content-Type','text/html');res.end('<p>Saved destination</p>');return;}
    for(const rule of rules){const match=path.match(new RegExp('^'+rule.source.replace(/:path\*/g,'(.*)')+'$'));if(match){path=rule.destination.replace(/:path\*/g,match[1]||'');break;}}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream'));
    if(stubs[path]){res.end(stubs[path]);return;}
    const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error('Invalid path');res.end(await readFile(file));
}catch{missing.push(req.url);res.statusCode=404;res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),name=process.env.PUBLISH_BROWSER||'chromium';
const browser=await pw[name].launch();const out='test-results/publishing-flow';await mkdir(out,{recursive:true});
try {
    for(const width of [320,390,1440]) {
        const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
        await page.goto(base+'/publish?book=test');
        await page.locator('[data-section-summary=accessSection]').filter({hasText:'2 chapters'}).waitFor();
        assert.equal(await page.locator('.pub-section[open]').count(),1);
        assert.equal(await page.locator('#fandomSearch').isVisible(),false);
        if(width===1440)assert.ok(await page.locator('#tagsSection').evaluate(node=>node.getBoundingClientRect().width>innerWidth*.93),'desktop uses full width');
        await page.locator('[name=workType][value=fanfiction]').check();
        const fandom=page.locator('#fandomSearch');await fandom.fill('Harry');
        await fandom.press('ArrowDown');await fandom.press('Enter');
        assert.equal(await page.getByRole('button',{name:'Remove Harry Potter',exact:true}).count(),1);
        await fandom.fill('Merlin');await page.locator('#fandomSearchResults [role=option]').filter({hasText:'Merlin'}).first().click();
        await page.locator('#characterSearch').fill('Hermione Granger');await page.locator('#characterSearch').press('Enter');
        await page.locator('#relationshipSearch').fill('Arthur/Merlin');await page.locator('#relationshipSearch').press('Enter');
        await page.locator('#themeSearch').fill('Slow');
        assert.equal(await page.locator('#themeSearch').inputValue(),'Slow','typing does not prematurely commit tags');
        await page.getByRole('option',{name:'Slow Burn',exact:true}).click();
        await page.locator('#themeSearch').fill('slow burn');await page.locator('#themeSearch').press('Enter');
        assert.equal(await page.getByRole('button',{name:'Remove Slow Burn',exact:true}).count(),1,'case variants cannot duplicate');
        await page.locator('#genreSearch').fill('Adventure');await page.getByRole('option',{name:'Adventure',exact:true}).click();
        await page.locator('[name=workType][value=original]').check();assert.equal(await fandom.isVisible(),false);
        await page.locator('[name=workType][value=fanfiction]').check();
        assert.equal(await page.getByRole('button',{name:'Remove Harry Potter',exact:true}).count(),1,'switch preserves fandoms');
        await page.getByRole('button',{name:'Remove Merlin (TV)',exact:true}).click();
        await page.locator('#warningSearch').fill('violence');
        assert.ok(await page.locator('#warningResults button').count()<=8,'warning matches stay compact');
        await page.locator('#warningSearch').fill('');
        await page.locator('.warning-picker-compact > details').first().locator('summary').click();
        await page.locator('[data-core-none]').check();
        await page.locator('.warning-picker-compact > details').first().locator('summary').click();
        await page.locator('#themeSearch').fill('slow');await page.locator('#themeSearch').press('ArrowDown');
        assert.equal(await page.locator('#themeSearch').getAttribute('aria-expanded'),'true');
        assert.ok(await page.locator('#themeSearchResults [role=option]').count()<=9);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page does not overflow '+width);
        assert.ok(await page.locator('.pub-tag-picker input').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().height>=44)),'touch-sized fields');
        await page.screenshot({path:`${out}/${name}-${width}-publishing.png`,fullPage:true});
        // Dismiss query before saving; pending custom input is tested below.
        await page.locator('#themeSearch').fill('');await page.locator('#themeSearch').press('Escape');
        await page.locator('#storySection > summary').click();await page.locator('#workSummary').fill('The original story summary stays intact.');
        await page.locator('#themeSearch').fill('Custom story tag');
        await page.locator('#saveDraftBtn').click();await page.waitForURL('**/studio');
        const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture:book')));
        assert.deepEqual(saved.publish_meta.fandoms,['Harry Potter']);assert.deepEqual(saved.publish_meta.characters,['Hermione Granger']);
        assert.deepEqual(saved.publish_meta.relationships,['Arthur/Merlin']);assert.equal(saved.publish_meta.workType,'fanfiction');
        assert.ok(saved.publish_meta.tags.includes('Custom story tag'));assert.equal(saved.publish_meta.synopsis,'The original story summary stays intact.');
        await page.goto(base+'/publish?book=test');await page.getByRole('button',{name:'Remove Harry Potter',exact:true}).waitFor();
        assert.equal(await page.locator('#workSummary').inputValue(),'The original story summary stays intact.');
        await page.locator('#accessSection > summary').click();assert.equal(await page.locator('#pricingChapterTotal').textContent(),'$1.98');
        await page.locator('#chapterPricingMode').selectOption('mixed');await page.locator('#chapterAddProduct').click();assert.equal(await page.locator('.chapter-mixed-product').count(),1);
        await page.locator('#accessSection > summary').click();
        await page.locator('#postBtn').click();await page.waitForURL('**/book?id=test');
        const listing=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture:listing')));
        assert.equal(listing.data.workType,'fanfiction');assert.deepEqual(listing.data.fandoms,['Harry Potter']);assert.equal(listing.data.chapters.length,2);
        await page.goto(base+'/publish?book=test');await page.locator('#postBtn').filter({hasText:'Update'}).waitFor();
        await page.getByRole('button',{name:'Remove Harry Potter',exact:true}).click();
        await page.locator('#tagsSection > summary').click();await page.locator('#postBtn').click();
        await page.locator('#postError').filter({hasText:'Add at least one fandom'}).waitFor();
        assert.equal(await page.locator('#tagsSection').getAttribute('open'),'','validation reveals hidden controls');
        assert.deepEqual(errors,[]);await page.close();
    }
    assert.deepEqual(missing.filter(path=>!path.startsWith('/favicon.ico')),[]);
    console.log(`${name}: 320/390/1440 layout, autocomplete, switching, saved/reopened metadata, publish/update and validation passed.`);
} finally { await browser.close();server.close(); }
