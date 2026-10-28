import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {JSDOM}=await import(process.env.JSDOM_MODULE || 'jsdom');
const root=new URL('../../../',import.meta.url);
async function loadModule(path,stubAccess=false) {
    let code=await readFile(new URL(path,root),'utf8');
    if(stubAccess) code=code.replace(/import \{ authorAccessRequest \} from [^;]+;/,"const authorAccessRequest = globalThis.accessRequest;");
    code=code.replace(/(['"])(?:@alysum\/|\/core\/)([^'"]+)\1/g,(_,q,path)=>JSON.stringify(new URL('core/'+path,root).href));
    return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
test('publish calculator, per-chapter controls, draft restore, save and collapsed preview work together',async()=>{
    const html=await readFile(new URL('applications/studio/pages/publish.html',root),'utf8');
    const dom=new JSDOM(html,{url:'https://alysumwriting.com/publish?book=book'});
    const savedGlobals={};
    for(const key of ['document','MutationObserver','Event','Option']) {savedGlobals[key]=globalThis[key];globalThis[key]=dom.window[key];}
    try {
        const $=id=>document.getElementById(id);
        assert.equal($('manuscriptPreview').open,false);
        assert.equal($('previewBody').closest('details').id,'manuscriptPreview');
        assert.equal($('chapterLocks').closest('fieldset').id,'chapterAccessFields');
        const chapters=[{id:'one',title:'Chapter 1',content:'word '.repeat(1000)},{id:'two',title:'Chapter 2',content:'word '.repeat(3000)}];
        $('chapterList').innerHTML='<input type="checkbox" data-chapter-id="one" checked><input type="checkbox" data-chapter-id="two" checked>';
        const writes=[];
        globalThis.accessRequest=async(s,action,options)=>{
            if(action==='status')return {ready:true,individualPricing:true};
            if(action==='connections')return {connections:[{id:'shop',provider:'kofi',enabled:true}]};
            if(action==='book')return {config:null};
            if(action==='configure'){writes.push(options.body);return {saved:true};}
            throw Error(action);
        };
        const {bindPricingGuide}=await loadModule('applications/studio/page-ui/pricing-guide.js');
        let failRefresh=false;
        const dispose=bindPricingGuide(chapters,async()=>{if(failRefresh)throw Error('offline');return [{...chapters[0],content:'updated '.repeat(7000)},chapters[1]];});
        assert.equal($('pricingChapterTotal').textContent,'$1.48');
        assert.equal($('pricingWordCount').textContent,'4,000');
        const {bindChapterAccess}=await loadModule('applications/studio/page-ui/publish-access.js',true);
        const access=await bindChapterAccess({supabase:{},book:{id:'book',publish_meta:{chapterAccessPending:true,lockedChapterIds:['one','two'],chapterAccess:{pricingMode:'individual',connectionId:'shop',currency:'USD',chapterProducts:[{chapterId:'one',productUrl:'https://ko-fi.com/s/one',minimum:'0.75'},{chapterId:'two',productUrl:'https://ko-fi.com/s/two',minimum:'1.25'}]}}},chapters});
        assert.equal($('chapterBundleFields').hidden,true);
        assert.equal(document.querySelector('.chapter-product-fields').hidden,false);
        assert.equal($('pricingChapterTotal').textContent,'$2.00');
        assert.equal($('pricingBookSuggestion').textContent,'$1.60');
        $('pricingSales').value='10';$('pricingSales').dispatchEvent(new Event('input'));
        assert.equal($('pricingEarnings').textContent,'$16.00');
        const input=document.querySelector('[data-estimate-id="one"]');input.value='2.00';input.dispatchEvent(new Event('input',{bubbles:true}));
        assert.equal(document.querySelector('[data-estimate-id="one"]'),input);
        assert.equal($('pricingChapterTotal').textContent,'$3.25');
        input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));
        $('chapterCurrency').value='EUR';$('chapterCurrency').dispatchEvent(new Event('change'));
        assert.equal($('pricingChapterTotal').textContent,'$1.48');
        $('chapterCurrency').value='USD';$('chapterCurrency').dispatchEvent(new Event('change'));
        await access.save({chapterAccess:access.read(),chapterIds:['one','two'],complete:true});
        assert.deepEqual(writes[0].chapterProducts.map(p=>p.minimumAmount),[75,125]);
        // Explicit application replaces old prices, keeps product links, and makes no API write.
        const previousWrites=writes.length;
        $('chapterUseCalculator').click();
        assert.deepEqual(access.read().chapterProducts.map(p=>p.minimum),['0.50','0.99']);
        assert.equal(access.read().chapterProducts[0].productUrl,'https://ko-fi.com/s/one');
        assert.equal(writes.length,previousWrites);
        assert.equal($('pricingChapterTotal').textContent,'$1.49');
        $('chapterPricingMode').value='bundle';$('chapterPricingMode').dispatchEvent(new Event('change'));
        $('chapterUseCalculator').click();assert.equal($('chapterMinimum').value,'1.18');
        $('pricingCustomPrice').value='2.75';$('chapterUseCalculator').click();assert.equal($('chapterMinimum').value,'2.75');
        $('pricingCustomPrice').value='';$('pricingCustomPrice').dispatchEvent(new Event('input'));
        $('chapterCurrency').value='EUR';$('chapterCurrency').dispatchEvent(new Event('change'));
        assert.equal($('chapterUseCalculator').disabled,true);
        assert.match($('chapterCalculatorHint').textContent,/USD/);
        assert.equal($('chapterCalculatorStatus').textContent,'');
        $('chapterCurrency').value='USD';$('chapterCurrency').dispatchEvent(new Event('change'));
        $('chapterPricingMode').value='individual';$('chapterPricingMode').dispatchEvent(new Event('change'));
        // Only checked paid chapters get prices; an unchecked chapter is untouched.
        const firstLock=document.querySelector('[data-lock-chapter-id="one"]');
        firstLock.checked=false;firstLock.dispatchEvent(new Event('change',{bubbles:true}));
        const firstPrice=document.querySelector('.chapter-product-fields input[type=number]');firstPrice.value='7.00';
        $('chapterUseCalculator').click();assert.equal(firstPrice.value,'7.00');
        $('pricingRecalculate').click();await new Promise(resolve=>setTimeout(resolve,0));
        assert.equal($('pricingWordCount').textContent,'10,000');assert.equal($('pricingRecalculate').disabled,false);
        failRefresh=true;$('pricingRecalculate').click();await new Promise(resolve=>setTimeout(resolve,0));
        assert.match($('pricingUpdateStatus').textContent,/offline/);assert.equal($('pricingRecalculate').disabled,false);
        $('chapterList').querySelectorAll('input').forEach(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
        assert.equal($('pricingChapterTotal').textContent,'$0.00');assert.equal($('pricingEarnings').textContent,'$0.00');
        assert.equal(document.querySelector('[data-lock-chapter-id]').checked,false);
        assert.equal(document.querySelector('.chapter-product-fields').hidden,true);
        assert.equal($('chapterUseCalculator').disabled,true);
        dispose();
    } finally {delete globalThis.accessRequest;for(const [key,value] of Object.entries(savedGlobals))globalThis[key]=value;dom.window.close();}
});

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
