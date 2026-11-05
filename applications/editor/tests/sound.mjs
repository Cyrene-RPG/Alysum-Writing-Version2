import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(new URL('../../../', import.meta.url).pathname);
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/editor/snippets.css">
<link rel="stylesheet" href="/css/editor/sound.css">
<style>
:root{--text:#eee;--muted:#aaa;--accent:#8047c8;--border:#444;--alysum-ui-panel:#191919;--alysum-ui-raised:#292929}
body{margin:0;background:#111;color:#eee;font-family:Arial,sans-serif}
.writer-main-scroll{display:flex;flex-direction:column;height:100vh;overflow:hidden}
.writer-editor-actions{display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px;flex-shrink:0}
.writer-page{flex:1;min-height:0;overflow:auto}
html.is-typewriter .writer-editor-actions{display:none!important}
</style></head><body>
<div class="writer-main-scroll" id="writerWritePane">
<div class="writer-editor-actions" id="editorActionRow">
  <div class="snippet-editor-action" id="editorActions">
    <button type="button" id="break-reminders" class="quote-button">Break reminders</button>
    <button type="button" id="editorSound" class="quote-button" aria-expanded="false" aria-controls="editorSoundPanel">Sound</button>
  </div>
  <button type="button" id="focusMode" class="quote-button">Focus mode</button>
</div>
<div class="writer-page" id="pageEditor" contenteditable="true">Draft</div>
</div>
<script type="module">
import {mountEditorSound} from '/js/editor/sound.js';
import {mountKeyboardViewport} from '/js/editor/page/keyboard-viewport.js';
window.sound = mountEditorSound({actions: document.getElementById('editorActions')});
window.keyboard = mountKeyboardViewport({
  pageEl: document.getElementById('pageEditor'),
  isPhone: () => matchMedia('(max-width: 720px)').matches,
});
window.ready = true;
</script></body></html>`;

const redirectRules = (await readFile(resolve(root, '_redirects'), 'utf8'))
    .split('\n').map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 3 && parts[2] === '200');

function staticPath(path) {
    for (const [source, target] of redirectRules) {
        if (source === path) return target;
        if (source.endsWith('*') && path.startsWith(source.slice(0, -1))) {
            return target.replace(':splat', path.slice(source.length - 1));
        }
    }
    return path;
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/fixture') {
            res.setHeader('Content-Type', 'text/html');
            res.end(fixture);
            return;
        }
        let path = staticPath(url.pathname);
        path = resolve(root, '.' + path);
        if (!path.startsWith(root + '/')) throw new Error('Outside fixture');
        const content = await readFile(path);
        res.setHeader('Content-Type', ({
            '.css': 'text/css',
            '.html': 'text/html',
            '.js': 'text/javascript',
        }[extname(path)]) || 'text/javascript');
        res.end(content);
    } catch {
        res.statusCode = 404;
        res.end();
    }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/fixture`;
const browser = await chromium.launch({ headless: true });

try {
    await mkdir('test-results/editor-sound', { recursive: true });
    for (const width of [1440, 390, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        const requests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => requests.push(request.url()));
        await page.goto(base);
        await page.waitForFunction(() => window.ready);
        assert.equal(await page.evaluate(() => document.getElementById('editorSound').parentElement.id), 'editorActionRow');
        assert.equal(await page.locator('#editorSound').isVisible(), true);
        assert.equal(await page.getByRole('button', { name: 'Rain' }).count(), 0);
        await page.getByRole('button', { name: 'Sound', exact: true }).click();
        await page.locator('#editorSoundSong').fill('javascript:alert(1)');
        await page.locator('#editorSoundSong').evaluate((input) => input.dispatchEvent(new Event('change', { bubbles: true })));
        assert.match(await page.locator('[data-sound-error]').innerText(), /YouTube, Spotify, or Apple Music/);
        assert.equal(await page.locator('#editorSoundOpen').isVisible(), false);
        await page.locator('#editorSoundSong').fill('https://open.spotify.com/track/demo');
        await page.locator('#editorSoundSong').evaluate((input) => input.dispatchEvent(new Event('change', { bubbles: true })));
        assert.equal(await page.locator('#editorSoundOpen').innerText(), 'Open in Spotify');
        assert.equal(await page.locator('#editorSoundEmbed iframe').count(), 0);
        await page.locator('#editorSoundSong').fill('https://youtu.be/lZdzxqh-rao?si=JlgpfaEfge');
        await page.locator('#editorSoundSong').evaluate((input) => input.dispatchEvent(new Event('input', { bubbles: true })));
        assert.equal(await page.locator('#editorSoundEmbed iframe').getAttribute('src'), 'https://www.youtube-nocookie.com/embed/lZdzxqh-rao?rel=0&playsinline=1');
        assert.equal(await page.locator('#editorSoundOpen').isVisible(), false);
        assert.match(await page.locator('.writer-sound-copy').innerText(), /Hide video/);
        const embedBox = await page.locator('#editorSoundEmbed').boundingBox();
        assert.ok(embedBox && embedBox.height >= 160, 'YouTube player must stay tall enough to tap Play');
        await page.getByRole('button', { name: 'Hide video', exact: true }).click();
        assert.equal(await page.locator('#editorSoundPanel').isVisible(), false);
        assert.equal(await page.locator('#editorSoundEmbed').evaluate((node) => node.classList.contains('is-docked')), true);
        const dockBox = await page.locator('#editorSoundEmbed').boundingBox();
        assert.ok(dockBox && dockBox.width <= 180 && dockBox.height <= 110, 'hidden video stays as a corner player');
        assert.ok(dockBox.x + dockBox.width <= width + 1);
        await page.getByRole('button', { name: /Sound/ }).click();
        assert.equal(await page.locator('#editorSoundEmbed').evaluate((node) => node.classList.contains('is-docked')), false);
        if (width <= 720) {
            await page.locator('#editorSoundSong').focus();
            await page.evaluate(() => window.keyboard.sync({ visualHeight: 400, innerHeight: 844 }));
            assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-editor-keyboard-sound')), true);
            assert.equal(await page.locator('#editorSoundSong').isVisible(), true);
            assert.equal(await page.locator('#editorSoundSong').evaluate((node) => getComputedStyle(node).fontSize), '16px');
            await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
            assert.equal(await page.locator('#editorSoundPanel').evaluate((node) => node.hidden), false);
            await page.locator('#pageEditor').focus();
            await page.evaluate(() => window.keyboard.sync({ visualHeight: 400, innerHeight: 844 }));
            assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-editor-keyboard-sound')), false);
            assert.equal(await page.locator('#editorSoundPanel').isVisible(), false);
            await page.evaluate(() => window.keyboard.sync({ visualHeight: 844, innerHeight: 844, forceClose: true }));
        }
        await page.screenshot({ path: `test-results/editor-sound/panel-${width}.png`, fullPage: true });
        await page.evaluate(() => document.documentElement.classList.add('is-typewriter'));
        assert.equal(await page.locator('#editorSoundChip').count(), 0);
        assert.equal(await page.locator('#editorSoundEmbed iframe').isVisible(), true);
        await page.screenshot({ path: `test-results/editor-sound/focus-${width}.png`, fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(requests.some((url) => /open\.spotify|music\.apple/.test(url)), false, 'Alysum never fetches Spotify or Apple Music');
        assert.deepEqual(errors, []);
        await page.close();
        console.log(`PASS editor sound dock at ${width}px`);
    }
} finally {
    await browser.close();
    await new Promise((done) => server.close(done));
}
