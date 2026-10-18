import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { canShareSnippet, shareSnippet, requestSnippetDownload, copyReadingLink } from '../../../site-appearance/js-runtime/snippet-export.js';
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
test('Save PNG requests a real HTTP attachment without a blob URL or image page', async () => {
    const previous = globalThis.document; let frame;
    globalThis.document={createElement(tag){assert.equal(tag,'iframe');return {setAttribute(){}};}};
    const mount={querySelector:()=>frame,append:value=>{frame=value;}};
    const api={prepare:async value=>{assert.equal(value,file);return {url:'https://example.test/api/snippet-download?token=ready',expiresAt:9999999999999};}};
    try {
        assert.equal(await requestSnippetDownload(file,mount,api),true);
        assert.equal(frame.hidden,true);assert.equal(frame.src,'https://example.test/api/snippet-download?token=ready');
        frame.src='newer-download';assert.equal(await requestSnippetDownload(file,mount,api,()=>false),false);assert.equal(frame.src,'newer-download');
    } finally {globalThis.document=previous;}
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
