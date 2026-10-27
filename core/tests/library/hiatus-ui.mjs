import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mountBookHiatus } from '../../../applications/library/page-ui/hiatus.js';
const { JSDOM } = await import(process.env.JSDOM_MODULE || 'jsdom');
const html = await readFile(new URL('../../../applications/library/pages/book.html', import.meta.url), 'utf8');
test('reader warning, author controls, current status, focus and visible failures', async () => {
    const dom = new JSDOM(html, { url: 'https://example.test/book?id=book' });
    const previous = { document: globalThis.document, window: globalThis.window };
    globalThis.document = dom.window.document;
    const visits = [];
    globalThis.window = { location: { assign: href => visits.push(href) } };
    try {
        const el = id => document.getElementById(id);
        const dialog = el('bookHiatusDialog');
        dialog.showModal = () => { dialog.open = true; };
        dialog.close = () => { dialog.open = false; };
        const cta = el('readCta');
        cta.href = '/read?id=book&chapter=one';
        let status = { isOnHiatus: false, canManage: true, isComplete: false, lastAuthorUpdate: '2026-09-01T14:35:00Z' };
        let failSave = false, failRead = false;
        const client = { async rpc(name, args) {
            if (name === 'set_book_hiatus') {
                if (failSave) return { error: { message: 'Save failed.' } };
                status.isOnHiatus = args.p_on_hiatus;
            } else if (failRead) return { error: { message: 'offline' } };
            return { data: { ...status } };
        } };
        const tick = () => new Promise(resolve => setImmediate(resolve));
        await mountBookHiatus({ client, work: { id: 'book' } });
        assert.equal(el('bookHiatusToggle').hidden, false);
        el('bookHiatusToggle').click(); await tick();
        assert.equal(status.isOnHiatus, true);
        assert.equal(el('bookHiatusToggle').textContent, 'Resume book');
        cta.click(); await tick();
        assert.equal(dialog.open, true);
        assert.match(el('bookHiatusDialogMessage').textContent, /September 1, 2026/);
        assert.equal(document.activeElement, el('bookHiatusCancel'));
        assert.equal(el('bookHiatusContinue').href, cta.href);
        el('bookHiatusCancel').click();
        assert.equal(dialog.open, false);
        failSave = true;
        el('bookHiatusToggle').click(); await tick();
        assert.equal(status.isOnHiatus, true);
        assert.match(el('bookHiatusFeedback').textContent, /Save failed/);
        assert.equal(el('bookHiatusToggle').disabled, false);
        failRead = true;
        cta.click(); await tick();
        assert.equal(dialog.open, false);
        assert.equal(visits.length, 0);
        assert.match(el('bookHiatusFeedback').textContent, /Could not check/);
        failRead = false;
        status = { ...status, canManage: false, isOnHiatus: false };
        cta.click(); await tick();
        assert.deepEqual(visits, [cta.href]);
        assert.equal(el('bookHiatusToggle').hidden, true);
        // An externally changed hiatus is picked up at the next reading attempt.
        status.isOnHiatus = true;
        cta.click(); await tick();
        assert.equal(dialog.open, true);
        assert.equal(el('bookHiatusToggle').hidden, true);
    } finally {
        dom.window.close();
        if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
        if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    }
});
