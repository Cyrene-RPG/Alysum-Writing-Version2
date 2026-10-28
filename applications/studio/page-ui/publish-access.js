import { authorAccessRequest } from '/core/publishing/author-access-client.js';
import { normalizeProductKey } from '/core/publishing/author-access.js';
export function bindLockSelection(publish, lock) {
    if (!publish) return;
    const selectPublished = () => {
        if (lock.checked && !publish.checked) {
            publish.checked=true;
            publish.dispatchEvent(new Event('change',{bubbles:true}));
        }
    };
    selectPublished();
    lock.addEventListener('change',selectPublished);
    publish.addEventListener('change',()=>{if (!publish.checked) lock.checked=false;});
}
export async function bindChapterAccess({supabase,book,chapters}) {
    const $=id=>document.getElementById(id);
    let ready=false, loaded=false, config=null, failure='', savedProducts=[];
    const mode=$('chapterPricingMode');
    try {
        const status=await authorAccessRequest(supabase,'status'); ready=status.ready;
        mode.querySelector('[value=individual]').disabled=!status.individualPricing;
        $('chapterPricingSetup').hidden=Boolean(status.individualPricing);
        if (ready) {
            const [connections,saved]=await Promise.all([authorAccessRequest(supabase,'connections'),authorAccessRequest(supabase,'book',{query:{book:book.id}})]);
            config=saved.config;
            $('chapterConnection').replaceChildren(new Option('Choose your connected shop',''),...connections.connections.filter(c=>c.enabled).map(c=>new Option(c.provider==='kofi'?'Ko-fi':'Payhip',c.id)));
            const pending = book.publish_meta?.chapterAccessPending && book.publish_meta?.chapterAccess;
            savedProducts=pending?.chapterProducts || config?.chapterProducts || [];
            mode.value=pending?.pricingMode || (savedProducts.length ? 'individual' : 'bundle');
            if(pending) {
                $('chapterConnection').value=pending.connectionId || '';$('chapterProduct').value=pending.productUrl || '';$('chapterMinimum').value=pending.minimum || '';$('chapterCurrency').value=pending.currency || 'USD';
            } else if(config) { $('chapterConnection').value=config.connection_id || ''; $('chapterProduct').value=config.purchase_url; $('chapterMinimum').value=config.minimum_amount?String(config.minimum_amount/100):''; $('chapterCurrency').value=config.currency || 'USD'; }
        }
        loaded=true;
    } catch(error) { ready=false;failure=error.message; }
    $('chapterAccessUnavailable').hidden=ready;
    $('chapterAccessFields').hidden=!ready;
    $('chapterAccessUnavailable').textContent=failure || 'Chapter locks need a one-time database update. Your free publishing and purchase link still work.';
    $('chapterAccessSetup').hidden=ready;
    const locked=new Set(book.publish_meta?.chapterAccessPending ? book.publish_meta?.lockedChapterIds || [] : config?.chapter_ids || book.publish_meta?.lockedChapterIds || []);
    const list=$('chapterLocks');
    const productControls=[];
    for(const chapter of chapters) {
        const label=document.createElement('label');label.className='pub-chapter';
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.lockChapterId=String(chapter.id);checkbox.checked=locked.has(String(chapter.id));
        const publish=[...document.querySelectorAll('[data-chapter-id]')].find(el=>el.dataset.chapterId===String(chapter.id));
        bindLockSelection(publish,checkbox);
        const row=document.createElement('div');row.className='chapter-price-row';
        const fields=document.createElement('div');fields.className='chapter-product-fields access-grid';
        const saved=savedProducts.find(p=>String(p.chapterId)===String(chapter.id));
        const urlLabel=document.createElement('label');urlLabel.textContent='Chapter product link';
        const url=document.createElement('input');url.type='url';url.maxLength=2000;url.placeholder='https://ko-fi.com/s/chapter-product';url.value=saved?.productUrl || '';
        urlLabel.append(url);
        const priceLabel=document.createElement('label');priceLabel.textContent='Chapter price';
        const price=document.createElement('input');price.type='number';price.min='0.50';price.max='1000';price.step='0.01';price.inputMode='decimal';price.placeholder='0.75';price.value=saved?.minimum || '';
        priceLabel.append(price);fields.append(urlLabel,priceLabel);
        label.append(checkbox,document.createTextNode(`Lock: ${chapter.title || 'Untitled'}`));row.append(label,fields);list.append(row);
        productControls.push({chapterId:String(chapter.id),checkbox,fields,url,price});
    }
    const updateMode=()=>{
        const individual=mode.value==='individual';
        $('chapterBundleFields').hidden=individual;
        for(const row of productControls) {
            row.fields.hidden=!individual || !row.checkbox.checked;
            row.url.disabled=row.price.disabled=!individual || !row.checkbox.checked;
        }
        document.getElementById('pricingGuide')?.dispatchEvent(new Event('chapterpricingchange'));
    };
    mode.addEventListener('change',updateMode);
    list.addEventListener('change',updateMode);
    $('chapterList')?.addEventListener('change',updateMode);
    updateMode();
    $('chapterShopSettings').href=`/applications/studio/pages/connected-payments?book=${encodeURIComponent(book.id)}`;
    return {
        read() {
            return {lockedChapterIds:[...document.querySelectorAll('[data-lock-chapter-id]:checked')].map(el=>el.dataset.lockChapterId),
                pricingMode:mode.value,chapterProducts:productControls.filter(row=>row.checkbox.checked).map(row=>({chapterId:row.chapterId,productUrl:row.url.value.trim(),minimum:row.price.value.trim()})),
                connectionId:$('chapterConnection').value,productUrl:$('chapterProduct').value.trim(),minimum:$('chapterMinimum').value.trim(),currency:$('chapterCurrency').value};
        },
        async save(form) {
            const access=form.chapterAccess;
            // Existing protected books must not silently publish free if setup fails.
            if(!loaded || !ready) {
                if(access.lockedChapterIds.length || locked.size) throw Error(failure || 'Chapter access is unavailable. Your listing has not been updated.');
                return;
            }
            if (!config && !access.lockedChapterIds.length) return;
            if(access.pricingMode === 'individual' && access.chapterProducts.some(p=>!/^\d{1,4}(\.\d{1,2})?$/.test(p.minimum))) throw Error('Enter each chapter product’s price with up to two decimal places.');
            const price=access.minimum;
            if(access.pricingMode !== 'individual' && access.lockedChapterIds.length && !/^\d{1,4}(\.\d{1,2})?$/.test(price)) throw Error('Enter the shop product’s price, such as 3.00.');
            await authorAccessRequest(supabase,'configure',{method:'POST',body:{book:book.id,complete:form.complete,selectedIds:form.chapterIds,chapterIds:access.lockedChapterIds,connectionId:access.connectionId,
                pricingMode:access.pricingMode,chapterProducts:access.chapterProducts.map(p=>({chapterId:p.chapterId,purchaseUrl:p.productUrl,minimumAmount:p.minimum === '' ? null : Math.round(Number(p.minimum)*100)})),
                productKey:normalizeProductKey('kofi',access.productUrl)||normalizeProductKey('payhip',access.productUrl),purchaseUrl:access.productUrl,minimumAmount:Math.round(Number(price)*100),currency:access.currency}});
            config={chapter_ids:access.lockedChapterIds};
        }
    };
}
