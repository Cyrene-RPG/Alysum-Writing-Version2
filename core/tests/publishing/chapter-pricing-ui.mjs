import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {JSDOM}=await import(process.env.JSDOM_MODULE || 'jsdom');
const root=new URL('../../../',import.meta.url);
let fixtureVersion=0;
async function loadModule(path,stubAccess=false) {
    let code=await readFile(new URL(path,root),'utf8');
    if(stubAccess) code=code.replace(/import\s*\{\s*authorAccessRequest\s*\}\s*from[^;]+;/,"const authorAccessRequest = (...args)=>globalThis.accessRequest(...args);");
    code=code.replace(/(['"])(?:@alysum\/|\/core\/)([^'"]+)\1/g,(_,q,path)=>JSON.stringify(new URL('core/'+path,root).href));
    if(stubAccess)code+='\n// fixture '+(++fixtureVersion);
    return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
test('standalone calculator retains custom prices on input changes and resets to shared suggestions',async()=>{
    const html=await readFile(new URL('pricing-calculator/index.html',root),'utf8');
    const dom=new JSDOM(html);const previous=globalThis.document;globalThis.document=dom.window.document;
    try {
        let code=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
        code=code.replace("'/core/publishing/pricing-guide.js'",JSON.stringify(new URL('core/publishing/pricing-guide.js',root).href));
        await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
        const $=id=>document.getElementById(id),input=id=>$(id).dispatchEvent(new dom.window.Event('input'));
        assert.equal($('chapter').textContent,'$0.99');assert.equal($('book').textContent,'$9.99');
        $('customBook').value='7.25';input('customBook');$('words').value='100000';input('words');
        assert.equal($('customBook').value,'7.25');assert.equal($('earnings').textContent,'$725.00');
        $('mode').value='serial';input('mode');assert.match($('details').textContent,/Published chapters only/);
        $('reset').click();assert.equal($('customBook').value,'9.99');
        $('words').value='0';input('words');assert.equal($('book').textContent,'$0.00');assert.equal($('earnings').textContent,'$0.00');
    }finally{globalThis.document=previous;dom.window.close();}
});


test('publishing keeps calculator and collapsed preview but exposes only the new purchase flow',async()=>{
 const dom=new JSDOM(await readFile(new URL('applications/studio/pages/publish.html',root),'utf8'),{url:'https://alysumwriting.com/publish?book=book'}),saved={};
 for(const key of ['document','MutationObserver','Event','Option']){saved[key]=globalThis[key];globalThis[key]=dom.window[key];}
 try{
  const $=id=>document.getElementById(id);assert.equal($('manuscriptPreview').open,false);assert.ok($('purchasePassManage'));
  assert.equal(document.querySelectorAll('#chapterAccessCard,#purchaseLinkCard,#chapterPricingMode,#purchaseUrl').length,0);
  $('chapterList').innerHTML='<input data-chapter-id="one" type="checkbox" checked>';
  const {bindPricingGuide}=await loadModule('applications/studio/page-ui/pricing-guide.js');bindPricingGuide([{id:'one',title:'One',content:'word '.repeat(1000)}]);assert.equal($('pricingChapterCount').textContent,'1');assert.match($('pricingChapterTotal').textContent,/\$/);
 }finally{for(const key of Object.keys(saved))globalThis[key]=saved[key];dom.window.close();}
});
test('read-only legacy protection keeps purchased chapters locked and fails closed on an unavailable server',async()=>{
 const dom=new JSDOM('<a id="purchasePassManage"></a>'),previous=globalThis.document;globalThis.document=dom.window.document;
 try{
  const calls=[];globalThis.accessRequest=async(s,action)=>{calls.push(action);return{config:{chapter_ids:['one','two'],chapterProducts:[],pricingMode:'bundle'}};};
  const {bindLegacyProtection}=await loadModule('applications/studio/page-ui/legacy-protection.js',true);
  const protection=await bindLegacyProtection({supabase:{},book:{id:'book'},chapters:[]});assert.deepEqual(protection.read().lockedChapterIds,['one','two']);
  await protection.save({workType:'original',chapterIds:['one','two']});await assert.rejects(protection.save({workType:'original',chapterIds:['one']}),/Keep earlier purchased/);await assert.rejects(protection.save({workType:'fanfiction',chapterIds:['one','two']}),/protection cannot/);assert.deepEqual(calls,['book']);
  globalThis.accessRequest=async()=>{throw Error('offline');};const failed=await bindLegacyProtection({supabase:{},book:{id:'book'},chapters:[]});await assert.rejects(failed.save({workType:'original',chapterIds:['one','two']}),/listing has not changed/);
 }finally{globalThis.document=previous;dom.window.close();delete globalThis.accessRequest;}
});
