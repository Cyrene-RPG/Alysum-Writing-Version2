import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstExcerptSentence, handleSharedSection, readSharedExcerpt } from '../../server/http-handlers/shared-section.mjs';
import { onRequest } from '../../../functions/shared-section/[token].js';
import { createExcerptApi } from '../../publishing/excerpts.js';

const token = 'a'.repeat(48);
const url = `https://alysum.example/shared-section/${token}`;
const section = { title: 'The Harbor', author: 'A Writer', excerpt: 'The boat arrived at dusk. A second sentence remains in the reader.', wordCount: 14 };

test('each reading link has its own first-sentence preview in the initial HTML, with Alysum branding', async () => {
    for (const excerpt of [section.excerpt, 'Different words begin here! More words after that.', '夜が明けた。船が見えた。']) {
        const response = await handleSharedSection(new Request(url), { token, read: async () => ({ ...section, excerpt }) });
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.ok(html.includes(`<meta property="og:description" content="${firstExcerptSentence(excerpt)}">`));
        assert.ok(html.includes('property="og:title" content="The Harbor by A Writer — Alysum"'));
        assert.ok(html.includes('content="https://alysum.example/Alysum-3.png"'));
        assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
        assert.ok(html.includes('id="section-text"'));
        assert.ok(html.includes(excerpt));
        const head = html.split('</head>')[0];
        assert.ok(!head.includes('A second sentence remains'));
        assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
        assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
        assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
    }
});

test('first sentences handle whitespace, punctuation, no punctuation, and long Unicode text', () => {
    assert.equal(firstExcerptSentence('  A first sentence.\n\nA second sentence. '), 'A first sentence.');
    assert.equal(firstExcerptSentence('你好。下一句。'), '你好。');
    assert.equal(firstExcerptSentence('A sentence without punctuation'), 'A sentence without punctuation');
    assert.equal(Array.from(firstExcerptSentence('🌙'.repeat(300))).length, 240);
    assert.ok(firstExcerptSentence('x'.repeat(300)).endsWith('…'));
});

test('titles, authors and excerpt text are escaped for HTML and metadata attributes', async () => {
    const response = await handleSharedSection(new Request(url), { token, read: async () => ({ ...section, title: '"><script>attack()</script>', author: 'A & B', excerpt: '"Hello" <img src=x onerror=attack()>! Next sentence.' }) });
    const html = await response.text();
    assert.ok(!html.includes('<script>attack()'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;script&gt;attack()&lt;/script&gt;'));
    assert.ok(html.includes('A &amp; B'));
});

test('revoked, invalid, and failed links never return stale excerpt contents or metadata', async () => {
    let calls = 0;
    const read = async () => { calls++; return null; };
    const invalid = await handleSharedSection(new Request(url), { token: 'invalid', read });
    assert.equal(invalid.status, 404);
    assert.equal(calls, 0);
    const revoked = await handleSharedSection(new Request(url), { token, read });
    assert.equal(revoked.status, 404);
    assert.ok(!(await revoked.text()).includes('The Harbor'));
    const failed = await handleSharedSection(new Request(url), { token, read: async () => { throw Error('PRIVATE DATA'); } });
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('PRIVATE DATA'));
    const head = await handleSharedSection(new Request(url, { method: 'HEAD' }), { token, read: async () => section });
    assert.equal(await head.text(), '');
    const post = await handleSharedSection(new Request(url, { method: 'POST' }), { token, read });
    assert.equal(post.status, 405);
});

test('server reads only the selected token snapshot using the existing anonymous RPC', async () => {
    let request;
    const result = await readSharedExcerpt(token, async (url, options) => {
        request = { url, options };
        return Response.json({ ...section, book_id: 'PRIVATE BOOK', sections: ['PRIVATE MANUSCRIPT'] });
    });
    assert.ok(request.url.endsWith('/rest/v1/rpc/get_wip_excerpt'));
    assert.deepEqual(JSON.parse(request.options.body), { p_token: token });
    assert.equal(result.excerpt, section.excerpt);
    assert.equal('sections' in result, false);
    assert.equal('book_id' in result, false);
    assert.equal(await readSharedExcerpt(token, async () => Response.json({ ...section, revoked_at: 'now' })), null);
});

test('newly copied existing links use preview URLs; legacy fragment reader remains available', async () => {
    const api = createExcerptApi({ rpc: async () => ({ data: [{ id: 'share-id', token, title: 'Saved excerpt' }] }) }, { origin: 'https://alysum.example' });
    assert.equal((await api.list('private-book'))[0].url, url);
    const reader = readFileSync(new URL('../../../applications/excerpts/page-ui/read.js', import.meta.url), 'utf8');
    assert.ok(reader.includes('window.location.hash.slice(1)'));
    const redirects = readFileSync(new URL('../../../_redirects', import.meta.url), 'utf8');
    assert.match(redirects, /^\/shared-section\s+\/applications\/excerpts\/pages\/read\s+200$/m);
});

test('Cloudflare route serves the same metadata handler and Vercel has the matching route', async () => {
    const response = await onRequest({ request: new Request(url), params: { token: 'invalid' } });
    assert.equal(response.status, 404);
    assert.ok((await response.text()).includes('og:description'));
    const config = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url)));
    assert.ok(config.rewrites.some(rule => rule.source === '/shared-section/:token' && rule.destination === '/api/shared-section?token=:token'));
});
