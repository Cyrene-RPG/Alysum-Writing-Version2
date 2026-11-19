import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceCounter } from '../../community/word-war-count.js';

const T0 = 1_000_000;
const at = seconds => T0 + seconds * 1000;

test('typing under the limit counts word for word', () => {
    const counter = createRaceCounter({ startWords: 5000, targetWords: 1000, startsAtMs: T0 });
    let state;
    for (let s = 1; s <= 60; s += 1) state = counter.update(5000 + s, at(s));
    assert.deepEqual(state, { raw: 60, counted: 60, isOverLimit: false });
});

test('a count can not rise faster than 150 words a minute', () => {
    const counter = createRaceCounter({ startWords: 0, targetWords: 1000, startsAtMs: T0 });
    assert.equal(counter.update(500, at(10)).counted, 20, 'a pause banks at most 20 words');
    assert.equal(counter.update(500, at(70)).counted, 40);
    assert.equal(counter.update(500, at(70)).isOverLimit, true);
});

test('picking a race back up carries on from the count the server has', () => {
    // 300 words written, the page reloads ten minutes in.
    const counter = createRaceCounter({ startWords: 5000, targetWords: 1000, startsAtMs: T0, countedWords: 300 });
    assert.deepEqual(counter.update(5300, at(600)), { raw: 300, counted: 300, isOverLimit: false });
    assert.deepEqual(counter.update(5302, at(602)), { raw: 302, counted: 302, isOverLimit: false });
    // Without it the count restarts and climbs back at the speed limit.
    const restarted = createRaceCounter({ startWords: 5000, targetWords: 1000, startsAtMs: T0 });
    assert.equal(restarted.update(5300, at(600)).counted, 20);
});

test('picking a race back up never credits more than the book holds, or a fresh burst', () => {
    const fewer = createRaceCounter({ startWords: 5000, targetWords: 1000, startsAtMs: T0, countedWords: 300 });
    assert.equal(fewer.update(5250, at(600)).counted, 250, 'words deleted since are not counted');
    const behind = createRaceCounter({ startWords: 5000, targetWords: 1000, startsAtMs: T0, countedWords: 300 });
    assert.deepEqual(behind.update(5400, at(600)), { raw: 400, counted: 300, isOverLimit: true }, 'no 20-word burst on reload');
    assert.equal(behind.update(5400, at(602)).counted, 305, 'then the usual 2.5 words a second');
});

test('pasted words, and words merged in from another device, stay out of the count', () => {
    const counter = createRaceCounter({ startWords: 100, pastedWords: 40, targetWords: 1000, startsAtMs: T0 });
    assert.equal(counter.update(150, at(60)).counted, 10);
    counter.shift(500); // another device added 500 words to a different chapter
    assert.equal(counter.update(650, at(61)).counted, 10);
    counter.shift(-200); // and later removed 200
    assert.equal(counter.update(450, at(62)).counted, 10);
    assert.equal(counter.pastedWords, 340);
    const reopened = createRaceCounter({ startWords: 100, pastedWords: -30, targetWords: 1000, startsAtMs: T0, countedWords: 10 });
    assert.equal(reopened.update(80, at(63)).counted, 10, 'a kept adjustment below zero still works');
});
