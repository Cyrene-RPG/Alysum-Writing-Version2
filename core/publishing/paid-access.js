/** Shared validation for the private Stripe sandbox integration. No simulated grants. */
export const PAID_CURRENCIES = ['usd', 'gbp', 'eur', 'cad', 'aud'];
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function amountFromPrice(value) {
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(String(value ?? '').trim())) return null;
    const [whole, cents = ''] = String(value).trim().split('.');
    const amount = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
    return amount >= 50 && amount <= 100000 ? amount : null;
}
export function validatePrivateOffer(input, chapters, complete) {
    const mode = input.mode;
    if (!['chapter', 'bundle', 'book'].includes(mode)) throw Error('Choose chapters, a bundle or a completed book.');
    if (mode === 'book' && !complete) throw Error('Mark the source book complete before creating a full-book offer.');
    const amount = amountFromPrice(input.price);
    const currency = String(input.currency || '').toLowerCase();
    if (amount === null || !PAID_CURRENCIES.includes(currency)) throw Error('Choose a supported currency and a price from 0.50 to 1,000.00.');
    if (!Array.isArray(input.chapterIds) || !input.chapterIds.length || new Set(input.chapterIds).size !== input.chapterIds.length) throw Error('Choose chapters to include in this edition.');
    const byId = new Map(chapters.map(ch => [String(ch.id), ch]));
    let selected = input.chapterIds.map(id => byId.get(id));
    if (selected.some(ch => !ch)) throw Error('A selected chapter is no longer in this book.');
    if (mode === 'book' && (selected.length !== chapters.length || !chapters.every(ch => input.chapterIds.includes(ch.id)))) throw Error('A complete-book offer must include every chapter.');
    if (mode === 'book') selected = chapters.slice();
    if (mode !== 'book' && !Array.isArray(input.paidIds)) throw Error('Choose the paid chapter set.');
    const selectedIds = selected.map(ch => String(ch.id));
    const paidIds = mode === 'book' ? selectedIds.slice(1) : selectedIds.filter(id => input.paidIds?.includes(id));
    if (!paidIds.length) throw Error('Choose at least one paid chapter.');
    if (paidIds.length === selectedIds.length) throw Error('Keep at least one chapter free as a sample.');
    return { mode, amount, currency, paidIds, chapters: selected };
}
export function offerChapterIds(offer, chapterId) {
    if (!offer.paid_chapter_ids.includes(chapterId)) throw Error('This chapter does not require a purchase.');
    return offer.mode === 'chapter' ? [chapterId] : [...offer.paid_chapter_ids];
}
export function publicEdition(offer) {
    return { id: offer.id, title: offer.title, mode: offer.mode, amount: offer.amount, currency: offer.currency,
        chapters: offer.chapters.map(ch => ({ id: ch.id, title: ch.title, paid: offer.paid_chapter_ids.includes(ch.id) })) };
}
export function canReadPrivateChapter(offer, chapterId, userId, purchases) {
    if (!offer.chapters.some(ch => ch.id === chapterId)) return false;
    if (!offer.paid_chapter_ids.includes(chapterId)) return true;
    if (!userId) return false;
    if (offer.owner_id === userId) return true;
    return purchases.some(p => p.buyer_id === userId && p.offer_id === offer.id && p.status === 'paid' && p.chapter_ids.includes(chapterId));
}
export function matchesPaidSession(order, session, account) {
    return account === order.stripe_account && session.id === order.stripe_session
        && session.livemode === false && session.mode === 'payment' && session.status === 'complete'
        && session.payment_status === 'paid' && session.amount_total === order.amount
        && session.currency === order.currency && session.client_reference_id === order.buyer_id
        && session.metadata?.order_id === order.id && session.metadata?.offer_id === order.offer_id
        && typeof session.payment_intent === 'string' && /^pi_/.test(session.payment_intent);
}
export function manuscriptPlainText(html) {
    return String(html || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|h[1-6]|blockquote)>/gi, '\n\n')
        .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}
