export const MAX_PNG_BYTES = 16 * 1024 * 1024;
const TTL = 300000;
const tokenPattern = /^[a-f0-9]{48}$/;
const json = (data, status) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleSnippetDownload(request, { cache, authorize, now = Date.now, token = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('') }) {
    const url = new URL(request.url);
    const key = value => new Request(`${url.origin}/__snippet-download-cache/${value}`);
    if (request.method === 'GET' || request.method === 'HEAD') {
        const id = url.searchParams.get('token');
        if (!tokenPattern.test(id || '')) return json({ error: 'Invalid download.' }, 400);
        const saved = await cache.match(key(id));
        if (!saved || Number(saved.headers.get('X-Download-Expires')) <= now()) return json({ error: 'Download expired. Create the card again to download a fresh copy.' }, 410);
        const headers = new Headers(saved.headers);
        headers.set('Cache-Control', 'private, no-store'); headers.delete('X-Download-Expires');
        return new Response(request.method === 'HEAD' ? null : saved.body, { headers });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: 'Invalid download origin.' }, 403);
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'image/png') return json({ error: 'A PNG image is required.' }, 415);
    if (Number(request.headers.get('Content-Length')) > MAX_PNG_BYTES) return json({ error: 'The image is too large. Choose a shorter excerpt.' }, 413);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'The image is empty.' }, 400);
    const chunks = []; let size = 0;
    while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > MAX_PNG_BYTES) { await reader.cancel(); return json({ error: 'The image is too large. Choose a shorter excerpt.' }, 413); }
        chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const signature = [137,80,78,71,13,10,26,10];
    if (size < 33 || !signature.every((n, i) => bytes[i] === n) || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') return json({ error: 'The image could not be exported as PNG.' }, 400);
    if (!await authorize(request, bytes)) return json({ error: 'Sign in again to prepare the download.' }, 401);
    const dimensions = new DataView(bytes.buffer);
    const width = dimensions.getUint32(16), height = dimensions.getUint32(20);
    if (!width || !height || width > 1080 || height > 16000) return json({ error: 'Unsupported image dimensions.' }, 400);
    const id = token(); const expiresAt = now() + TTL;
    let name = String(request.headers.get('X-File-Name') || 'alysum-card.png').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100);
    if (!name.endsWith('.png')) name += '.png';
    await cache.put(key(id), new Response(bytes, { headers: {
        'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(size), 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=300', 'X-Download-Expires': String(expiresAt)
    } }));
    if (!await cache.match(key(id))) return json({ error: "Could not prepare the download. Please try again." }, 503);
    return json({ url: `/api/snippet-download?token=${id}`, expiresAt }, 201);
}
