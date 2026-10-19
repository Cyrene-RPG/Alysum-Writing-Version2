import { TEST_BOOK_ID, sampleBook, readTestState, saveTestState, makeOffer, hasTestAccess, money } from '/core/publishing/paid-access-test.js';

export function testReaderWork() {
    const state = readTestState(localStorage);
    const sample = sampleBook();
    const snapshot = state.snapshot?.id === TEST_BOOK_ID && Array.isArray(state.snapshot.chapters) ? state.snapshot : null;
    return snapshot || { id: sample.id, title: sample.title, author: sample._author, chapters: sample.sections.body };
}
export function mountTestReader(work, onUnlock) {
    const state = readTestState(localStorage);
    const plan = state.plan;
    let grants = Array.isArray(state.grants) ? state.grants : [];
    const banner = document.createElement('div');
    banner.className = 'access-test-banner';
    const label = document.createElement('span');
    label.textContent = 'Payment test · Sample book · No charges';
    const back = document.createElement('a');
    back.href = '/publish?book=paid-access-sample&paidAccessTest=1#accessPricing';
    back.textContent = 'Edit pricing';
    banner.append(label, back);
    document.querySelector('.reader-bar').after(banner);
    const dialog = document.createElement('dialog');
    dialog.className = 'access-checkout';
    dialog.setAttribute('aria-labelledby', 'testCheckoutTitle');
    dialog.innerHTML = `<h2 id="testCheckoutTitle">Test checkout</h2><p class="access-checkout-note">This simulates paying the author. No payment page opens and no money is taken.</p><dl><dt>Purchase</dt><dd data-purchase></dd><dt>Author</dt><dd data-author></dd><dt>Provider</dt><dd data-provider></dd><dt>Total</dt><dd data-total></dd></dl><p data-payment-status role="status"></p><div class="access-toolbar"><button type="button" class="access-buy" data-complete>Complete test payment</button><button type="button" data-cancel>Cancel</button></div><button type="button" class="access-failure" data-fail>Try a failed payment</button>`;
    document.body.append(dialog);
    let pending = null;
    const status = dialog.querySelector('[data-payment-status]');
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-fail]').addEventListener('click', () => { status.textContent = 'Payment failed. Nothing was charged and no chapters were unlocked. You can try again.'; });
    dialog.addEventListener('close', () => { pending = null; });
    dialog.querySelector('[data-complete]').addEventListener('click', () => {
        if (!pending) return;
        const next = [...new Set([...grants, pending.id])];
        try { saveTestState(localStorage, { ...readTestState(localStorage), grants: next }); }
        catch { status.textContent = 'Could not save the test purchase. Nothing was charged. Check your browser storage and try again.'; return; }
        grants = next;
        dialog.close();
        onUnlock();
    });
    function open(offer) {
        pending = offer;
        dialog.querySelector('[data-purchase]').textContent = offer.title;
        dialog.querySelector('[data-author]').textContent = work.author || 'Alysum sample author';
        dialog.querySelector('[data-provider]').textContent = offer.provider === 'ko-fi' ? 'Ko-fi (simulated)' : 'PayPal (simulated)';
        dialog.querySelector('[data-total]').textContent = money(offer.amount, offer.currency);
        status.textContent = '';
        dialog.showModal();
    }
    return {
        locked(chapterId) { return !hasTestAccess(plan, work.chapters, chapterId, grants); },
        label(chapterId) { return !makeOffer(plan, work.chapters, chapterId) ? 'Free' : this.locked(chapterId) ? 'Paid' : 'Purchased'; },
        paintGate(root, chapter) {
            const offer = makeOffer(plan, work.chapters, chapter.id);
            root.replaceChildren();
            const panel = document.createElement('section');
            panel.className = 'access-gate';
            const badge = document.createElement('p'); badge.className = 'access-badge'; badge.textContent = 'Paid chapter';
            const heading = document.createElement('h2'); heading.textContent = plan.mode === 'book' ? 'Continue with the complete book' : plan.sale === 'chapter' ? 'Unlock this chapter' : 'Continue with the chapter bundle';
            const desc = document.createElement('p'); desc.textContent = `${offer.title} · ${money(offer.amount, offer.currency)} · One-time payment`;
            const button = document.createElement('button'); button.type = 'button'; button.className = 'access-buy'; button.textContent = `Test ${offer.provider === 'ko-fi' ? 'Ko-fi' : 'PayPal'} checkout`; button.addEventListener('click', () => open(offer));
            const note = document.createElement('p'); note.className = 'access-checkout-note'; note.textContent = 'In the finished version, you’ll pay the author directly and continue reading here after payment is verified. This is a sample preview.';
            panel.append(badge, heading, desc, button, note); root.append(panel);
        },
    };
}
