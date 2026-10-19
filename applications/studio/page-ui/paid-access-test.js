import { normalizePlan, readTestState, saveTestState, validatePlan, money, priceInMinorUnits, paidIdsFor } from '/core/publishing/paid-access-test.js';

const escape = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);

export function mountPaidAccessTest({ book, chapters, readForm }) {
    const initial = readTestState(localStorage);
    let plan = normalizePlan(initial.plan);
    const card = document.createElement('section');
    card.className = 'pub-card paid-access';
    card.id = 'accessPricing';
    card.innerHTML = `
        <div class="access-heading"><h2>Access & pricing</h2><span class="access-badge">Test version</span></div>
        <p class="pub-hint">Try payments directly to the author. This preview uses sample writing and simulated payments.</p>
        <fieldset class="access-options"><legend>How can readers access this work?</legend>
          <label><input type="radio" name="accessMode" value="free"> <span><strong>Free to read</strong><small>Every posted chapter is free.</small></span></label>
          <label><input type="radio" name="accessMode" value="chapters"> <span><strong>Paid chapters</strong><small>Choose free samples and paid chapters or a bundle.</small></span></label>
          <label><input type="radio" name="accessMode" value="book"> <span><strong>Buy the complete book</strong><small>One payment. First chapter stays free as a sample.</small></span></label>
        </fieldset>
        <div data-paid-options>
          <p class="pub-hint" data-book-note hidden>Full-book purchases are available for completed works. Mark this work complete in Work details above.</p>
          <div class="access-grid">
            <div><label for="accessProvider">Payment provider</label><select id="accessProvider"><option value="ko-fi">Ko-fi</option><option value="paypal">PayPal</option></select></div>
            <div class="access-connect"><button type="button" class="pub-ghost" id="accessConnect">Connect for test</button><span id="accessConnection" role="status"></span></div>
          </div>
          <p class="pub-hint">No account credentials or payment details are needed for this test. A real connection will require provider verification.</p>
          <div class="access-grid" data-chapter-sale><div><label for="accessSale">Sell as</label><select id="accessSale"><option value="bundle">One chapter bundle</option><option value="chapter">Individual chapters</option></select></div></div>
          <div class="access-grid"><div><label for="accessPrice" id="accessPriceLabel">Bundle price</label><input id="accessPrice" type="text" inputmode="decimal" autocomplete="off" aria-describedby="accessError"></div><div><label for="accessCurrency">Currency</label><select id="accessCurrency">${['USD','GBP','EUR','CAD','AUD'].map(c => `<option>${c}</option>`).join('')}</select></div></div>
          <fieldset class="access-chapters" data-chapter-locks><legend>Choose paid chapters</legend><p class="pub-hint">Unchecked chapters stay free. Only chapters selected for posting are included.</p><div id="accessChapterList"></div></fieldset>
        </div>
        <div class="access-summary" id="accessSummary" aria-live="polite"></div>
        <p class="pub-error" id="accessError" role="alert" hidden></p>
        <div class="access-toolbar"><button type="button" class="pub-primary" id="accessPreview">Preview as reader</button><button type="button" class="pub-ghost" id="accessReset">Reset test purchases</button></div>
        <p class="pub-hint">Membership access will follow later. Nothing here changes a live listing.</p>`;
    document.querySelector('.pub-strip').before(card);
    card.querySelector(`[name="accessMode"][value="${plan.mode}"]`).checked = true;
    for (const [id, key] of [['accessProvider','provider'],['accessSale','sale'],['accessPrice','price'],['accessCurrency','currency']]) card.querySelector(`#${id}`).value = plan[key];
    card.querySelector('#accessChapterList').innerHTML = chapters.map(ch => `<label><input type="checkbox" data-paid-chapter="${escape(ch.id)}" ${plan.paidIds.includes(ch.id) ? 'checked' : ''}> <span>${escape(ch.title)}</span><small data-chapter-state="${escape(ch.id)}"></small></label>`).join('');
    function read() {
        plan = normalizePlan({ ...plan, mode: card.querySelector('[name="accessMode"]:checked').value,
            provider: card.querySelector('#accessProvider').value, sale: card.querySelector('#accessSale').value,
            price: card.querySelector('#accessPrice').value, currency: card.querySelector('#accessCurrency').value,
            paidIds: [...card.querySelectorAll('[data-paid-chapter]:checked')].map(el => el.dataset.paidChapter) });
        return plan;
    }
    function selectedChapters() { const ids = readForm().chapterIds; return chapters.filter(ch => ids.includes(ch.id)); }
    function paint() {
        read();
        const selected = selectedChapters();
        const paid = paidIdsFor(plan, selected);
        card.querySelector('[data-paid-options]').hidden = plan.mode === 'free';
        card.querySelector('[data-chapter-sale]').hidden = plan.mode !== 'chapters';
        card.querySelector('[data-chapter-locks]').hidden = plan.mode !== 'chapters';
        card.querySelector('[data-book-note]').hidden = plan.mode !== 'book' || readForm().complete;
        card.querySelector('#accessPriceLabel').textContent = plan.mode === 'book' ? 'Book price' : plan.sale === 'chapter' ? 'Price per chapter' : 'Bundle price';
        const connected = plan.connectedProvider === plan.provider;
        card.querySelector('#accessConnect').textContent = connected ? 'Disconnect test account' : 'Connect for test';
        card.querySelector('#accessConnection').textContent = connected ? 'Connected for test' : 'Not connected';
        card.querySelectorAll('[data-paid-chapter]').forEach(el => {
            const included = selected.some(ch => ch.id === el.dataset.paidChapter);
            el.disabled = !included;
            const state = [...card.querySelectorAll('[data-chapter-state]')].find(s => s.dataset.chapterState === el.dataset.paidChapter);
            state.textContent = !included ? 'Not posted' : el.checked ? 'Paid' : 'Free';
        });
        const price = priceInMinorUnits(plan.price);
        card.querySelector('#accessSummary').textContent = plan.mode === 'free'
            ? `${selected.length} chapters · Free to read`
            : `${selected.length - paid.length} free · ${paid.length} paid${price === null ? '' : ' · ' + money(price, plan.currency) + (plan.mode === 'book' ? ' for the book' : plan.sale === 'chapter' ? ' per chapter' : ' for the bundle')}`;
    }
    function showError(message) { const el = card.querySelector('#accessError'); el.textContent = message; el.hidden = !message; }
    function save({ preview = false } = {}) {
        read();
        const form = readForm();
        const selected = selectedChapters();
        const error = validatePlan(plan, { chapters: selected, complete: form.complete });
        if (error) { showError(error); card.scrollIntoView({ block: 'start', behavior: 'smooth' }); return false; }
        const snapshot = { id: book.id, title: form.title, author: book._author, complete: form.complete, chapters: selected };
        const previous = readTestState(localStorage);
        const unchanged = JSON.stringify(previous.plan) === JSON.stringify(plan) && JSON.stringify(previous.snapshot) === JSON.stringify(snapshot);
        try { saveTestState(localStorage, { plan, snapshot, grants: unchanged && Array.isArray(previous.grants) ? previous.grants : [], settingsSaved: true }); }
        catch { showError('Could not save the test preview on this device. Free some browser storage and try again.'); return false; }
        showError('');
        if (preview) window.location.assign(`/read?id=${encodeURIComponent(book.id)}&paidAccessTest=1`);
        return true;
    }
    card.addEventListener('input', paint);
    document.querySelector('.pub-page').addEventListener('change', paint);
    card.querySelector('#accessConnect').addEventListener('click', () => { read(); plan.connectedProvider = plan.connectedProvider === plan.provider ? '' : plan.provider; paint(); });
    card.querySelector('#accessPreview').addEventListener('click', () => save({ preview: true }));
    card.querySelector('#accessReset').addEventListener('click', () => {
        try { const state = readTestState(localStorage); saveTestState(localStorage, { ...state, grants: [] }); showError(''); card.querySelector('#accessSummary').textContent = 'Test purchases reset. Preview as reader to try again.'; }
        catch { showError('Could not reset purchases on this device.'); }
    });
    paint();
    return { save };
}
