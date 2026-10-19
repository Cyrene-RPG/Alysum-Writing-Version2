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
    let ready=false, loaded=false, config=null, failure='';
    try {
        const status=await authorAccessRequest(supabase,'status'); ready=status.ready;
        if (ready) {
            const [connections,saved]=await Promise.all([authorAccessRequest(supabase,'connections'),authorAccessRequest(supabase,'book',{query:{book:book.id}})]);
            config=saved.config;
            $('chapterConnection').replaceChildren(new Option('Choose your connected shop',''),...connections.connections.filter(c=>c.enabled).map(c=>new Option(c.provider==='kofi'?'Ko-fi':'Payhip',c.id)));
            const pending = book.publish_meta?.chapterAccessPending && book.publish_meta?.chapterAccess;
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
    for(const chapter of chapters) {
        const label=document.createElement('label');label.className='pub-chapter';
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.lockChapterId=String(chapter.id);checkbox.checked=locked.has(String(chapter.id));
        const publish=[...document.querySelectorAll('[data-chapter-id]')].find(el=>el.dataset.chapterId===String(chapter.id));
        bindLockSelection(publish,checkbox);
        label.append(checkbox,document.createTextNode(`Lock: ${chapter.title || 'Untitled'}`));list.append(label);
    }
    $('chapterShopSettings').href=`/applications/studio/pages/connected-payments?book=${encodeURIComponent(book.id)}`;
    return {
        read() {
            return {lockedChapterIds:[...document.querySelectorAll('[data-lock-chapter-id]:checked')].map(el=>el.dataset.lockChapterId),
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
            const price=access.minimum;
            if(access.lockedChapterIds.length && !/^\d{1,4}(\.\d{1,2})?$/.test(price)) throw Error('Enter the shop product’s price, such as 3.00.');
            await authorAccessRequest(supabase,'configure',{method:'POST',body:{book:book.id,complete:form.complete,selectedIds:form.chapterIds,chapterIds:access.lockedChapterIds,connectionId:access.connectionId,
                productKey:normalizeProductKey('kofi',access.productUrl)||normalizeProductKey('payhip',access.productUrl),purchaseUrl:access.productUrl,minimumAmount:Math.round(Number(price)*100),currency:access.currency}});
            config={chapter_ids:access.lockedChapterIds};
        }
    };
}
