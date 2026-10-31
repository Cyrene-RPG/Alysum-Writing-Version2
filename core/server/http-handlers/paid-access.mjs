import { listBodyChapters } from '../../writing-engine/manuscript.js';
import { readWorkTags } from '../../publishing/work-tags.js';
import { UUID_PATTERN, validatePrivateOffer, publicEdition, offerChapterIds, canReadPrivateChapter, matchesPaidSession, manuscriptPlainText } from '../../publishing/paid-access.js';

const DEFAULT_SUPABASE_URL = 'https://jrfxgpkpbacajhcwimgz.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE';
const PAGE = '/applications/studio/pages/connected-payments';
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers } });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const uuid = value => { if (!UUID_PATTERN.test(value || '')) fail(400, 'Invalid edition or purchase reference.'); return value; };
const accountPattern = /^acct_[A-Za-z0-9]+$/;
export async function sha256(value) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function verifyStripeSignature(body, header, secret, now = Date.now()) {
    const entries = String(header || '').split(',').map(part => part.split('='));
    const timestamps = entries.filter(([key]) => key === 't').map(([,value]) => value);
    if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0])) return false;
    const timestamp = timestamps[0];
    if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const payload = new TextEncoder().encode(`${timestamp}.${body}`);
    for (const [name, value] of entries) {
        if (name !== 'v1' || !/^[a-f0-9]{64}$/.test(value || '')) continue;
        const signature = Uint8Array.from(value.match(/../g), hex => parseInt(hex, 16));
        if (await crypto.subtle.verify('HMAC', key, signature, payload)) return true;
    }
    return false;
}
async function bodyText(request, maximum = 16384) {
    if (Number(request.headers.get('Content-Length')) > maximum) fail(413, 'The request is too large.');
    const reader = request.body?.getReader();
    if (!reader) return '';
    const chunks = []; let size = 0;
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > maximum) { await reader.cancel(); fail(413, 'The request is too large.'); } chunks.push(item.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
}
export function paymentConfiguration(env, origin) {
    const host = new URL(origin).hostname;
    const mode = env.PAID_ACCESS_MODE === 'test' ? 'test' : 'live';
    const livemode = mode === 'live';
    const secure = new URL(origin).protocol === 'https:';
    const preview = /^[a-z0-9-]+\.alysum-writing-version2\.pages\.dev$/.test(host);
    const allowed = (secure && (preview || ['alysumwriting.com','www.alysumwriting.com'].includes(host)))
        || (!livemode && ['localhost','127.0.0.1'].includes(host));
    const missing = [];
    if (env.PAID_ACCESS_ENABLED !== 'true') missing.push('PAID_ACCESS_ENABLED');
    if (!allowed || env.PAID_ACCESS_ORIGIN !== origin) missing.push('PAID_ACCESS_ORIGIN');
    if (!['test','live'].includes(env.PAID_ACCESS_MODE)) missing.push('PAID_ACCESS_MODE');
    if (!new RegExp(`^sk_${mode}_`).test(env.STRIPE_SECRET_KEY || '')) missing.push(`STRIPE_SECRET_KEY (${mode} mode)`);
    if (!/^ca_/.test(env.STRIPE_CONNECT_CLIENT_ID || '')) missing.push('STRIPE_CONNECT_CLIENT_ID');
    if (!/^whsec_/.test(env.STRIPE_CONNECT_WEBHOOK_SECRET || '')) missing.push('STRIPE_CONNECT_WEBHOOK_SECRET');
    if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    return { configured: missing.length === 0, missing, mode, livemode, sandbox: !livemode, provider: 'stripe' };
}
export function createPaymentServices(env, fetcher = fetch) {
    const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) throw Error('Invalid Supabase host');
    const anonKey = env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
    async function remote(url, init, message) {
        const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(12000) });
        if (!response.ok) fail(503, message);
        return response.status === 204 ? null : await response.json();
    }
    return {
        async user(request, required = true) {
            const authorization = request.headers.get('Authorization');
            if (!authorization?.startsWith('Bearer ')) { if (required) fail(401, 'Sign in to Alysum to continue.'); return null; }
            const response = await fetcher(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization }, signal: AbortSignal.timeout(12000) });
            if (!response.ok) fail(response.status >= 500 ? 503 : 401, 'Your session could not be verified. Sign in again.');
            const user = await response.json();
            if (!UUID_PATTERN.test(user.id || '') || !user.email_confirmed_at) fail(401, 'Use a verified Alysum account to continue.');
            return user;
        },
        async db(table, { method = 'GET', query = {}, body, preference, authorization } = {}) {
            const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
            for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
            const key = authorization ? anonKey : env.SUPABASE_SERVICE_ROLE_KEY;
            return remote(url, { method, headers: { apikey: key, Authorization: authorization || `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: preference || 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) }, 'Payment storage is unavailable. Check the payment migration and server configuration.');
        },
        async signEpub(path) {
            if (!/^[a-zA-Z0-9_/-]+\.epub$/.test(path)) fail(503, 'Invalid EPUB storage path.');
            const result = await remote(`${supabaseUrl}/storage/v1/object/sign/book-epubs/${path}`, {
                method:'POST', headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
                body:JSON.stringify({expiresIn:60})
            }, 'The EPUB download is unavailable. Try again.');
            const signed = result.signedURL || result.signedUrl;
            if (!signed || !signed.startsWith('/object/sign/book-epubs/')) fail(503, 'Could not create the EPUB download.');
            return `${supabaseUrl}/storage/v1${signed}`;
        },
        async stripe(path, { method = 'GET', body, account, idempotency, oauth = false } = {}) {
            if (!['test','live'].includes(env.PAID_ACCESS_MODE) || !new RegExp(`^sk_${env.PAID_ACCESS_MODE}_`).test(env.STRIPE_SECRET_KEY || '')) fail(503, 'The Stripe key does not match the configured payment mode.');
            const headers = { Authorization: oauth ? `Basic ${btoa(env.STRIPE_SECRET_KEY + ':')}` : `Bearer ${env.STRIPE_SECRET_KEY}` };
            if (account) { if (!accountPattern.test(account)) fail(503, 'Invalid connected payment account.'); headers['Stripe-Account'] = account; }
            if (idempotency) headers['Idempotency-Key'] = idempotency;
            if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
            return remote(`${oauth ? 'https://connect.stripe.com' : 'https://api.stripe.com'}${path}`, { method, headers, body: body ? new URLSearchParams(body).toString() : undefined }, 'Stripe could not complete this request. Please try again.');
        },
    };
}
export async function handlePaidAccess(request, env, injected = {}) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    const config = paymentConfiguration(env, url.origin);
    const modeQuery = { livemode: `eq.${config.livemode}` };
    const clearCookie = 'alysum_paid_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/paid-access; Max-Age=0';
    try {
        if (!['GET','POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
        if (action !== 'stripe-webhook' && request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) fail(403, 'The request came from another site.');
        const services = injected.services || (config.configured ? createPaymentServices(env, injected.fetcher) : null);
        const { db, stripe, user } = services || {};
        if (action === 'status' && request.method === 'GET') {
            let storageReady = false;
            let connection = null;
            if (config.configured) {
                try {
                    await db('paid_access_offers', { query: { select: 'id,livemode', limit: 0 } }); storageReady = true;
                    const owner = await user(request, false);
                    if (owner) connection = (await db('paid_access_connections', { query: { ...modeQuery, owner_id: `eq.${owner.id}`, select: 'stripe_account,charges_enabled' } }))[0] || null;
                } catch { /* Show actionable setup state, without leaking credentials or database responses. */ }
            }
            return json({ ...config, storageReady, connection });
        }
        if (!config.configured) return json({ error: 'Payments are not configured for this deployment.', ...config }, 503);
        const readInput = async () => { try { const value = JSON.parse(await bodyText(request)); if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Send a JSON object.'); return value; } catch (error) { if (error instanceof HttpError) throw error; fail(400, 'Send a valid JSON request.'); } };
        const findOffer = async id => { const rows = await db('paid_access_offers', { query: { ...modeQuery, id: `eq.${uuid(id)}`, limit: 1 } }); if (!rows[0]?.active) fail(404, 'This private paid edition is unavailable.'); return rows[0]; };
        const findOrder = async id => (await db('paid_access_orders', { query: { ...modeQuery, id: `eq.${uuid(id)}`, limit: 1 } }))[0];
        const accountFor = async ownerId => {
            const record = (await db('paid_access_connections', { query: { ...modeQuery, owner_id: `eq.${ownerId}`, limit: 1 } }))[0];
            if (!record?.charges_enabled) fail(409, 'Connect an enabled Stripe account first.');
            const account = await stripe(`/v1/accounts/${record.stripe_account}`);
            if (!account.charges_enabled || account.type !== 'standard') fail(409, 'Finish connecting a Standard Stripe account before accepting payments.');
            return record.stripe_account;
        };
        async function apply(order, session, eventId, forceReverse = false) {
            const intent = session.payment_intent;
            const normalized = { ...session, payment_intent: typeof intent === 'object' ? intent?.id : intent };
            if (!matchesPaidSession(order, normalized, order.stripe_account)) fail(409, 'The payment does not match this purchase. Access has not been granted.');
            const charge = typeof intent === 'object' ? intent?.latest_charge : null;
            if (!charge || typeof charge !== 'object' || !charge.paid || charge.amount !== order.amount || charge.currency !== order.currency) fail(409, 'The payment charge could not be verified.');
            const reverse = forceReverse || charge.refunded || charge.disputed || charge.amount_refunded > 0;
            await db('rpc/apply_paid_access_event', { method: 'POST', body: { p_event: eventId.startsWith('confirm:') ? `${eventId}:${reverse ? 'reversed' : 'paid'}` : eventId, p_order: order.id, p_account: order.stripe_account, p_session: session.id, p_intent: normalized.payment_intent, p_amount: order.amount, p_currency: order.currency, p_status: reverse ? 'reversed' : 'paid', p_livemode: config.livemode } });
            const saved = await findOrder(order.id);
            return saved.status;
        }
        const retrieveSession = order => stripe(`/v1/checkout/sessions/${encodeURIComponent(order.stripe_session)}?expand[]=payment_intent.latest_charge`, { account: order.stripe_account });
        if (action === 'stripe-connect' && request.method === 'POST') {
            const owner = await user(request);
            const state = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2,'0')).join('');
            // Clean up abandoned handshakes, then issue one browser-bound, single-use nonce.
            await db('paid_access_oauth_states', { method: 'DELETE', query: { ...modeQuery, owner_id: `eq.${owner.id}` } });
            await db('paid_access_oauth_states', { method: 'POST', body: { livemode: config.livemode, state_hash: await sha256(state), owner_id: owner.id, expires_at: new Date(Date.now() + 600000).toISOString() } });
            const target = new URL('https://connect.stripe.com/oauth/authorize');
            target.search = new URLSearchParams({ response_type: 'code', client_id: env.STRIPE_CONNECT_CLIENT_ID, scope: 'read_write', redirect_uri: `${url.origin}/api/paid-access?action=stripe-callback`, state }).toString();
            return json({ url: target.href }, 200, { 'Set-Cookie': `alysum_paid_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/paid-access; Max-Age=600` });
        }
        if (action === 'stripe-callback' && request.method === 'GET') {
            const state = url.searchParams.get('state');
            const cookie = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('alysum_paid_state='))?.slice(18);
            if (!/^[a-f0-9]{64}$/.test(state || '') || state !== cookie) fail(403, 'This connection request expired or came from another browser. Start again in Alysum.');
            const states = await db('rpc/consume_paid_access_state', { method: 'POST', body: { p_hash: await sha256(state), p_livemode: config.livemode } });
            if (!states[0]?.owner_id) fail(403, 'This connection request has already been used or expired.');
            if (url.searchParams.has('error')) return new Response(null, { status: 303, headers: { Location: `${url.origin}${PAGE}?connection=canceled`, 'Set-Cookie': clearCookie, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
            const code = url.searchParams.get('code');
            if (!code || code.length > 1024) fail(400, 'Stripe did not return a valid connection code.');
            const result = await stripe('/oauth/token', { method: 'POST', oauth: true, body: { grant_type: 'authorization_code', code } });
            if (result.livemode !== config.livemode || result.scope !== 'read_write' || !accountPattern.test(result.stripe_user_id || '')) fail(409, 'The Stripe account connection must match the configured payment mode.');
            const account = await stripe(`/v1/accounts/${result.stripe_user_id}`);
            if (account.type !== 'standard') fail(409, 'This integration requires a Standard Stripe account.');
            await db('paid_access_connections', { method: 'POST', query: { on_conflict: 'owner_id,livemode' }, preference: 'resolution=merge-duplicates,return=representation', body: { livemode: config.livemode, owner_id: states[0].owner_id, stripe_account: result.stripe_user_id, charges_enabled: Boolean(account.charges_enabled), updated_at: new Date().toISOString() } });
            // Access/refresh tokens returned by OAuth are intentionally never persisted or returned.
            return new Response(null, { status: 303, headers: { Location: `${url.origin}${PAGE}?connection=connected`, 'Set-Cookie': clearCookie, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
        }
        if (action === 'account-editions' && request.method === 'GET') {
            const reader = await user(request);
            const select = 'id,title,mode,amount,currency,created_at,active';
            const created = await db('paid_access_offers', { query: { ...modeQuery, owner_id: `eq.${reader.id}`, select, order: 'created_at.desc', limit: 200 } });
            const orders = await db('paid_access_orders', { query: { ...modeQuery, buyer_id: `eq.${reader.id}`, status: 'eq.paid', select: 'offer_id', limit: 200 } });
            const ids = [...new Set(orders.map(order => order.offer_id).filter(id => UUID_PATTERN.test(id)))];
            const purchased = ids.length ? await db('paid_access_offers', { query: { ...modeQuery, id: `in.(${ids.join(',')})`, select, limit: 200 } }) : [];
            const summary = row => ({ id: row.id, title: row.title, amount: row.amount, currency: row.currency, active: row.active });
            return json({ created: created.map(summary), purchased: purchased.map(summary) });
        }
        if (action === 'author-books' && request.method === 'GET') {
            const owner = await user(request);
            const books = await db('books', { authorization: request.headers.get('Authorization'), query: { user_id: `eq.${owner.id}`, select: 'id,title,media_format,is_published,publish_meta', limit: 200, order: 'updated.desc' } });
            return json({ books: books.map(b => ({ id: b.id, title: b.title, complete: Boolean(b.publish_meta?.complete), published: Boolean(b.is_published), format: b.media_format })) });
        }
        if (action === 'author-book' && request.method === 'GET') {
            const owner = await user(request);
            const id = url.searchParams.get('book');
            if (!id || id.length > 200) fail(400, 'Choose a saved book.');
            const book = (await db('books', { authorization: request.headers.get('Authorization'), query: { id: `eq.${id}`, user_id: `eq.${owner.id}`, limit: 1 } }))[0];
            if (!book) fail(404, 'Book not found in your account.');
            if (readWorkTags(book.publish_meta || {}).workType === 'fanfiction') fail(400, 'Fan fiction cannot be sold through paid editions.');
            return json({ id: book.id, complete: Boolean(book.publish_meta?.complete), chapters: listBodyChapters(book.sections).map(ch => ({ id: ch.id, title: ch.title })) });
        }
        if (action === 'create-edition' && request.method === 'POST') {
            const owner = await user(request);
            const input = await readInput();
            if (typeof input.bookId !== 'string' || input.bookId.length > 200) fail(400, 'Choose a saved book.');
            const book = (await db('books', { authorization: request.headers.get('Authorization'), query: { id: `eq.${input.bookId}`, user_id: `eq.${owner.id}`, limit: 1 } }))[0];
            if (!book) fail(404, 'Book not found in your account.');
            if (book.media_format && book.media_format !== 'novel') fail(400, 'Paid editions currently support prose novels.');
            if (readWorkTags(book.publish_meta || {}).workType === 'fanfiction') fail(400, 'Fan fiction cannot be sold through paid editions.');
            const listed = await db('library', { authorization: request.headers.get('Authorization'), query: { id: `eq.${book.id}`, select: 'id', limit: 1 } });
            if (book.is_published || listed.length) fail(409, 'Use an unpublished draft for this private paid. Already-public chapters cannot be protected retroactively.');
            let validated;
            try { validated = validatePrivateOffer(input, listBodyChapters(book.sections), Boolean(book.publish_meta?.complete)); }
            catch (error) { fail(400, error.message); }
            const chapters = validated.chapters.map(ch => ({ id: String(ch.id), title: String(ch.title || 'Untitled').slice(0,200), text: manuscriptPlainText(ch.content) }));
            if (chapters.some(ch => !ch.text) || JSON.stringify(chapters).length > 2000000) fail(400, 'Choose nonempty chapters totaling under two million characters for this edition.');
            const stripeAccount = await accountFor(owner.id);
            const offer = { livemode: config.livemode, id: crypto.randomUUID(), owner_id: owner.id, source_book_id: book.id, stripe_account: stripeAccount, title: String(book.title || 'Untitled').slice(0,200), mode: validated.mode, amount: validated.amount, currency: validated.currency, chapters, paid_chapter_ids: validated.paidIds, active: true };
            await db('paid_access_offers', { method: 'POST', body: offer });
            return json({ edition: publicEdition(offer), url: `${url.origin}/applications/library/pages/paid-read?edition=${offer.id}` }, 201);
        }
        if (action === 'edition' && request.method === 'GET') return json({ edition: publicEdition(await findOffer(url.searchParams.get('edition'))) });
        if (action === 'chapter' && request.method === 'GET') {
            const offer = await findOffer(url.searchParams.get('edition'));
            const chapter = offer.chapters.find(ch => ch.id === url.searchParams.get('chapter'));
            if (!chapter) fail(404, 'Chapter not found.');
            const reader = await user(request, false);
            const orders = reader ? await db('paid_access_orders', { query: { ...modeQuery, buyer_id: `eq.${reader.id}`, offer_id: `eq.${offer.id}`, status: 'eq.paid', select: 'buyer_id,offer_id,status,chapter_ids,livemode' } }) : [];
            if (!canReadPrivateChapter(offer, chapter.id, reader?.id, orders)) return json({ locked: true, requiresSignIn: !reader, error: 'Purchase this chapter to continue.' }, 402);
            return json({ chapter: { id: chapter.id, title: chapter.title, text: chapter.text } });
        }
        if (action === 'checkout' && request.method === 'POST') {
            const reader = await user(request);
            const input = await readInput();
            const offer = await findOffer(input.edition);
            if (offer.source_book_id) {
                const [source] = await db('books', { query: { id: `eq.${offer.source_book_id}`, user_id: `eq.${offer.owner_id}`, select: 'publish_meta', limit: 1 } });
                if (readWorkTags(source?.publish_meta || {}).workType === 'fanfiction') fail(400, 'Fan fiction is not accepting paid purchases.');
            }
            if (reader.id === offer.owner_id) fail(400, 'The author already has access. Use a separate reader account to checkout.');
            const stripeAccount = await accountFor(offer.owner_id);
            if (stripeAccount !== offer.stripe_account) fail(409, 'The author changed payment accounts. This edition is not accepting new purchases.');
            let chapterIds;
            try { chapterIds = offerChapterIds(offer, input.chapter); } catch (error) { fail(400, error.message); }
            const bought = await db('paid_access_orders', { query: { ...modeQuery, buyer_id: `eq.${reader.id}`, offer_id: `eq.${offer.id}`, status: 'eq.paid' } });
            if (canReadPrivateChapter(offer, input.chapter, reader.id, bought)) return json({ alreadyPurchased: true });
            let id = uuid(input.requestId);
            await db('paid_access_orders', { method: 'POST', preference: 'resolution=ignore-duplicates,return=representation', body: { livemode: config.livemode, id, offer_id: offer.id, buyer_id: reader.id, stripe_account: stripeAccount, chapter_ids: chapterIds, amount: offer.amount, currency: offer.currency } });
            let order = await findOrder(id);
            if (!order) {
                const existing = await db('paid_access_orders', { query: { ...modeQuery, buyer_id: `eq.${reader.id}`, offer_id: `eq.${offer.id}`, status: 'in.(pending,paid)' } });
                order = existing.find(row => JSON.stringify(row.chapter_ids) === JSON.stringify(chapterIds));
            }
            if (!order) fail(409, 'Could not start checkout. Please try again.');
            if (order.buyer_id !== reader.id || order.offer_id !== offer.id || JSON.stringify(order.chapter_ids) !== JSON.stringify(chapterIds)) fail(409, 'Start a new checkout attempt.');
            if (order.status === 'reversed') fail(409, 'This purchase was refunded or disputed. Contact the author before purchasing again.');
            if (order.stripe_session) {
                const previous = await retrieveSession(order);
                if (previous.status === 'complete') {
                    if (previous.payment_status === 'paid') { const status = await apply(order, previous, `confirm:${previous.id}`); return json({ alreadyPurchased: status === 'paid', status, order: order.id }); }
                    return json({ status: 'pending', order: order.id });
                }
                if (previous.status === 'expired' || order.status === 'expired') {
                    await db('paid_access_orders', { method: 'PATCH', query: { ...modeQuery, id: `eq.${order.id}`, status: 'eq.pending' }, body: { status: 'expired' } });
                    fail(409, 'This checkout expired. Start a new checkout attempt.');
                }
            }
            id = order.id;
            const destination = `${url.origin}/applications/library/pages/paid-read?edition=${offer.id}&chapter=${encodeURIComponent(input.chapter)}`;
            const session = await stripe('/v1/checkout/sessions', { method: 'POST', account: stripeAccount, idempotency: `alysum-paid-access-${id}`, body: {
                mode: 'payment', 'payment_method_types[0]': 'card', client_reference_id: reader.id,
                'metadata[order_id]': id, 'metadata[offer_id]': offer.id,
                'payment_intent_data[metadata][order_id]': id, 'payment_intent_data[metadata][offer_id]': offer.id,
                'line_items[0][price_data][currency]': offer.currency, 'line_items[0][price_data][unit_amount]': String(offer.amount),
                'line_items[0][price_data][product_data][name]': offer.mode === 'chapter' ? offer.chapters.find(ch => ch.id === input.chapter).title : offer.title,
                'line_items[0][quantity]': '1', success_url: `${destination}&order=${id}`, cancel_url: `${destination}&payment=canceled`,
            } });
            if (session.livemode !== config.livemode || !new RegExp(`^cs_${config.mode}_`).test(session.id || '') || !String(session.url || '').startsWith('https://checkout.stripe.com/')) fail(503, 'Stripe did not return a valid checkout.');
            await db('paid_access_orders', { method: 'PATCH', query: { ...modeQuery, id: `eq.${id}` }, body: { stripe_session: session.id } });
            return json({ url: session.url, order: id });
        }
        if (action === 'confirm' && request.method === 'POST') {
            const reader = await user(request);
            const input = await readInput();
            const order = await findOrder(input.order);
            if (!order || order.buyer_id !== reader.id) fail(404, 'Purchase not found in your account.');
            if (!order.stripe_session) return json({ status: 'pending' });
            const session = await retrieveSession(order);
            if (session.payment_status !== 'paid') return json({ status: order.status });
            return json({ status: await apply(order, session, `confirm:${session.id}`) });
        }
        if (action === 'stripe-webhook' && request.method === 'POST') {
            const raw = await bodyText(request, 262144);
            if (!await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_CONNECT_WEBHOOK_SECRET, injected.now?.() ?? Date.now())) fail(400, 'Invalid webhook signature.');
            let event; try { event = JSON.parse(raw); } catch { fail(400, 'Invalid webhook.'); }
            if (event.livemode !== config.livemode || !/^evt_[A-Za-z0-9]+$/.test(event.id || '') || !accountPattern.test(event.account || '')) fail(400, 'The connected-account event does not match the configured payment mode.');
            const object = event.data?.object;
            if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
                if (!UUID_PATTERN.test(object?.metadata?.order_id || '')) return json({ received: true, ignored: true });
                const order = await findOrder(object.metadata.order_id);
                if (!order || order.livemode !== config.livemode || order.stripe_account !== event.account || order.stripe_session !== object.id) fail(409, 'The event does not match an Alysum purchase.');
                const session = await retrieveSession(order);
                if (session.payment_status === 'paid') await apply(order, session, event.id);
            } else if (['charge.refunded','charge.dispute.created'].includes(event.type)) {
                const charge = event.type === 'charge.refunded' ? object : await stripe(`/v1/charges/${encodeURIComponent(object.charge)}`, { account: event.account });
                const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(charge.payment_intent)}`, { account: event.account });
                if (!UUID_PATTERN.test(intent.metadata?.order_id || '')) return json({ received: true, ignored: true });
                const order = await findOrder(intent.metadata.order_id);
                if (!order || order.livemode !== config.livemode || order.stripe_account !== event.account) fail(409, 'Refund does not match an Alysum purchase.');
                await apply(order, await retrieveSession(order), event.id, true);
            } else if (event.type === 'account.application.deauthorized' || event.type === 'account.updated') {
                await db('paid_access_connections', { method: 'PATCH', query: { ...modeQuery, stripe_account: `eq.${event.account}` }, body: { charges_enabled: event.type !== 'account.application.deauthorized' && Boolean(object?.charges_enabled), updated_at: new Date().toISOString() } });
            }
            return json({ received: true });
        }
        return json({ error: 'Unknown payment action or method.' }, 404);
    } catch (error) {
        return json({ error: error instanceof HttpError ? error.message : 'Payments are temporarily unavailable. No access has been granted.' }, error instanceof HttpError ? error.status : 503, action === 'stripe-callback' ? { 'Set-Cookie': clearCookie } : {});
    }
}
