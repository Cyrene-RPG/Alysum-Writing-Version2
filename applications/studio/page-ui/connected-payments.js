import { paymentRequest } from '/core/publishing/payments-client.js';
const $ = id => document.getElementById(id);
function tell(message) { $('paymentStatus').textContent = message; }
function error(message) { $('paymentError').textContent = message; $('paymentError').hidden = !message; }
function loginLink() {
    const destination = window.location.pathname + window.location.search;
    $('paymentLogin').href = `/login?next=${encodeURIComponent(destination)}`;
    $('paymentLogin').hidden = false;
}
function selected() { return [...document.querySelectorAll('[data-include]:checked')].map(el => el.dataset.include); }
function paint() {
    const ids = selected();
    $('paidChapterPicker').hidden = $('editionMode').value === 'book';
    document.querySelectorAll('[data-paid]').forEach(el => { el.disabled = !ids.includes(el.dataset.paid); });
    $('editionPriceLabel').textContent = $('editionMode').value === 'chapter' ? 'Price per chapter' : $('editionMode').value === 'book' ? 'Complete-book price' : 'Bundle price';
}
async function loadBook() {
    const bookId = $('paymentBook').value;
    $('editionChapters').replaceChildren();
    $('paidChapters').replaceChildren();
    if (!bookId) return;
    const { chapters, complete } = await paymentRequest('author-book', { query: { book: bookId }, requireAuth: true });
    $('completeBookNote').textContent = complete ? 'This source book is marked complete.' : 'This source is a work in progress. Full-book pricing needs a completed source book.';
    for (const [index, chapter] of chapters.entries()) {
        for (const [parent, attribute, checked] of [[$('editionChapters'),'include',true],[$('paidChapters'),'paid',index > 0]]) {
            const label = document.createElement('label');
            const input = document.createElement('input'); input.type = 'checkbox'; input.dataset[attribute] = chapter.id; input.checked = checked;
            label.append(input, document.createTextNode(' ' + chapter.title)); parent.append(label);
        }
    }
    paint();
}
async function boot() {
    const status = await paymentRequest('status');
    $('setupMissing').replaceChildren();
    for (const name of status.missing) { const item = document.createElement('li'); item.textContent = name; $('setupMissing').append(item); }
    if (status.configured && !status.storageReady) { const li = document.createElement('li'); li.textContent = 'Run the Supabase payment test migration.'; $('setupMissing').append(li); }
    $('setupDetails').hidden = status.configured && status.storageReady;
    if (!status.configured || !status.storageReady) { tell('Server setup is needed before accounts can connect. The screen preview still works.'); return; }
    const { supabase } = await import('@alysum/authentication/client.js');
    const { data } = await supabase.auth.getSession();
    if (!data.session) { tell('Sign in on this test branch to connect your Stripe account.'); loginLink(); return; }
    $('stripeConnect').disabled = false;
    $('stripeConnection').textContent = status.connection ? status.connection.charges_enabled ? 'Stripe test account connected.' : 'Connected. Finish the account setup on Stripe to enable test payments.' : 'No Stripe account connected.';
    const { books } = await paymentRequest('author-books', { requireAuth: true });
    for (const book of books.filter(book => !book.published && (!book.format || book.format === 'novel'))) { const option = document.createElement('option'); option.value = book.id; option.textContent = book.title; $('paymentBook').append(option); }
    const wanted = new URLSearchParams(window.location.search).get('book');
    if (books.some(book => book.id === wanted)) $('paymentBook').value = wanted;
    $('editionCreate').disabled = !status.connection?.charges_enabled;
    tell(status.connection?.charges_enabled ? 'Ready for Stripe test payments. No real money can be charged here.' : 'Connect a Stripe test account, then choose an unpublished draft.');
    if ($('paymentBook').value) await loadBook();
}
$('stripeConnect').addEventListener('click', async () => {
    error(''); $('stripeConnect').disabled = true;
    try {
        const result = await paymentRequest('stripe-connect', { method: 'POST', body: {}, requireAuth: true });
        const target = new URL(result.url);
        if (target.origin !== 'https://connect.stripe.com') throw Error('Invalid Stripe connection address.');
        window.location.assign(target.href);
    } catch (e) { error(e.message); $('stripeConnect').disabled = false; }
});
$('paymentBook').addEventListener('change', () => { void loadBook().catch(e => error(e.message)); });
document.querySelector('.pub-page').addEventListener('change', paint);
$('editionCreate').addEventListener('click', async () => {
    error(''); $('editionCreate').disabled = true;
    try {
        const result = await paymentRequest('create-edition', { method: 'POST', requireAuth: true, body: {
            bookId: $('paymentBook').value, mode: $('editionMode').value, price: $('editionPrice').value,
            currency: $('editionCurrency').value, chapterIds: selected(), paidIds: [...document.querySelectorAll('[data-paid]:checked')].map(el => el.dataset.paid),
        } });
        const target = new URL(result.url);
        if (target.origin !== window.location.origin) throw Error('Invalid edition address.');
        $('editionResult').replaceChildren();
        const text = document.createElement('p'); text.textContent = 'Private test edition created. Anyone with this unlisted link can read the free samples. Paid chapters require a verified purchase.';
        const link = document.createElement('a'); link.href = target.href; link.textContent = 'Open private test reader';
        $('editionResult').append(text, link);
        tell('Edition saved. Your original book and Library listings are unchanged.');
    } catch (e) { error(e.message); if (e.status === 401) loginLink(); }
    finally { $('editionCreate').disabled = false; }
});
boot().catch(e => { error(e.message); if (e.status === 401) loginLink(); });

$('copyPaymentSql').addEventListener('click', async () => {
    try {
        const response = await fetch('/supabase/live-site/supabase-paid-access-test.sql', { cache: 'no-store' });
        if (!response.ok) throw Error('Could not load the SQL.');
        const sql = await response.text();
        if (!sql.includes('create table if not exists public.paid_access_accounts')) throw Error('The migration did not load correctly.');
        $('paymentSql').value = sql; $('paymentSql').hidden = false;
        try { await navigator.clipboard.writeText(sql); $('sqlCopyStatus').textContent = 'SQL copied. Run it in Supabase SQL Editor. It adds isolated payment-test tables and does not change Library or books.'; }
        catch { $('paymentSql').focus(); $('paymentSql').select(); $('sqlCopyStatus').textContent = 'Select and copy the SQL below, then run it in Supabase SQL Editor.'; }
    } catch (e) { $('sqlCopyStatus').textContent = e.message; }
});
