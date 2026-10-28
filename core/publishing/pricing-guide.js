/** Advisory pricing only. Checkout prices remain author-owned in Ko-fi/Payhip. */
export const CHAPTER_PRICE_BANDS = [[1000,49],[2000,49],[4000,99],[6000,149],[8000,199],[10000,249],[15000,299],[Infinity,349]];
export const BOOK_PRICE_BANDS = [[20000,299],[50000,549],[80000,799],[120000,999],[180000,1399],[250000,1899],[Infinity,2299]];
export function priceForWords(words, bands) {
    if (!Number.isFinite(words) || words <= 0) return 0;
    return (bands.find(([limit]) => words < limit) || bands.at(-1))[1];
}
export function calculatePricing(chapterWords, { discountPercent = 20, complete = false, chapterPrices: customPrices = [] } = {}) {
    const counts = (Array.isArray(chapterWords) ? chapterWords : []).map(n => Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0);
    const chapterPrices = counts.map((n, index) => Number.isSafeInteger(customPrices[index]) && customPrices[index] >= 0 ? customPrices[index] : priceForWords(n, CHAPTER_PRICE_BANDS));
    const totalWords = counts.reduce((sum, n) => sum + n, 0);
    const chapterTotal = chapterPrices.reduce((sum, n) => sum + n, 0);
    const discount = Math.max(0, Math.min(80, Number(discountPercent) || 0));
    const suggestedBook = Math.min(priceForWords(totalWords, BOOK_PRICE_BANDS), Math.round(chapterTotal * (100 - discount) / 100));
    return { totalWords, chapterCount: counts.length, chapterPrices, chapterTotal, suggestedBook, complete, discountPercent: discount };
}
export function dollars(cents) { return '$' + (cents / 100).toFixed(2); }
