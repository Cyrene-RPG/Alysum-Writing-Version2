import { handleSnippetDownload } from '../../core/server/http-handlers/snippet-download.mjs';
const SUPABASE_URL = 'https://jrfxgpkpbacajhcwimgz.supabase.co';
const API_KEY = 'sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE';
export async function onRequest({ request, env }) {
    try {
        if (request.method === 'GET' && new URL(request.url).searchParams.get('sample') === '1') {
            const sample = await env.ASSETS.fetch(new URL('/Alysum-3.png', request.url));
            if (!sample.ok) return new Response('Download test unavailable', { status: 503 });
            return new Response(sample.body, { headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="alysum-download-test.png"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
        }
        return await handleSnippetDownload(request, { cache: caches.default, authorize: async (req) => {
            const authorization = req.headers.get('Authorization');
            if (!authorization?.startsWith('Bearer ')) return false;
            const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: API_KEY, Authorization: authorization }, signal: AbortSignal.timeout(10000) });
            if (!response.ok) return false;
            const user = await response.json();
            const bookId = req.headers.get('X-Book-ID');
            if (!user.id || !bookId || bookId.length > 200) return false;
            // Explicitly restricted rollout: only the authenticated owner's Archangel WIP.
            const url = new URL(`${SUPABASE_URL}/rest/v1/books`);
            url.searchParams.set('select', 'id,title');
            url.searchParams.set('id', `eq.${bookId}`);
            url.searchParams.set('user_id', `eq.${user.id}`);
            url.searchParams.set('title', 'ilike.Archangel');
            const bookResponse = await fetch(url, { headers: { apikey: API_KEY, Authorization: authorization }, signal: AbortSignal.timeout(10000) });
            if (!bookResponse.ok) return false;
            const books = await bookResponse.json();
            return books.length === 1 && String(books[0].id) === bookId && String(books[0].title).trim().toLowerCase() === 'archangel';
        } });
    } catch {
        return Response.json({ error: 'The download could not be prepared. Please try Save PNG again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}
