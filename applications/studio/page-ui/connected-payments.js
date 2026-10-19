import { paymentRequest } from '/core/publishing/payments-client.js';
const $ = id => document.getElementById(id);
let ready = false;
let loadingChapters = false;
let complete = false;
let published = false;
let publishing = false;
let bookLoad = 0;
function tell(message) { $('paymentStatus').textContent = message; }
function error(message) { $('paymentError').textContent = message; $('paymentError').hidden = !message; }
function loginLink() {
    const destination = window.location.pathname + window.location.search;
    $('paymentLogin').href = `/login?next=${encodeURIComponent(destination)}`;
    $('paymentLogin').hidden = false;
}
function selected() { return [...document.querySelectorAll('[data-include]:checked')].map(el => el.dataset.include); }
function paint() {
    const book = $('paymentBook').value;
    const whole = $('editionMode').value === 'book';
    $('paidChapterPicker').hidden = whole || !book || loadingChapters;
    $('bookSampleNote').hidden = !whole || !book;
    $('completeBookNote').hidden = !loadingChapters && !(whole && book && !complete);
    $('completeBookNote').textContent = loadingChapters ? 'Loading chapters…' : 'Mark this book complete on its publishing page before selling it as a finished book.';
    $('editionCreate').disabled = !ready || publishing || loadingChapters || !book || !selected().length || (whole && !complete) || published;
    $('editionPriceLabel').textContent = $('editionMode').value === 'chapter' ? 'Price per chapter' : whole ? 'Book price' : 'Bundle price';
    document.querySelectorAll('[data-paid]').forEach(input => {
        input.closest('label').querySelector('small').textContent = input.checked ? 'Paid' : 'Free';
    });
}
async function loadBook() {
    const version = ++bookLoad;
    const bookId = $('paymentBook').value;
    complete = false; published = false;
    $('editionChapters').replaceChildren(); $('paidChapters').replaceChildren();
    loadingChapters = Boolean(bookId); paint();
    if (!bookId) return;
    try {
        const result = await paymentRequest('author-book', { query: { book: bookId }, requireAuth: true });
        if (version !== bookLoad) return;
        complete = result.complete;
        for (const [index, chapter] of result.chapters.entries()) {
            const included = document.createElement('input'); included.type = 'checkbox'; included.dataset.include = chapter.id; included.checked = true;
            $('editionChapters').append(included);
            const label = document.createElement('label');
            const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.paid = chapter.id; input.checked = index > 0;
            const name = document.createElement('span'); name.textContent = chapter.title;
            const state = document.createElement('small');
            label.append(input,name,state); $('paidChapters').append(label);
        }
    } finally { if (version === bookLoad) { loadingChapters = false; paint(); } }
}
async function boot() {
    const status = await paymentRequest('status');
    if (!status.configured || !status.storageReady) {
        $('availabilityTitle').textContent = 'Paid publishing isn’t available yet';
        tell('Alysum needs a one-time payment setup before authors can connect their accounts.');
        $('ownerSetupLink').hidden = false;
        return;
    }
    const { supabase } = await import('@alysum/authentication/client.js');
    const { data } = await supabase.auth.getSession();
    if (!data.session) { $('availabilityTitle').textContent = 'Sign in to connect your payment account'; tell('Your books and purchases will be linked to your Alysum account.'); loginLink(); return; }
    $('paymentAvailability').hidden = status.livemode;
    if (!status.livemode) { $('availabilityTitle').textContent = 'Sandbox mode'; tell('This environment uses test payments only.'); }
    $('connectCard').hidden = false;
    const connected = Boolean(status.connection?.charges_enabled);
    $('stripeConnection').textContent = connected ? 'Stripe connected. Payments will go directly to your account.' : status.connection ? 'Finish the account setup on Stripe before you publish paid work.' : 'Connect the account where you want to receive payments.';
    $('stripeConnect').hidden = connected;
    if (status.connection && !connected) $('stripeConnect').textContent = 'Finish connecting Stripe';
    const editions = await paymentRequest('account-editions', { requireAuth: true });
    for (const [id, rows] of [['createdEditions', editions.created], ['purchasedEditions', editions.purchased]]) {
        const root = $(id); root.replaceChildren();
        if (!rows.length) root.textContent = id === 'createdEditions' ? 'No paid books yet.' : 'No purchases yet.';
        for (const edition of rows) {
            const paragraph = document.createElement('p'); const link = document.createElement('a'); link.className = 'payment-back';
            link.href = `/applications/library/pages/paid-read?edition=${encodeURIComponent(edition.id)}`;
            link.textContent = edition.title; paragraph.append(link); root.append(paragraph);
        }
    }
    $('yourEditions').hidden = false;
    if (!connected) return;
    ready = true; $('publishCard').hidden = false;
    const { books } = await paymentRequest('author-books', { requireAuth: true });
    const eligible = books.filter(book => !book.published && (!book.format || book.format === 'novel'));
    for (const book of eligible) { const option = document.createElement('option'); option.value = book.id; option.textContent = book.title; $('paymentBook').append(option); }
    const wanted = new URLSearchParams(window.location.search).get('book');
    if (eligible.some(book => book.id === wanted)) $('paymentBook').value = wanted;
    if (!eligible.length) { error('You need an unpublished saved book before you can publish paid chapters.'); }
    else if (wanted && !eligible.some(book => book.id === wanted)) { error('This book is already public or uses an unsupported format. Paid publishing currently supports unpublished novels.'); }
    await loadBook();
}
$('stripeConnect').addEventListener('click', async () => {
    error(''); $('stripeConnect').disabled = true;
    try {
        const result = await paymentRequest('stripe-connect', { method: 'POST', body: {}, requireAuth: true });
        const target = new URL(result.url);
        if (target.origin !== 'https://connect.stripe.com') throw Error('Could not open the Stripe connection.');
        window.location.assign(target.href);
    } catch (e) { error(e.message); $('stripeConnect').disabled = false; }
});
$('paymentBook').addEventListener('change', () => { error(''); void loadBook().catch(e => error(e.message)); });
$('publishCard').addEventListener('input', () => { published = false; paint(); });
$('publishCard').addEventListener('change', () => { published = false; paint(); });
$('editionCreate').addEventListener('click', async () => {
    if (publishing) return;
    error(''); publishing = true; $('paidBookFields').disabled = true; paint();
    try {
        const result = await paymentRequest('create-edition', { method: 'POST', requireAuth: true, body: {
            bookId: $('paymentBook').value, mode: $('editionMode').value, price: $('editionPrice').value,
            currency: $('editionCurrency').value, chapterIds: selected(), paidIds: [...document.querySelectorAll('[data-paid]:checked')].map(el => el.dataset.paid),
        } });
        const target = new URL(result.url);
        if (target.origin !== window.location.origin) throw Error('Could not open the published book.');
        $('editionResult').replaceChildren();
        const text = document.createElement('p'); text.textContent = 'Published. Share this link with your readers.';
        const link = document.createElement('a'); link.className = 'payment-back'; link.href = target.href; link.textContent = 'Open your paid book';
        $('editionResult').append(text, link); published = true;
    } catch (e) { error(e.message); if (e.status === 401) loginLink(); }
    finally { publishing = false; $('paidBookFields').disabled = false; paint(); }
});
boot().catch(e => { $('availabilityTitle').textContent = 'Payments couldn’t be loaded'; tell('Please try again.'); error(e.message); if (e.status === 401) loginLink(); });
