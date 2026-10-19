import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan, normalizePlan, priceInMinorUnits, paidIdsFor, makeOffer, hasTestAccess, validatePlan, isPaidAccessTest, sampleBook, readTestState, saveTestState } from '../../publishing/paid-access-test.js';
const chapters = sampleBook().sections.body;
const plan = () => ({ ...defaultPlan(), connectedProvider: 'ko-fi' });

test('test mode is unavailable on production and requires explicit opt-in on previews', () => {
    for (const hostname of ['alysumwriting.com', 'www.alysumwriting.com', 'alysum-writing-version2.pages.dev', 'evilalysum-writing-version2.pages.dev', 'branch.alysum-writing-version2.pages.dev.evil.com']) {
        assert.equal(isPaidAccessTest({ hostname, search: '?paidAccessTest=1' }), false);
    }
    for (const hostname of ['experiment-author-paid-access.alysum-writing-version2.pages.dev', 'abc123.alysum-writing-version2.pages.dev', 'localhost']) {
        assert.equal(isPaidAccessTest({ hostname, search: '?paidAccessTest=1' }), true);
        assert.equal(isPaidAccessTest({ hostname, search: '' }), false);
    }
});
test('prices use exact minor units and reject malformed, zero, negative and out-of-range prices', () => {
    assert.equal(priceInMinorUnits('0.50'), 50);
    assert.equal(priceInMinorUnits('3.1'), 310);
    assert.equal(priceInMinorUnits('1000.00'), 100000);
    for (const value of ['0', '-1', '0.49', '1.001', '1e2', '1,000', 'Infinity', '1000.01', '', null]) assert.equal(priceInMinorUnits(value), null);
});
test('free plans grant access without a payment connection', () => {
    const free = { ...defaultPlan(), mode: 'free' };
    assert.equal(validatePlan(free, { chapters, complete: false }), '');
    assert.deepEqual(paidIdsFor(free, chapters), []);
    assert.equal(hasTestAccess(free, chapters, 'sample-6'), true);
});
test('a purchase unlocks only its selected chapter and survives unrelated chapter order changes', () => {
    const individual = { ...plan(), sale: 'chapter' };
    const offer = makeOffer(individual, chapters, 'sample-3');
    assert.deepEqual(offer.chapterIds, ['sample-3']);
    assert.equal(hasTestAccess(individual, chapters, 'sample-1', []), true);
    assert.equal(hasTestAccess(individual, chapters, 'sample-3', [offer.id]), true);
    assert.equal(hasTestAccess(individual, chapters, 'sample-4', [offer.id]), false);
    assert.equal(hasTestAccess(individual, [...chapters].reverse(), 'sample-3', [offer.id]), true);
});
test('bundle purchase unlocks every included paid chapter and never an unrelated bundle', () => {
    const bundle = plan();
    const offer = makeOffer(bundle, chapters, 'sample-3');
    assert.deepEqual(offer.chapterIds, ['sample-3','sample-4','sample-5','sample-6']);
    assert.equal(hasTestAccess(bundle, chapters, 'sample-6', [offer.id]), true);
    assert.equal(hasTestAccess({ ...bundle, price: '4.00' }, chapters, 'sample-6', [offer.id]), false);
    assert.equal(hasTestAccess({ ...bundle, provider: 'paypal' }, chapters, 'sample-6', [offer.id]), false);
});
test('completed-book sales preserve a free sample and cannot be enabled for an unfinished work', () => {
    const book = { ...plan(), mode: 'book' };
    assert.match(validatePlan(book, { chapters, complete: false }), /complete/);
    assert.equal(validatePlan(book, { chapters, complete: true }), '');
    assert.equal(makeOffer(book, chapters, 'sample-1'), null);
    const offer = makeOffer(book, chapters, 'sample-2');
    assert.equal(hasTestAccess(book, chapters, 'sample-6', [offer.id]), true);
});
test('unposted chapters are not included and missing price, provider, selection prevent preview', () => {
    assert.deepEqual(paidIdsFor(plan(), chapters.slice(0,3)), ['sample-3']);
    assert.match(validatePlan(plan(), { chapters: [], complete: false }), /at least one/);
    assert.match(validatePlan({ ...plan(), paidIds: [] }, { chapters, complete: false }), /paid chapter/);
    assert.match(validatePlan({ ...plan(), price: '0' }, { chapters, complete: false }), /price/);
    assert.match(validatePlan({ ...plan(), provider: 'paypal' }, { chapters, complete: false }), /Connect/);
});
test('corrupt local test state recovers, writes are isolated, storage failure is surfaced', () => {
    assert.deepEqual(normalizePlan(null), defaultPlan());
    const data = new Map([['alysum:books', 'untouched']]);
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    saveTestState(storage, { plan: plan(), grants: ['test-only'] });
    assert.deepEqual(readTestState(storage).grants, ['test-only']);
    assert.equal(data.get('alysum:books'), 'untouched');
    assert.deepEqual(readTestState({ getItem: () => 'bad json' }).plan, defaultPlan());
    assert.throws(() => saveTestState({ setItem() { throw Error('quota'); } }, { plan: plan() }), /quota/);
});
