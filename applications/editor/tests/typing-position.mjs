import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const { JSDOM } = createRequire(import.meta.url)(process.env.JSDOM_MODULE || 'jsdom');
const sourceUrl = new URL('../page-ui/page/typing-position.js', import.meta.url);

async function load(dom) {
    const { window } = dom;
    const context = vm.createContext({
        window,
        document: window.document,
        NodeFilter: window.NodeFilter,
        localStorage: window.localStorage,
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        console,
    });
    const module = new vm.SourceTextModule(await readFile(sourceUrl, 'utf8'), {
        context,
        identifier: pathToFileURL(sourceUrl.pathname).href,
    });
    await module.link(async () => { throw new Error('unexpected import'); });
    await module.evaluate();
    return module.namespace;
}

function harness() {
    const dom = new JSDOM(
        '<div class="writer-main-scroll"><div class="writer-page" id="page" contenteditable="true"><p>Hello <strong>Iris Vale</strong> arrived.</p><p>Second paragraph here.</p></div></div>',
        { url: 'https://alysum.test/editor?book=book-1' },
    );
    return { dom, page: dom.window.document.getElementById('page') };
}

function select(page, node, start, end = start) {
    const range = page.ownerDocument.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = page.ownerDocument.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

test('caret offset round-trips through a formatted paragraph', async () => {
    const { dom, page } = harness();
    try {
        const { captureTextOffset, placeTextOffset } = await load(dom);
        const iris = page.querySelector('strong').firstChild;
        select(page, iris, 5);
        const offset = captureTextOffset(page);
        assert.equal(page.ownerDocument.defaultView.getSelection().anchorNode.textContent, 'Iris Vale');
        page.ownerDocument.defaultView.getSelection().removeAllRanges();
        assert.equal(placeTextOffset(page, offset), true);
        assert.equal(captureTextOffset(page), offset);
        assert.equal(page.ownerDocument.defaultView.getSelection().anchorNode.textContent, 'Iris Vale');
        assert.equal(page.ownerDocument.defaultView.getSelection().anchorOffset, 5);
    } finally { dom.window.close(); }
});

test('opening a chapter restores the stored caret after the html is replaced', async () => {
    const { dom, page } = harness();
    try {
        const { mountTypingPosition, captureTextOffset } = await load(dom);
        let chapterId = 'chapter-one';
        const mounted = mountTypingPosition({
            pageEl: page,
            getBookId: () => 'book-1',
            getChapterId: () => chapterId,
            storage: dom.window.localStorage,
        });
        const iris = page.querySelector('strong').firstChild;
        select(page, iris, 5);
        mounted.markReady();
        mounted.remember();
        page.innerHTML = '<p>Hello <strong>Iris Vale</strong> arrived.</p><p>Second paragraph here.</p>';
        chapterId = 'chapter-one';
        assert.equal(mounted.restore(), true);
        assert.equal(captureTextOffset(page), 11);
        assert.match(page.ownerDocument.defaultView.getSelection().anchorNode.textContent, /Iris Vale/);
    } finally { dom.window.close(); }
});

test('an unpainted editor does not overwrite a stored caret with the empty page', async () => {
    const { dom, page } = harness();
    try {
        const { mountTypingPosition, captureTextOffset, placeTextOffset } = await load(dom);
        let chapterId = 'chapter-one';
        const mounted = mountTypingPosition({
            pageEl: page,
            getBookId: () => 'book-1',
            getChapterId: () => chapterId,
            storage: dom.window.localStorage,
        });
        placeTextOffset(page, 11);
        mounted.markReady();
        mounted.remember();
        const blank = new JSDOM(
            '<div class="writer-main-scroll"><div class="writer-page" id="page" contenteditable="true"></div></div>',
            { url: 'https://alysum.test/editor?book=book-1' },
        );
        const emptyPage = blank.window.document.getElementById('page');
        const reopened = mountTypingPosition({
            pageEl: emptyPage,
            getBookId: () => 'book-1',
            getChapterId: () => chapterId,
            storage: dom.window.localStorage,
        });
        reopened.remember();
        emptyPage.innerHTML = page.innerHTML;
        assert.equal(reopened.restore(), true);
        assert.equal(captureTextOffset(emptyPage), 11);
        blank.window.close();
    } finally { dom.window.close(); }
});

test('each chapter keeps its own caret', async () => {
    const { dom, page } = harness();
    try {
        const { mountTypingPosition, captureTextOffset, placeTextOffset } = await load(dom);
        let chapterId = 'one';
        const mounted = mountTypingPosition({
            pageEl: page,
            getBookId: () => 'book-1',
            getChapterId: () => chapterId,
            storage: dom.window.localStorage,
        });
        mounted.markReady();
        placeTextOffset(page, 11);
        mounted.remember();
        chapterId = 'two';
        placeTextOffset(page, 24);
        mounted.remember();
        chapterId = 'one';
        page.innerHTML = '<p>Hello <strong>Iris Vale</strong> arrived.</p><p>Second paragraph here.</p>';
        mounted.restore();
        assert.equal(captureTextOffset(page), 11);
        chapterId = 'two';
        mounted.restore();
        assert.equal(captureTextOffset(page), 24);
    } finally { dom.window.close(); }
});
