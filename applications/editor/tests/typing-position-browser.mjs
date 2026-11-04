import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(new URL('../../../', import.meta.url).pathname);
const fixture = '/applications/editor/tests/fixtures/typing-position.html';
const server = createServer(async (req, res) => {
    try {
        const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!path.startsWith(root + '/')) throw Error();
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript' }[extname(path)] || 'application/octet-stream'));
        res.end(await readFile(path));
    } catch { res.statusCode = 404; res.end(); }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const base = 'http://127.0.0.1:' + server.address().port;
const pw = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const name = process.env.EDITOR_BROWSER || 'chromium';
const browser = await pw[name].launch();
await mkdir('test-results/typing-position', { recursive: true });
try {
    for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 720 }, isMobile: width <= 720, hasTouch: width <= 720 });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        await page.goto(base + fixture);
        await page.waitForFunction(() => window.typing);
        const saved = await page.evaluate(() => {
            const node = document.querySelector('#p22').firstChild;
            const range = document.createRange();
            range.setStart(node, 10);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.querySelector('#p22').scrollIntoView({ block: 'center' });
            window.typing.mounted.markReady();
            window.typing.mounted.remember();
            return window.typing.captureTextOffset(window.typing.page);
        });
        assert.ok(saved > 100, 'caret is stored mid-chapter');
        await page.reload();
        await page.waitForFunction((offset) => window.typing?.captureTextOffset(window.typing.page) === offset, saved);
        await page.waitForFunction(() => {
            const box = document.querySelector('#p22')?.getBoundingClientRect();
            return box && box.top < innerHeight && box.bottom > 0;
        });
        const restored = await page.evaluate(() => window.typing.captureTextOffset(window.typing.page));
        assert.equal(restored, saved);
        await page.screenshot({ path: `test-results/typing-position/${name}-${width}.png` });
        assert.deepEqual(errors, []);
        await page.close();
    }
    console.log(name + ': typing position restores on desktop and phone reopen');
} finally {
    await browser.close();
    server.close();
}
