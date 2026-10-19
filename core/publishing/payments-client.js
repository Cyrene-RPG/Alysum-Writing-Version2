import { supabase } from '@alysum/authentication/client.js';
export async function paymentRequest(action, { method = 'GET', body, query = {}, requireAuth = false } = {}) {
    const url = new URL('/api/paid-access', window.location.origin);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (requireAuth && !token) throw Error('Sign in to Alysum on this test branch to continue.');
    const response = await fetch(url, { method, cache: 'no-store', credentials: 'same-origin', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let payload;
    try { payload = await response.json(); } catch { throw Error('The payment server did not respond. Please try again.'); }
    if (!response.ok) { const error = new Error(payload.error || 'The payment request failed.'); error.status = response.status; error.data = payload; throw error; }
    return payload;
}
