import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePricing, priceForWords, CHAPTER_PRICE_BANDS } from '../../publishing/pricing-guide.js';

test('chapter bands are word-based', () => {
    assert.equal(priceForWords(3500, CHAPTER_PRICE_BANDS), 99);
    assert.equal(priceForWords(6500, CHAPTER_PRICE_BANDS), 199);
});
test('whole-book suggestion is capped below separate chapters', () => {
    const result = calculatePricing(Array(25).fill(4000));
    assert.equal(result.totalWords, 100000);
    assert.equal(result.chapterTotal, 3725);
    assert.equal(result.suggestedBook, 999);
});
test('handles empty, invalid and serialized selections', () => {
    assert.equal(calculatePricing([]).suggestedBook, 0);
    const result = calculatePricing([2000, NaN, -20], { discountPercent: 200, complete: false });
    assert.equal(result.chapterCount, 3);
    assert.equal(result.totalWords, 2000);
    assert.equal(result.discountPercent, 80);
    assert.equal(result.complete, false);
});
