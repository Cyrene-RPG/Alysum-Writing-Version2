import { calculatePricing, dollars } from '@alysum/publishing/pricing-guide.js';
import { countWordsInHtml } from '@alysum/writing-engine/word-count.js';

export function bindPricingGuide(chapters) {
    const section = document.getElementById('pricingGuide');
    if (!section) return;
    const $ = id => document.getElementById(id);
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const refresh = () => {
        const rows = (chapters || []).map(ch => ({ id: String(ch.id), title: ch.title || 'Untitled chapter', words: countWordsInHtml(ch.content || '') }));
        const selected = new Set([...document.querySelectorAll('#chapterList [data-chapter-id]:checked')].map(el => String(el.dataset.chapterId)));
        const included = rows.filter(row => selected.has(row.id));
        const result = calculatePricing(included.map(row => row.words), { discountPercent: Number($('pricingDiscount').value), complete: Boolean($('workComplete')?.checked) });
        $('pricingChapterCount').textContent = String(result.chapterCount);
        $('pricingWordCount').textContent = result.totalWords.toLocaleString();
        $('pricingChapterTotal').textContent = dollars(result.chapterTotal);
        $('pricingBookSuggestion').textContent = dollars(result.suggestedBook);
        $('pricingChapterRows').innerHTML = included.map((row, index) => '<tr><td>' + escape(row.title) + '</td><td>' + row.words.toLocaleString() + '</td><td>' + dollars(result.chapterPrices[index]) + '</td></tr>').join('');
        const sale = Number($('pricingCustomPrice').value);
        const price = $('pricingCustomPrice').value.trim() === '' ? result.suggestedBook / 100 : Math.max(0, Number.isFinite(sale) ? sale : 0);
        const sales = Math.max(0, Math.floor(Number($('pricingSales').value) || 0));
        $('pricingEarnings').textContent = dollars(Math.round(price * 100) * sales);
        $('pricingNotice').textContent = !result.chapterCount ? 'Select chapters to receive a suggestion.' : !result.totalWords ? 'Add manuscript content to receive a suggestion.' : price * 100 > result.chapterTotal ? 'Your custom book price exceeds the sum of its chapters.' : price * 100 > result.suggestedBook * 1.5 ? 'Your price is significantly above the suggested range.' : '';
        $('pricingFormat').textContent = result.complete ? 'Completed book' : 'Published chapters / ongoing story';
    };
    ['pricingDiscount','pricingCustomPrice','pricingSales','workComplete'].forEach(id => $(id)?.addEventListener('input', refresh));
    $('chapterList')?.addEventListener('change', refresh);
    $('pricingRecalculate')?.addEventListener('click', () => window.location.reload());
    const chapterList = $('chapterList');
    const observer = chapterList ? new MutationObserver(refresh) : null;
    if (observer) observer.observe(chapterList, { childList: true, subtree: true });
    refresh();
    return () => observer?.disconnect();
}
