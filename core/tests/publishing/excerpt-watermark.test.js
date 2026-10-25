import test from 'node:test';
import assert from 'node:assert/strict';
import { excerptWatermark } from '../../publishing/excerpt-watermark.js';
import { renderSharedSection } from '../../server/http-handlers/shared-section.mjs';
const svg = author => decodeURIComponent(excerptWatermark(author).slice('url("data:image/svg+xml,'.length, -2));
test('watermark preserves names as escaped text, with a generic fallback and bounded Unicode names', () => {
    assert.match(svg('  A  Writer  '), />A Writer<\/text>/);
    assert.match(svg('A Writer'), /Shared excerpt · Alysum/);
    assert.match(svg(''), />Shared excerpt<\/text>/);
    const hostile = svg('A </text><script> & "Writer"');
    assert.ok(!hostile.includes('<script>'));
    assert.match(hostile, /&lt;\/text&gt;&lt;script&gt; &amp; &quot;Writer&quot;/);
    assert.ok(!excerptWatermark("O'Writer").includes("'"));
    assert.match(svg('🌙'.repeat(80)), new RegExp('🌙'.repeat(39) + '…'));
});
test('server-rendered watermark is attached only to available excerpt text and escaped inside CSS', () => {
    const url = new URL('https://example.com/shared-section/token');
    const html = renderSharedSection({ title: 'Story', author: 'A Writer', excerpt: 'Readable words.', wordCount: 2 }, url);
    assert.match(html, /id="section-text" style="--excerpt-watermark: url\(&quot;data:image\/svg\+xml,/);
    assert.match(html, />Readable words\.<\/div>/);
    assert.ok(!renderSharedSection(null, url).includes('--excerpt-watermark'));
});
