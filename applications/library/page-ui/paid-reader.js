import { supabase } from '@alysum/authentication/client.js';
import { paymentRequest } from '/core/publishing/payments-client.js';
import { mountReaderThemes } from './reader-theme.js?v=6';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
let edition;
let index = 0;
let generation = 0;
function money(amount, currency) { return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100); }
function showMessage(message) { $('chapterBody').textContent = message; }
function login() { const link = document.createElement('a'); link.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`; link.textContent = 'Sign in to restore your purchase'; return link; }
function gate(chapter, requiresSignIn) {
 const root=$('chapterBody');root.replaceChildren();const heading=document.createElement('h2');heading.textContent='Earlier purchase access';
 const note=document.createElement('p');note.textContent='New purchases use Purchase Passes. If you already bought this chapter, sign in to the account that owns it.';root.append(heading,note);
 if(requiresSignIn)root.append(login());const link=document.createElement('a');link.href='/purchase-passes?view=reader';link.textContent='Open Purchase Passes';root.append(link);
}
async function render() {
    const turn = ++generation;
    const chapter = edition.chapters[index];
    $('chapterTitle').textContent = chapter.title;
    $('chapterMeta').textContent = chapter.paid ? 'Paid chapter' : 'Free sample';
    $('pickerLabel').textContent = `Chapter ${index + 1} of ${edition.chapters.length}`;
    $('prevBtn').disabled = index === 0;
    $('nextBtn').disabled = index === edition.chapters.length - 1;
    $('chapterPicker').hidden = true;
    $('readerScroll').scrollTop = 0;
    const url = new URL(window.location.href); url.searchParams.set('chapter',chapter.id); history.replaceState(null,'',url.pathname + url.search);
    showMessage('Checking reading access…');
    try {
        const result = await paymentRequest('chapter', { query:{ edition: edition.id, chapter: chapter.id } });
        if (turn !== generation) return;
        const body = $('chapterBody'); body.replaceChildren();
        for (const paragraph of result.chapter.text.split(/\n{2,}/)) { const p = document.createElement('p'); p.textContent = paragraph; p.style.whiteSpace = 'pre-wrap'; body.append(p); }
    } catch (error) {
        if (turn !== generation) return;
        if (error.status === 402) gate(chapter, error.data.requiresSignIn);
        else { showMessage(error.message); if (error.status === 401) $('chapterBody').append(login()); }
    }
}
async function confirmPurchase() {
    const order = params.get('order');
    if (!order) return;
    const banner = document.querySelector('.access-test-banner');
    try {
        const result = await paymentRequest('confirm', { method:'POST', requireAuth:true, body:{order} });
        banner.firstChild.textContent = result.status === 'paid' ? 'Purchase verified · Access restored to your Alysum account' : result.status === 'reversed' ? 'Purchase refunded or disputed · Paid access removed' : 'Payment verification pending · Retry after completing checkout';
        if (['paid','reversed'].includes(result.status)) {
            const clean = new URL(window.location.href); clean.searchParams.delete('order'); history.replaceState(null,'',clean.pathname + clean.search);
        }
        if (result.status === 'pending') {
            const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Check payment again';
            retry.addEventListener('click', async () => { retry.remove(); await confirmPurchase(); await render(); }); banner.append(retry);
        }
    } catch (error) { banner.firstChild.textContent = error.message; }
}
function bindSettings() {
    let size = 100;
    const drawer = open => { $('settingsDrawer').hidden = !open; $('settingsScrim').hidden = !open; $('settingsBtn').setAttribute('aria-expanded',String(open)); };
    $('settingsBtn').addEventListener('click', () => drawer($('settingsDrawer').hidden));
    $('settingsClose').addEventListener('click', () => drawer(false)); $('settingsScrim').addEventListener('click', () => drawer(false));
    const adjust = delta => { size = Math.min(140,Math.max(80,size + delta)); document.documentElement.style.setProperty('--reader-size',`${19 * size / 100}px`); $('sizeLabel').textContent = `${size}%`; };
    $('sizeDown').addEventListener('click', () => adjust(-10)); $('sizeUp').addEventListener('click', () => adjust(10));
    for (const [id, attribute, name] of [['facePills','data-face','readerFace'],['spaceSegs','data-space','readerSpace']]) $(id).addEventListener('click', event => { const choice = event.target.closest(`[${attribute}]`); if (!choice) return; document.documentElement.dataset[name] = choice.getAttribute(attribute); $(id).querySelectorAll('button').forEach(button => button.classList.toggle('is-on',button === choice)); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { drawer(false); $('chapterPicker').hidden = true; } });
}
async function boot() {
    bindSettings();
    $('readerRoot').hidden = false;
    $('readerEnd').hidden = true;
    $('bookmarkBtn').hidden = true; // Private editions do not enter the public Library's bookmark store.
    $('progressPct').hidden = true;
    $('readerBack').href = '/purchase-passes?view=reader';
    const banner = document.createElement('div'); banner.className = 'access-test-banner';
    const label = document.createElement('span'); label.textContent = params.get('payment') === 'canceled' ? 'Checkout canceled · No reading access granted' : 'Checking secure reading access…'; banner.append(label); $('readerRoot').querySelector('.reader-bar').after(banner);
    const result = await paymentRequest('edition', { query:{edition: params.get('edition') || ''} });
    edition = result.edition;
    if (!params.get('payment')) label.textContent = 'Earlier purchase · Your reading access is preserved';
    if (!edition.chapters.length) throw Error('This edition has no chapters.');
    $('bookTitle').textContent = edition.title; document.title = `${edition.title} — Alysum`;
    mountReaderThemes($('themeSwatches'), { id: edition.id });
    index = Math.max(0,edition.chapters.findIndex(ch => ch.id === params.get('chapter')));
    for (const [i, chapter] of edition.chapters.entries()) { const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role','option'); button.textContent = `${chapter.title} · ${chapter.paid ? 'Paid' : 'Free'}`; button.addEventListener('click', () => { index = i; void render(); }); $('chapterPicker').append(button); }
    $('pickerBtn').addEventListener('click', () => { $('chapterPicker').hidden = !$('chapterPicker').hidden; });
    $('prevBtn').addEventListener('click', () => { if (index > 0) { index--; void render(); } });
    $('nextBtn').addEventListener('click', () => { if (index < edition.chapters.length - 1) { index++; void render(); } });
    supabase.auth.onAuthStateChange(event => {
        if (!['SIGNED_OUT','SIGNED_IN'].includes(event) || !edition) return;
        generation++; showMessage('Checking reading access…');
        setTimeout(() => { void render(); }, 0);
    });
    await confirmPurchase(); await render();
}
boot().catch(error => { $('readerRoot').hidden = true; $('readerEmpty').hidden = false; $('readerEmpty').querySelector('p').textContent = error.message; $('emptyBack').href = '/purchase-passes?view=reader'; $('emptyBack').textContent = 'Your purchased books'; });
