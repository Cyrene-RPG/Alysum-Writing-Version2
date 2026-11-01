import { UUID_PATTERN, publicEdition, canReadPrivateChapter, matchesPaidSession } from '../../publishing/paid-access.js';

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
        if (['stripe-connect','stripe-callback','create-edition','checkout','author-books','author-book'].includes(action)) return json({error:'This purchasing system is retired. Use Purchase Passes for new sales.',retired:true,url:'/purchase-passes'},410);
        const readOnly = ['edition','chapter','account-editions'].includes(action);
        const readHost=url.protocol==='https:'&&(['alysumwriting.com','www.alysumwriting.com'].includes(url.hostname)||/^[a-z0-9-]+\.alysum-writing-version2\.pages\.dev$/.test(url.hostname))||!config.livemode&&['localhost','127.0.0.1'].includes(url.hostname);
        if(readOnly&&!readHost)fail(503,'Earlier purchase access is unavailable on this host.');
        const services = injected.services || (config.configured || readOnly && env.SUPABASE_SERVICE_ROLE_KEY ? createPaymentServices(env, injected.fetcher) : null);
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
        if (!services || !config.configured && !readOnly) return json({ error: 'Payments are not configured for this deployment.', ...config }, 503);
        const readInput = async () => { try { const value = JSON.parse(await bodyText(request)); if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Send a JSON object.'); return value; } catch (error) { if (error instanceof HttpError) throw error; fail(400, 'Send a valid JSON request.'); } };
        const findOffer = async id => { const rows = await db('paid_access_offers', { query: { ...modeQuery, id: `eq.${uuid(id)}`, limit: 1 } }); if (!rows[0]) fail(404, 'This private paid edition is unavailable.'); if(!rows[0].active){const reader=await user(request,false);const purchases=reader?await db('paid_access_orders',{query:{...modeQuery,buyer_id:`eq.${reader.id}`,offer_id:`eq.${rows[0].id}`,status:'eq.paid',limit:1}}):[];if(reader?.id!==rows[0].owner_id&&!purchases.length)fail(404,'This edition is unavailable.');}return rows[0]; };
        const findOrder = async id => (await db('paid_access_orders', { query: { ...modeQuery, id: `eq.${uuid(id)}`, limit: 1 } }))[0];
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
