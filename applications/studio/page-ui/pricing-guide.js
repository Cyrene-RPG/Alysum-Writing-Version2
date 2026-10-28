import { calculatePricing, dollars } from '@alysum/publishing/pricing-guide.js';
import { countWordsInHtml } from '@alysum/writing-engine/word-count.js';

export function bindPricingGuide(chapters, loadLatestChapters) {
    const section = document.getElementById('pricingGuide');
    if (!section) return;
    const $ = id => document.getElementById(id);
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let currentChapters = chapters || [];
    const estimates = new Map();
    const shopEstimates = new Map();
    const readEstimate = id => {
        const value=estimates.get(id) ?? shopEstimates.get(id);
        return value === undefined || value === '' ? undefined : Math.round(Number(value)*100);
    };
    const paidRows = () => {
        const locked=new Set([...document.querySelectorAll('#chapterLocks [data-lock-chapter-id]:checked')].map(el=>el.dataset.lockChapterId));
        return currentChapters.filter(ch=>locked.has(String(ch.id)));
    };
    const updatePriceButton = () => {
        const button=$('chapterUseCalculator');
        if (!button) return;
        const usd=$('chapterCurrency')?.value==='USD';
        button.disabled=!usd || !paidRows().length;
        $('chapterCalculatorHint').textContent=!usd ? 'Calculator suggestions are in USD. Enter the prices from your shop for other currencies.' : 'Fills prices for checked chapters only. Set the same amounts in your shop; this button does not change shop prices.';
    };
    const refresh = (keepRows = false) => {
        if ($('chapterCalculatorStatus')) $('chapterCalculatorStatus').textContent='';
        const rows = currentChapters.map(ch => ({ id: String(ch.id), title: ch.title || 'Untitled chapter', words: countWordsInHtml(ch.content || '') }));
        const selected = new Set([...document.querySelectorAll('#chapterList [data-chapter-id]:checked')].map(el => String(el.dataset.chapterId)));
        const included = rows.filter(row => selected.has(row.id));
        const result = calculatePricing(included.map(row => row.words), { discountPercent: Number($('pricingDiscount').value), complete: Boolean($('workComplete')?.checked), chapterPrices: included.map(row=>readEstimate(row.id)) });
        $('pricingChapterCount').textContent = String(result.chapterCount);
        $('pricingWordCount').textContent = result.totalWords.toLocaleString();
        $('pricingChapterTotal').textContent = dollars(result.chapterTotal);
        $('pricingBookSuggestion').textContent = dollars(result.suggestedBook);
        // Keep the focused price field intact while updating totals on every keystroke.
        if (!keepRows) $('pricingChapterRows').innerHTML = included.map(row => {
            const suggested=calculatePricing([row.words]).chapterPrices[0];
            return '<tr><td>' + escape(row.title) + '</td><td>' + row.words.toLocaleString() + '</td><td>' + dollars(suggested) + '</td><td><input type="number" min="0" max="1000" step="0.01" inputmode="decimal" data-estimate-id="' + escape(row.id) + '" aria-label="Estimated price for ' + escape(row.title) + ' in USD" placeholder="' + (suggested/100).toFixed(2) + '" value="' + escape(estimates.get(row.id) ?? shopEstimates.get(row.id) ?? '') + '"></td></tr>';
        }).join('') || '<tr><td colspan="4">Select chapters under Manuscript to calculate a price.</td></tr>';
        const sale = Number($('pricingCustomPrice').value);
        const price = $('pricingCustomPrice').value.trim() === '' ? result.suggestedBook / 100 : Math.max(0, Number.isFinite(sale) ? sale : 0);
        const sales = Math.max(0, Math.floor(Number($('pricingSales').value) || 0));
        $('pricingEarnings').textContent = dollars(Math.round(price * 100) * sales);
        $('pricingNotice').textContent = !result.chapterCount ? 'Select chapters to receive a suggestion.' : !result.totalWords ? 'Add manuscript content to receive a suggestion.' : price * 100 > result.chapterTotal ? 'Your custom book price exceeds the sum of its chapters.' : price * 100 > result.suggestedBook * 1.5 ? 'Your price is significantly above the suggested range.' : '';
        $('pricingFormat').textContent = result.complete ? 'Completed book' : 'Published chapters / ongoing story';
        updatePriceButton();
    };
    $('chapterUseCalculator')?.addEventListener('click',()=>{
        const included=paidRows();
        if ($('chapterCurrency')?.value!=='USD' || !included.length) return;
        // Suggest from manuscript length or the author's explicit calculator edits,
        // rather than copying old shop prices back into the same fields.
        const customPrices=included.map(ch=>{
            const value=estimates.get(String(ch.id));
            return value === undefined || value === '' ? undefined : Math.round(Number(value)*100);
        });
        const suggestion=calculatePricing(included.map(ch=>countWordsInHtml(ch.content || '')), {discountPercent:Number($('pricingDiscount').value),chapterPrices:customPrices});
        if (!suggestion.totalWords) {
            $('chapterCalculatorStatus').textContent='Save some chapter text first so the calculator can suggest a price.';
            return;
        }
        if ($('chapterPricingMode').value==='individual') {
            const prices=new Map(included.map((ch,index)=>[String(ch.id),suggestion.chapterPrices[index]]));
            for (const row of document.querySelectorAll('.chapter-price-row')) {
                const id=row.querySelector('[data-lock-chapter-id]')?.dataset.lockChapterId;
                if (!prices.has(id)) continue;
                const input=row.querySelector('input[type=number]');
                input.value=(Math.min(100000,Math.max(50,prices.get(id)))/100).toFixed(2);
                estimates.delete(id);
            }
            useChapterPrices();
            $('chapterCalculatorStatus').textContent='Filled '+included.length+' chapter price(s). Match these amounts in your shop, then save or update your listing.';
        } else {
            const planned=$('pricingCustomPrice').value.trim();
            const amount=planned === '' ? suggestion.suggestedBook : Math.round(Number(planned)*100);
            if (!Number.isFinite(amount) || amount<50 || amount>100000) {
                // Word-count bands can suggest 0.49; paid access requires at least 0.50.
                if (planned !== '') { $('chapterCalculatorStatus').textContent='Enter a planned price from $0.50 to $1,000, or leave it blank for a suggestion.'; return; }
            }
            $('chapterMinimum').value=(Math.min(100000,Math.max(50,amount))/100).toFixed(2);
            $('chapterCalculatorStatus').textContent='Filled '+dollars(Math.min(100000,Math.max(50,amount)))+' for the checked chapters together. Match this amount in your shop, then save or update your listing.';
        }
    });
    $('pricingChapterRows').addEventListener('input', event=>{
        if (!event.target.matches('[data-estimate-id]')) return;
        estimates.set(event.target.dataset.estimateId,event.target.value);
        refresh(true);
    });
    const useChapterPrices=()=>{
        shopEstimates.clear();
        if ($('chapterPricingMode')?.value !== 'individual' || $('chapterCurrency')?.value !== 'USD') { refresh(); return; }
        for (const row of document.querySelectorAll('.chapter-price-row')) {
            const id=row.querySelector('[data-lock-chapter-id]')?.dataset.lockChapterId;
            const price=row.querySelector('input[type=number]');
            if (id && price && row.querySelector('[data-lock-chapter-id]').checked) shopEstimates.set(id,price.value);
        }
        refresh();
    };
    $('chapterLocks')?.addEventListener('input', useChapterPrices);
    section.addEventListener('chapterpricingchange',useChapterPrices);
    $('chapterCurrency')?.addEventListener('change',useChapterPrices);
    ['pricingDiscount' ,'pricingCustomPrice','pricingSales','workComplete'].forEach(id => $(id)?.addEventListener('input', () => refresh()));
    $('chapterList')?.addEventListener('change', () => refresh());
    const recalculateButton = $('pricingRecalculate');
    recalculateButton?.addEventListener('click', async () => {
        recalculateButton.disabled = true;
        const originalLabel = recalculateButton.textContent;
        recalculateButton.textContent = 'Updating…';
        try {
            const before = new Map(currentChapters.map(ch => [String(ch.id), String(ch.content || '')]));
            if (loadLatestChapters) currentChapters = await loadLatestChapters();
            const changed = currentChapters.filter(ch => before.get(String(ch.id)) !== String(ch.content || '')).length;
            const added = currentChapters.filter(ch=>!before.has(String(ch.id))).length;
            const removed = [...before.keys()].filter(id => !currentChapters.some(ch => String(ch.id) === id)).length;
            refresh();
            $('pricingUpdateStatus').textContent = changed || removed
                ? 'Recalculated: ' + changed + ' changed or added chapter(s)' + (removed ? ', ' + removed + ' removed' : '') + '. Prices may stay the same within a word-count range.' + (added ? ' Reload the publishing page to select newly added chapters.' : '')
                : 'No new saved chapter text was found. Word counts and suggested prices are unchanged. Make sure edits are saved in the manuscript editor.';
        } catch (error) {
            $('pricingUpdateStatus').textContent = 'Could not load saved chapters: ' + (error?.message || 'Please try again.');
        } finally {
            recalculateButton.disabled = false;
            recalculateButton.textContent = originalLabel;
        }
    });
    const chapterList = $('chapterList');
    const observer = chapterList ? new MutationObserver(() => refresh()) : null;
    if (observer) observer.observe(chapterList, { childList: true, subtree: true });
    refresh();
    return () => observer?.disconnect();
}
