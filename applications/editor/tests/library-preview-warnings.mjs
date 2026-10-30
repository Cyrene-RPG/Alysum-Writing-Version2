import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script type="importmap">{"imports":{"@alysum/publishing/":"/core/publishing/","@alysum/writing-engine/":"/core/writing-engine/","@alysum/site-appearance/":"/site-appearance/"}}</script>
<link rel="stylesheet" href="/site-appearance/css-styles/theme.css"><link rel="stylesheet" href="/applications/library/library-css/book.css"><link rel="stylesheet" href="/applications/editor/editor-css/page/preview-book.css">
<style>body{margin:0;background:#0b1220;color:#fff;--text:#fff;--muted:#9ca3af;--border:#ffffff24;font-family:system-ui}.lib-preview{padding:16px}.book-warn{max-width:100%;overflow-wrap:anywhere}</style></head><body><div class="lib-preview" id="pane"></div><script type="module">
import {previewBookHtml,paintPreviewBook,bindPreviewBook} from '/applications/editor/page-ui/preview-book.js';
import {readPublishDraft} from '/core/publishing/publish-meta.js';
const pane=document.getElementById('pane');pane.innerHTML=previewBookHtml();
const book={id:'example',title:'Beneath Dying Stars',sections:{body:[]},publish_meta:{warnings:['Graphic Violence','Pet death'],rating:'mature',genres:['fantasy']}};
let writes=0;const paint=()=>paintPreviewBook(pane,{book,meta:readPublishDraft(book),listed:false});
bindPreviewBook(pane,{paint,saveMeta(){writes++;},metaFromBook:()=>({book,meta:readPublishDraft(book)}),openManage(){}});
window.previewFixture={paint(warnings,warningMeta){book.publish_meta={...book.publish_meta,warnings,warningMeta};paint();},writes:()=>writes};paint();
</script></body></html>`;
const server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/preview-test'){res.setHeader('Content-Type','text/html');res.end(html);return;}
    if(path==='/applications/editor/page-ui/cover.js'){
        res.setHeader('Content-Type','text/javascript');res.end('export async function resolvePreviewCoverSrc(){return "";} export function paintBookHero(){} export function wideCropFromMeta(){return null;}');return;
    }
    const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error('Invalid path');
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'));res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),name=process.env.WARNING_BROWSER||'chromium',browser=await pw[name].launch();
await mkdir('test-results/content-warnings',{recursive:true});
try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(base+'/preview-test');await page.waitForFunction(()=>window.previewFixture);
    const chips=page.locator('#libWarns .book-warn');
    assert.deepEqual(await chips.allTextContents(),['Graphic Violence','Pet death']);
    assert.equal(await page.locator('#libWarns button, #libWarns [data-preset]').count(),0,'preview is not a warning picker');
    assert.equal(await chips.first().evaluate(node=>getComputedStyle(node).color),'rgb(217, 114, 44)','selected warnings are orange');
    await chips.first().click();assert.equal(await page.evaluate(()=>previewFixture.writes()),0,'preview chips cannot silently change warning metadata');
    const neutral=await page.evaluate(()=>{const node=document.createElement('span');node.className='book-warn';document.querySelector('#libWarns').append(node);const color=getComputedStyle(node).color;node.remove();return color;});
    assert.equal(neutral,'rgb(156, 163, 175)','neutral styling is gray');
    for(const width of [320,390,1440]){
        await page.setViewportSize({width,height:900});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'fits '+width);
        await page.locator('#libWarns').screenshot({path:'test-results/content-warnings/'+name+'-library-preview-'+width+'.png'});
    }
    await page.evaluate(()=>previewFixture.paint([], {version:1,reviewed:true,noneApply:false,coreIds:['major-character-death'],entries:[{id:'pet-death',label:'Pet death'}]}));
    assert.deepEqual(await chips.allTextContents(),['Major Character Death','Pet death'],'structured selections also render');
    await page.evaluate(()=>previewFixture.paint(['<img src=x onerror=alert(1)>']));assert.equal(await page.locator('#libWarns img').count(),0,'custom labels remain text');
    await page.evaluate(()=>previewFixture.paint([]));assert.equal(await page.locator('#libWarns').isVisible(),false);assert.equal(await page.locator('#libWarnsLabel').isVisible(),false);
    assert.deepEqual(errors,[]);console.log(name+': preview shows only selected warnings, orange selection/gray neutral, safe labels and phone/desktop layout passed.');
}finally{await browser.close();server.close();}
