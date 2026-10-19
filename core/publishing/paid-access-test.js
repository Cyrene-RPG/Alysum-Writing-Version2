// Prototype only. This module never creates payments or production entitlements.
export const TEST_BOOK_ID = 'paid-access-sample';
const SETTINGS_KEY = 'alysum:paid-access-test:v1';
export const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'];
export const PROVIDERS = ['ko-fi', 'paypal'];
export function isPaidAccessTest(location) {
    const host = location.hostname;
    const allowed = host === 'localhost' || host === '127.0.0.1'
        || /^[a-z0-9-]+\.alysum-writing-version2\.pages\.dev$/.test(host);
    return allowed && new URLSearchParams(location.search).get('paidAccessTest') === '1';
}
export function priceInMinorUnits(value) {
    const text = String(value ?? '').trim();
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return amount >= 50 && amount <= 100000 ? amount : null;
}
export function money(minor, currency = 'USD') {
    return new Intl.NumberFormat('en', { style: 'currency', currency: CURRENCIES.includes(currency) ? currency : 'USD' }).format(minor / 100);
}
export function defaultPlan() {
    return { mode: 'chapters', sale: 'bundle', provider: 'ko-fi', connectedProvider: '', price: '3.00', currency: 'USD', paidIds: ['sample-3', 'sample-4', 'sample-5', 'sample-6'] };
}
export function normalizePlan(raw = {}) {
    raw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const base = defaultPlan();
    return {
        mode: ['free', 'chapters', 'book'].includes(raw.mode) ? raw.mode : base.mode,
        sale: raw.sale === 'chapter' ? 'chapter' : 'bundle',
        provider: PROVIDERS.includes(raw.provider) ? raw.provider : base.provider,
        connectedProvider: PROVIDERS.includes(raw.connectedProvider) ? raw.connectedProvider : '',
        price: typeof raw.price === 'string' ? raw.price.slice(0, 16) : base.price,
        currency: CURRENCIES.includes(raw.currency) ? raw.currency : base.currency,
        paidIds: Array.isArray(raw.paidIds) ? [...new Set(raw.paidIds.filter(id => typeof id === 'string').slice(0, 1000))] : base.paidIds,
    };
}
export function paidIdsFor(plan, chapters) {
    if (plan.mode === 'free') return [];
    const ids = chapters.map(ch => ch.id);
    return plan.mode === 'book' ? ids.slice(1) : ids.filter(id => plan.paidIds.includes(id));
}
export function validatePlan(plan, { chapters, complete }) {
    if (!chapters.length) return 'Choose at least one chapter to preview.';
    if (plan.mode === 'free') return '';
    if (plan.mode === 'book' && !complete) return 'Mark this work complete to sell the full book.';
    if (!paidIdsFor(plan, chapters).length) return 'Choose at least one paid chapter. Keep a chapter free for readers to try.';
    if (priceInMinorUnits(plan.price) === null) return 'Enter a price from 0.50 to 1,000.00, with up to two decimal places.';
    if (plan.provider !== plan.connectedProvider) return 'Connect your chosen provider for this test.';
    return '';
}
export function makeOffer(plan, chapters, chapterId) {
    const paid = paidIdsFor(plan, chapters);
    if (!paid.includes(chapterId)) return null;
    const chapterOnly = plan.mode === 'chapters' && plan.sale === 'chapter';
    return {
        id: `${plan.mode}:${chapterOnly ? chapterId : paid.join(',')}:${plan.provider}:${plan.currency}:${priceInMinorUnits(plan.price)}`,
        chapterIds: chapterOnly ? [chapterId] : paid,
        title: plan.mode === 'book' ? 'Complete book' : chapterOnly ? chapters.find(ch => ch.id === chapterId)?.title : `${paid.length} chapter bundle`,
        amount: priceInMinorUnits(plan.price), currency: plan.currency, provider: plan.provider,
    };
}
export function hasTestAccess(plan, chapters, chapterId, grants = []) {
    const offer = makeOffer(plan, chapters, chapterId);
    return !offer || grants.includes(offer.id);
}
export function sampleBook() {
    const titles = ['The harbour bell', 'A letter without a name', 'Beyond the breakwater', 'The keeper’s door', 'What the tide returned', 'The last light'];
    const scenes = [
        'Mara reached the harbour before the market opened. A single bell sounded from the lighthouse, though its keeper had left three winters ago. She waited for a second note. None came.',
        'The letter lay beneath a blue stone on her doorstep. There was no stamp and no name. Inside, someone had drawn the old sea road and marked a place that had disappeared beneath the water.',
        'At low tide, a narrow path emerged beyond the breakwater. Mara followed it with her boots in one hand. The island ahead was closer than the maps had ever shown.',
        'The keeper’s door opened before she knocked. Warm light fell across the steps. On the table stood two cups, and beside them lay the compass she had lost as a child.',
        'By morning the tide had returned a small wooden boat. Its paint was new, its sail dry. Mara recognised the knot at the stern: her father had taught her to tie it.',
        'She lit the lamp at sunset. Out in the harbour, one boat turned toward home. The bell rang once, and this time she knew who had been listening.'
    ];
    return {
        id: TEST_BOOK_ID, title: 'The Lighthouse Letters', _author: 'Alysum sample author',
        sections: { front: [], body: titles.map((title, i) => ({ id: `sample-${i + 1}`, title, content: `<p>${scenes[i]}</p>`, wordCount: scenes[i].split(/\s+/).length })), back: [] },
        publish_meta: { author: 'Alysum sample author', synopsis: 'A letter leads Mara back to an abandoned lighthouse.', genres: ['fantasy'], rating: 'general', complete: false, draftChapterIds: titles.map((_, i) => `sample-${i + 1}`) },
    };
}
export function readTestState(storage) {
    try { const raw = JSON.parse(storage.getItem(SETTINGS_KEY) || '{}') || {}; return { ...raw, plan: normalizePlan(raw.plan) }; }
    catch { return { plan: defaultPlan() }; }
}
export function saveTestState(storage, state) {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...state, plan: normalizePlan(state.plan) }));
}
