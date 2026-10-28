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
export function bindMixedProducts({container,chapters,initial=[],onChange}) {
    const products=[];
    let nextNumber=1;
    const update=()=>{
        for(const product of products) {
            for(const checkbox of product.checkboxes) {
                checkbox.disabled=!checkbox.checked && products.some(other=>other!==product && other.checkboxes.some(input=>input.checked && input.dataset.offerChapterId===checkbox.dataset.offerChapterId));
            }
        }
    };
    const add=(saved={},notify=true)=>{
        const card=document.createElement('fieldset');card.className='chapter-mixed-product';
        const legend=document.createElement('legend');legend.textContent='Shop product '+nextNumber++;
        const fields=document.createElement('div');fields.className='access-grid';
        const urlLabel=document.createElement('label');urlLabel.textContent='Product link';
        const url=document.createElement('input');url.type='url';url.maxLength=2000;url.dataset.mixedUrl='';url.placeholder='https://ko-fi.com/s/product';url.value=saved.productUrl || '';urlLabel.append(url);
        const priceLabel=document.createElement('label');priceLabel.textContent='Full product price';
        const price=document.createElement('input');price.type='number';price.min='0.50';price.max='1000';price.step='0.01';price.inputMode='decimal';price.dataset.mixedPrice='';price.placeholder='3.00';price.value=saved.minimum || '';priceLabel.append(price);
        fields.append(urlLabel,priceLabel);
        const hint=document.createElement('p');hint.className='pub-hint';hint.textContent='This one price unlocks only the chapters checked in this product.';
        const choices=document.createElement('div');choices.className='mixed-chapter-choices';
        const ids=new Set(saved.chapterIds || []);
        const checkboxes=chapters.map(chapter=>{
            const label=document.createElement('label');
            const input=document.createElement('input');input.type='checkbox';input.dataset.offerChapterId=String(chapter.id);input.checked=ids.has(String(chapter.id));
            label.append(input,document.createTextNode(chapter.title || 'Untitled'));choices.append(label);return input;
        });
        const remove=document.createElement('button');remove.type='button';remove.textContent='Remove this product';
        const product={card,url,price,checkboxes};products.push(product);
        remove.addEventListener('click',()=>{products.splice(products.indexOf(product),1);card.remove();update();onChange?.();});
        card.addEventListener('input',()=>{update();onChange?.();});
        card.addEventListener('change',()=>{update();onChange?.();});
        card.append(legend,fields,hint,choices,remove);container.append(card);
        update();if(notify)onChange?.();
    };
    initial.forEach(product=>add(product,false));
    return {
        add,
        read:()=>products.map(product=>({productUrl:product.url.value.trim(),minimum:product.price.value.trim(),chapterIds:product.checkboxes.filter(input=>input.checked).map(input=>input.dataset.offerChapterId)})),
        removeChapter(id) { for(const product of products) for(const input of product.checkboxes) if(input.dataset.offerChapterId===id)input.checked=false;update(); },
    };
}
export async function bindChapterAccess({supabase,book,chapters}) {
    const $=id=>document.getElementById(id);
    let ready=false, loaded=false, config=null, failure='', savedProducts=[], initialMixed=null;
    const mode=$('chapterPricingMode');
    try {
        const status=await authorAccessRequest(supabase,'status'); ready=status.ready;
        mode.querySelector('[value=individual]').disabled=!status.individualPricing;
        mode.querySelector('[value=mixed]').disabled=!status.mixedPricing;
        $('chapterMixedSetup').hidden=Boolean(status.mixedPricing);
        $('chapterPricingSetup').hidden=Boolean(status.individualPricing);
        if (ready) {
            const [connections,saved]=await Promise.all([authorAccessRequest(supabase,'connections'),authorAccessRequest(supabase,'book',{query:{book:book.id}})]);
            config=saved.config;
            $('chapterConnection').replaceChildren(new Option('Choose your connected shop',''),...connections.connections.filter(c=>c.enabled).map(c=>new Option(c.provider==='kofi'?'Ko-fi':'Payhip',c.id)));
            const pending = book.publish_meta?.chapterAccessPending && book.publish_meta?.chapterAccess;
            savedProducts=pending?.chapterProducts || config?.chapterProducts || [];
            mode.value=pending?.pricingMode || config?.pricingMode || (savedProducts.length ? 'individual' : 'bundle');
            initialMixed=pending?.mixedProducts || null;
            if(pending) {
                $('chapterConnection').value=pending.connectionId || '';$('chapterProduct').value=pending.productUrl || '';$('chapterMinimum').value=pending.minimum || '';$('chapterCurrency').value=pending.currency || 'USD';
            } else if(config) { $('chapterConnection').value=config.connection_id || ''; $('chapterProduct').value=config.purchase_url; $('chapterMinimum').value=config.minimum_amount?String(config.minimum_amount/100):''; $('chapterCurrency').value=config.currency || 'USD'; }
        }
        if (ready && !$('chapterConnection').value && $('chapterConnection').options.length === 2) $('chapterConnection').selectedIndex=1;
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
        const urlLabel=document.createElement('label');urlLabel.textContent='Shop link for this chapter';
        const url=document.createElement('input');url.type='url';url.maxLength=2000;url.placeholder='https://ko-fi.com/s/chapter-product';url.value=saved?.productUrl || '';
        urlLabel.append(url);
        const priceLabel=document.createElement('label');priceLabel.textContent='Price charged by your shop';
        const price=document.createElement('input');price.type='number';price.min='0.50';price.max='1000';price.step='0.01';price.inputMode='decimal';price.placeholder='0.75';price.value=saved?.minimum || '';
        priceLabel.append(price);fields.append(urlLabel,priceLabel);
        label.append(checkbox,document.createTextNode(`Lock: ${chapter.title || 'Untitled'}`));row.append(label,fields);list.append(row);
        productControls.push({chapterId:String(chapter.id),checkbox,fields,url,price});
    }
    const seedMixed=()=>{
        if(initialMixed)return initialMixed;
        if(savedProducts.length) {
            const grouped=new Map();
            for(const product of savedProducts) {
                const key=normalizeProductKey('kofi',product.productUrl)||normalizeProductKey('payhip',product.productUrl)||product.chapterId;
                if(!grouped.has(key))grouped.set(key,{productUrl:product.productUrl,minimum:product.minimum,chapterIds:[]});
                grouped.get(key).chapterIds.push(String(product.chapterId));
            }
            return [...grouped.values()];
        }
        return [{productUrl:$('chapterProduct').value,minimum:$('chapterMinimum').value,chapterIds:[...locked]}];
    };
    let mixed;
    const updateMode=()=>{
        const individual=mode.value==='individual', isMixed=mode.value==='mixed';
        $('chapterBundleFields').hidden=individual || isMixed;
        $('chapterMixedFields').hidden=!isMixed;
        list.hidden=isMixed;
        if(isMixed && mixed) {
            const selected=new Set(mixed.read().flatMap(product=>product.chapterIds));
            let changed=false;
            for(const row of productControls) {
                row.checkbox.checked=selected.has(row.chapterId);
                const publish=[...document.querySelectorAll('#chapterList [data-chapter-id]')].find(input=>input.dataset.chapterId===row.chapterId);
                if(row.checkbox.checked && publish && !publish.checked){publish.checked=true;changed=true;}
            }
            if(changed)$('chapterList').dispatchEvent(new Event('change',{bubbles:true}));
        }
        if ($('chapterSaleInstructions')) $('chapterSaleInstructions').textContent=isMixed ? 'Add one card for each shop product. Put Chapters 1–2 in one product and Chapter 3 in another. Later chapters can get their own products.' : individual ? 'Create a separate shop product for each checked chapter. Paste each product link beside its chapter.' : 'Create one shop product for the checked chapters, then paste its link and price below.';
        for(const row of productControls) {
            row.fields.hidden=!individual || !row.checkbox.checked;
            row.url.disabled=row.price.disabled=!individual || !row.checkbox.checked;
        }
        document.getElementById('pricingGuide')?.dispatchEvent(new Event('chapterpricingchange'));
    };
    mixed=bindMixedProducts({container:$('chapterMixedProducts'),chapters,initial:seedMixed(),onChange:updateMode});
    $('chapterAddProduct').addEventListener('click',()=>mixed.add());
    mode.addEventListener('change',updateMode);
    list.addEventListener('change',updateMode);
    $('chapterList')?.addEventListener('change',()=>{
        if(mode.value==='mixed')for(const input of document.querySelectorAll('#chapterList [data-chapter-id]:not(:checked)'))mixed.removeChapter(input.dataset.chapterId);
        updateMode();
    });
    updateMode();
    $('chapterShopSettings').href=`/applications/studio/pages/connected-payments?book=${encodeURIComponent(book.id)}`;
    return {
        read() {
            return {lockedChapterIds:[...document.querySelectorAll('[data-lock-chapter-id]:checked')].map(el=>el.dataset.lockChapterId),
                pricingMode:mode.value,mixedProducts:mixed.read(),chapterProducts:mode.value==='mixed' ? mixed.read().flatMap(product=>product.chapterIds.map(chapterId=>({chapterId,productUrl:product.productUrl,minimum:product.minimum}))) : productControls.filter(row=>row.checkbox.checked).map(row=>({chapterId:row.chapterId,productUrl:row.url.value.trim(),minimum:row.price.value.trim()})),
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
            if(['individual','mixed'].includes(access.pricingMode) && access.chapterProducts.some(p=>!/^\d{1,4}(\.\d{1,2})?$/.test(p.minimum))) throw Error('Enter each chapter product’s price with up to two decimal places.');
            const price=access.minimum;
            if(!['individual','mixed'].includes(access.pricingMode) && access.lockedChapterIds.length && !/^\d{1,4}(\.\d{1,2})?$/.test(price)) throw Error('Enter the shop product’s price, such as 3.00.');
            await authorAccessRequest(supabase,'configure',{method:'POST',body:{book:book.id,complete:form.complete,selectedIds:form.chapterIds,chapterIds:access.lockedChapterIds,connectionId:access.connectionId,
                pricingMode:access.pricingMode,chapterProducts:access.chapterProducts.map(p=>({chapterId:p.chapterId,purchaseUrl:p.productUrl,minimumAmount:p.minimum === '' ? null : Math.round(Number(p.minimum)*100)})),
                productKey:normalizeProductKey('kofi',access.productUrl)||normalizeProductKey('payhip',access.productUrl),purchaseUrl:access.productUrl,minimumAmount:Math.round(Number(price)*100),currency:access.currency}});
            config={chapter_ids:access.lockedChapterIds};
        }
    };
}
