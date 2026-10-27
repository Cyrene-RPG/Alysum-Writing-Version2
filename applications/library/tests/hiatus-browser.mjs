import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const source = await readFile(resolve(root, 'applications/library/pages/book.html'), 'utf8');
const fixture = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('</body>', `
<script type="module">
import { mountBookHiatus } from '/applications/library/page-ui/hiatus.js';
const owner = new URLSearchParams(location.search).has('owner');
window.model = { isOnHiatus: !owner, canManage: owner, isComplete: false, lastAuthorUpdate: '2026-09-01T14:35:00Z' };
window.failRead = false; window.failSave = false; window.active = true;
const client = { async rpc(name, args) {
 if (window.failRead && name === 'get_book_hiatus') return { error: { message: 'offline' } };
 if (name === 'set_book_hiatus') {
  if (window.failSave) return { error: { message: 'Could not save hiatus status.' } };
  window.model.isOnHiatus = args.p_on_hiatus;
 }
 return { data: { ...window.model } };
} };
document.getElementById('bookPage').hidden = false;
document.getElementById('bookTitle').textContent = 'The Quiet Harbor';
document.getElementById('readCta').href = '/read?id=book&chapter=one';
await mountBookHiatus({ client, work: { id: 'book' }, isActive: () => window.active });
window.mounted = true;
</script></body>`);
const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(fixture); return; }
    if (url.pathname === '/read') { res.end('Reading chapter one'); return; }
    const aliases = { '/css/library/book.css': 'applications/library/library-css/book.css', '/css/workspace-nav.css': 'applications/studio/studio-css/workspace-nav.css' };
    const path = resolve(root, aliases[url.pathname] || url.pathname.slice(1));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
        const data = await readFile(path);
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(path)] || 'application/octet-stream');
        res.end(data);
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const screenshots = process.env.HIATUS_SCREENSHOTS || 'test-results/hiatus';
await mkdir(screenshots, { recursive: true });
try {
    for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.goto(base);
        await page.waitForFunction(() => window.mounted);
        assert.equal(await page.locator('#bookHiatusToggle').isVisible(), false);
        await page.locator('#readCta').click();
        assert.equal(await page.locator('#bookHiatusDialog').evaluate(el => el.open), true);
        assert.match(await page.locator('#bookHiatusDialogMessage').innerText(), /September 1, 2026/);
        assert.equal(await page.locator('#bookHiatusCancel').evaluate(el => el === document.activeElement), true);
        const box = await page.locator('#bookHiatusDialog').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width);
        await page.screenshot({ path: `${screenshots}/reader-${width}.png` });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#bookHiatusDialog').evaluate(el => el.open), false);
        await page.locator('#readCta').click();
        await page.locator('#bookHiatusContinue').click();
        await page.waitForURL('**/read?id=book&chapter=one');
        await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${base}/?owner=1`);
    await page.waitForFunction(() => window.mounted);
    await page.locator('#bookHiatusToggle').click();
    assert.match(await page.locator('#bookHiatusFeedback').innerText(), /now on hiatus/);
    assert.equal(await page.locator('#bookHiatusToggle').innerText(), 'Resume book');
    await page.reload();
    await page.waitForFunction(() => window.mounted);
    // Failed writes retain the current state and an actionable error.
    await page.evaluate(() => { window.failSave = true; });
    await page.locator('#bookHiatusToggle').click();
    assert.match(await page.locator('#bookHiatusFeedback').innerText(), /Could not save/);
    assert.equal(await page.locator('#bookHiatusToggle').innerText(), 'Put book on hiatus');
    // Status is checked at click time; failed reads cannot silently bypass warnings.
    await page.evaluate(() => { window.failRead = true; });
    await page.locator('#readCta').click();
    assert.equal(page.url(), `${base}/?owner=1`);
    assert.match(await page.locator('#bookHiatusFeedback').innerText(), /Could not check/);
    await page.evaluate(() => { window.failRead = false; window.model.isOnHiatus = true; });
    await page.locator('#readCta').click();
    assert.equal(await page.locator('#bookHiatusDialog').evaluate(el => el.open), true);
    await page.locator('#bookHiatusCancel').click();
    await page.evaluate(() => { window.model.isOnHiatus = false; });
    await page.locator('#readCta').click();
    await page.waitForURL('**/read?id=book&chapter=one');
    console.log('Hiatus browser checks passed: desktop/mobile warning, focus, dismissal, continuation, author actions, and errors.');
} finally { await browser.close(); server.close(); }
