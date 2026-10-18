import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';
import { canShareSnippet, shareSnippet, saveSnippet } from '../../../site-appearance/js-runtime/snippet-export.js';

const file = new File(['PNG'], 'book-card.png', { type: 'image/png' });
test('image sharing sends the prepared file immediately, with no URL or delayed activation', async () => {
    let sent;
    const browser = { canShare: () => true, share: (payload) => { sent = payload; return Promise.resolve(); } };
    const promise = shareSnippet(file, browser);
    assert.deepEqual(sent, { files: [file] });
    await promise;
    assert.equal(canShareSnippet(file, {}), false);
    assert.throws(() => shareSnippet(file, {}), /cannot share image files/);
    assert.equal(canShareSnippet(file, { canShare() { throw Error('blocked'); }, share() {} }), false);
});
test('desktop save writes a PNG through the picker without opening a page', async () => {
    let written, closed = false;
    const result = await saveSnippet(file, {}, {}, { showSaveFilePicker: async ({ suggestedName }) => {
        assert.equal(suggestedName, 'book-card.png');
        return { createWritable: async () => ({ write: async (value) => { written = value; }, close: async () => { closed = true; } }) };
    } });
    assert.equal(written, file); assert.equal(closed, true); assert.equal(result, 'PNG saved.');
    await assert.rejects(saveSnippet(file, {}, {}, {}), /Reload Alysum/);
});
test('local download returns a named PNG attachment once, without network or cache storage', async () => {
    const listeners = {};
    const self = { location: { origin: 'https://alysumwriting.com' }, addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); } };
    let now = 0;
    const context = vm.createContext({ self, URL, Blob, Response, Request, Date: { now: () => now } });
    vm.runInContext(fs.readFileSync(new URL('../../../applications/main-site/public/sw.js', import.meta.url), 'utf8'), context);
    const token = '12345678-1234-1234-1234-123456789abc';
    let ack;
    const register = (origin = self.location.origin) => {
        for (const handler of listeners.message) handler({ source: { url: origin + '/editor' }, data: { type: 'ALYSUM_DOWNLOAD_PNG', token, file }, ports: [{ postMessage: value => { ack = value; } }] });
    };
    const download = async () => {
        let response;
        const event = { request: new Request(self.location.origin + '/__alysum-download/' + token), respondWith(value) { response = Promise.resolve(value); } };
        for (const handler of listeners.fetch) handler(event);
        return response;
    };
    register('https://other.test'); assert.equal(ack.ok, false);
    assert.equal((await download()).status, 410);
    register(); assert.equal(ack.ok, true);
    const response = await download();
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="book-card.png"');
    assert.equal(response.headers.get('Content-Type'), 'image/png');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), 'PNG');
    assert.equal((await download()).status, 410);
    register(); now = 60001; assert.equal((await download()).status, 410);
});
test('phone save uses a hidden local attachment frame, without opening a tab', async () => {
    const previousDocument = globalThis.document;
    let frame;
    globalThis.document = { createElement(tag) { assert.equal(tag, 'iframe'); return { setAttribute() {} }; } };
    const mount = { querySelector: () => frame, append: value => { frame = value; } };
    try {
        const browser = { serviceWorker: { controller: { postMessage({ type, file: sent }, [reply]) {
            assert.equal(type, 'ALYSUM_DOWNLOAD_PNG'); assert.equal(sent, file);
            reply.postMessage({ ok: true }); reply.close();
        } } } };
        const result = await saveSnippet(file, mount, browser, { crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' } });
        assert.equal(frame.hidden, true);
        assert.equal(frame.src, '/__alysum-download/12345678-1234-1234-1234-123456789abc');
        assert.match(result, /download started/);
    } finally { globalThis.document = previousDocument; }
});
