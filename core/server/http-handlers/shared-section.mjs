import { excerptWatermark } from '../../publishing/excerpt-watermark.js';
import { normalizeExcerpt } from '../../publishing/excerpts.js';

const SUPABASE_URL = 'https://jrfxgpkpbacajhcwimgz.supabase.co';
const API_KEY = 'sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function firstExcerptSentence(text, limit = 240) {
    const normalized = String(text || '').replace(/\s+/gu, ' ').trim();
    if (!normalized) return 'Read a shared writing excerpt on Alysum.';
    const segments = new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(normalized);
    let sentence = '';
    for (const part of segments) {
        sentence += part.segment;
        const end = sentence.trimEnd();
        // Keep names together when sentence segmentation stops at a title or initial.
        if (!/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|e\.g|i\.e)\.$/iu.test(end) && !/(?:^|\s)\p{L}\.$/u.test(end)) break;
    }
    sentence = sentence.trim();
    const characters = Array.from(sentence);
    return characters.length > limit ? characters.slice(0, limit - 1).join('').trimEnd() + '…' : sentence;
}

export async function readSharedExcerpt(token, fetcher = fetch) {
    const response = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/get_wip_excerpt`, {
        method: 'POST',
        headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Excerpt unavailable');
    const data = await response.json();
    return data && !data.revoked_at ? normalizeExcerpt(data) : null;
}

export function renderSharedSection(section, url) {
    const title = section ? `${section.title}${section.author ? ` by ${section.author}` : ''} — Alysum` : 'Section unavailable — Alysum';
    const description = section ? firstExcerptSentence(section.excerpt) : 'This reading link is invalid, disabled, or temporarily unavailable.';
    const image = new URL('/Alysum-3.png', url.origin).href;
    const metadata = (attribute, name, content) => `<meta ${attribute}="${name}" content="${escapeHtml(content)}">`;
    const content = section ? `<section id="section-copyright-notice" class="section-copyright-notice" aria-labelledby="section-notice-title">
<p class="section-label">Before you read</p><h1 id="section-notice-title">Copyright &amp; permitted use</h1>
<p>This excerpt is the work of <strong id="section-notice-author">${escapeHtml(section.author || 'the author')}</strong> and is shared for private reading only. Opening this link does not transfer ownership or grant permission to reuse the writing.</p>
<p>Without the author’s explicit permission, you may not:</p>
<ul>
<li>Copy, download, screenshot, record, repost, publish, or redistribute any part of this excerpt.</li>
<li><strong>Upload, paste, or otherwise submit the writing to an AI tool</strong>, including chatbots, writing assistants, summarizers, translators, or AI detectors.</li>
<li>Use it to train, fine-tune, test, or evaluate an AI model, or include it in a dataset.</li>
<li>Ask AI to rewrite, continue, imitate, analyze, or generate content from this excerpt.</li>
<li>Present the writing as your own or use it commercially.</li>
</ul>
<p>If you want feedback from an AI tool or wish to share the excerpt with someone else, <strong>ask the author first.</strong></p>
<button type="button" id="section-notice-continue">I understand — Read excerpt</button>
<noscript><p>Enable JavaScript to acknowledge this notice and read the excerpt.</p></noscript>
</section>
<article id="section-content" hidden><p class="section-label">Shared WIP section</p><h1 id="section-title" tabindex="-1">${escapeHtml(section.title)}</h1>${section.author ? `<p id="section-author">by ${escapeHtml(section.author)}</p>` : ''}<p id="section-meta">${section.wordCount.toLocaleString('en-US')} words · ${Math.max(1, Math.ceil(section.wordCount / 220))} min read</p><div id="section-text" style="--excerpt-watermark: ${escapeHtml(excerptWatermark(section.author))}">${escapeHtml(section.excerpt)}</div><footer>This is a saved excerpt. Other chapters and later draft changes are not included. Title and author are provided by the person sharing it.</footer></article>`
        : '<section id="section-unavailable"><h1>Section unavailable</h1><p>This link is invalid, has been disabled, or could not be loaded. Ask the sender for a new link.</p></section>';
    return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#7c3aed">
<title>${escapeHtml(title)}</title>${metadata('name', 'description', description)}
${metadata('property', 'og:site_name', 'Alysum')}${metadata('property', 'og:type', 'article')}${metadata('property', 'og:title', title)}${metadata('property', 'og:description', description)}${metadata('property', 'og:url', url.origin + url.pathname)}
${metadata('property', 'og:image', image)}${metadata('property', 'og:image:type', 'image/png')}${metadata('property', 'og:image:width', '500')}${metadata('property', 'og:image:height', '500')}${metadata('property', 'og:image:alt', 'Alysum writing studio')}
${metadata('name', 'twitter:card', 'summary_large_image')}${metadata('name', 'twitter:title', title)}${metadata('name', 'twitter:description', description)}${metadata('name', 'twitter:image', image)}${metadata('name', 'twitter:image:alt', 'Alysum writing studio')}
<link rel="icon" href="/Alysum-3.png">
<link rel="stylesheet" href="/site-appearance/css-styles/theme.css"><link rel="stylesheet" href="/site-appearance/css-styles/gradient-themes/index.css"><link rel="stylesheet" href="/site-appearance/css-styles/gradient-themes-dim/index.css"><link rel="stylesheet" href="/site-appearance/css-styles/typography.css"><link rel="stylesheet" href="/site-appearance/css-styles/surface-styles/index.css">
<script src="/site-appearance/js-runtime/body-background-presets-data.js"></script><script src="/site-appearance/js-runtime/text-ink-data.js"></script><script src="/site-appearance/js-runtime/boot.js"></script><link rel="stylesheet" href="/applications/excerpts/excerpts-css/page.css?v=4">
<script src="/applications/excerpts/page-ui/reading-controls.js?v=2" defer></script>
</head><body><main class="section-reader"><nav class="section-reader-nav" aria-label="Alysum"><a href="/library">ALYSUM</a><span>Read only</span></nav>${content}</main></body></html>`;
}

export async function handleSharedSection(request, { token, read = readSharedExcerpt } = {}) {
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff' };
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
    const url = new URL(request.url);
    let section = null;
    let status = 404;
    if (/^[a-f0-9]{48}$/.test(String(token || ''))) {
        try {
            section = await read(token);
            status = section ? 200 : 404;
        } catch { status = 503; }
    }
    return new Response(request.method === 'HEAD' ? null : renderSharedSection(section, url), { status, headers });
}
