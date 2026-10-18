import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { canShareSnippet, shareSnippet, prepareSnippetDownload, copyReadingLink } from '../../../site-appearance/js-runtime/snippet-export.js';
const file = new File(['PNG'], 'book-card.png', { type: 'image/png' });
test('native sharing starts immediately with the file; unsupported browsers can use the save fallback', async () => {
    let sent;
    const browser = { canShare: () => true, share: payload => { sent = payload; return Promise.resolve(); } };
    const promise = shareSnippet(file, browser);
    assert.deepEqual(sent, { files: [file] }); await promise;
    assert.equal(canShareSnippet(file, {}), false);
    assert.equal(shareSnippet(file, {}), null);
    assert.equal(canShareSnippet(file, { canShare() { throw Error('blocked'); }, share() {} }), false);
});
test('PNG is ready on a real link before the tap, without a picker or service worker', () => {
    const attrs = new Map([['target', '_blank'], ['aria-disabled', 'true']]);
    const link = { removeAttribute: key => attrs.delete(key), setAttribute: (key, value) => attrs.set(key, value) };
    let revoked;
    const cleanup = prepareSnippetDownload(file, link, { URL: { createObjectURL(value) { assert.equal(value, file); return 'blob:local-png'; }, revokeObjectURL: value => { revoked = value; } } });
    assert.equal(link.href, 'blob:local-png'); assert.equal(link.download, 'book-card.png');
    assert.equal(attrs.has('target'), false); assert.equal(attrs.has('aria-disabled'), false);
    assert.equal(revoked, undefined);
    cleanup(); assert.equal(revoked, 'blob:local-png'); assert.equal(attrs.get('aria-disabled'), 'true');
});
test('reading links copy with clipboard permission, legacy copy, or manual selection', async () => {
    let copied, selected = false;
    const input = { value: 'https://example.test/shared-section#token', focus() {}, select() { selected = true; }, setSelectionRange(start, end) { assert.equal(start, 0); assert.equal(end, this.value.length); } };
    assert.equal(await copyReadingLink(input, { clipboard: { writeText: async value => { copied = value; } } }, {}), true);
    assert.equal(copied, input.value);
    assert.equal(await copyReadingLink(input, { clipboard: { writeText: async () => { throw Error('Denied'); } } }, { execCommand: action => action === 'copy' }), true);
    assert.equal(selected, true);
    assert.equal(await copyReadingLink(input, {}, {}), false);
    assert.equal(await copyReadingLink(input, {}, { execCommand() { throw Error('Blocked'); } }), false);
});
