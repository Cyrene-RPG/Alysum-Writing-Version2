import { createPaymentServices, sha256 } from './paid-access.mjs';
import { ACCESS_PROVIDERS, normalizeProductKey, saleFromNotification, validateSale } from '../../publishing/author-access.js';
import { normalizePurchaseUrl } from '../../publishing/publish-meta.js';
import { listBodyChapters } from '../../writing-engine/manuscript.js';
import { manuscriptPlainText, UUID_PATTERN } from '../../publishing/paid-access.js';
import { countWordsInHtml } from '../../writing-engine/word-count.js';

const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control':'private, no-store', 'Vary':'Authorization', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' } });
class AccessError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new AccessError(status, message); };
const id = value => { if (!UUID_PATTERN.test(value || '')) fail(400, 'Invalid connection.'); return value; };
function bookId(value) { const text = String(value || ''); if (!/^[a-zA-Z0-9_-]{1,160}$/.test(text)) fail(400,'Invalid book.'); return text; }
async function input(request, form = false) {
    const reader = request.body?.getReader(); let length = 0; const chunks = [];
    if (!reader) fail(400,'Send a request body.');
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 131072) { await reader.cancel(); fail(413,'Request too large.'); } chunks.push(part.value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const part of chunks) { bytes.set(part,offset); offset += part.length; }
    try { const text = new TextDecoder().decode(bytes); const data = JSON.parse(form ? new URLSearchParams(text).get('data') : text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
    catch { fail(400,'Invalid notification or request.'); }
}
export async function handleAuthorAccess(request, env, injected = {}) {
    const url = new URL(request.url); const action = url.searchParams.get('action') || 'status';
    try {
        if (!['GET','POST'].includes(request.method)) return reply({error:'Method not allowed.'},405);
        if (action !== 'webhook' && request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) fail(403,'Request came from another site.');
        const allowed = url.protocol === 'https:' && (['alysumwriting.com','www.alysumwriting.com'].includes(url.hostname) || /^[a-z0-9-]+\.alysum-writing-version2\.pages\.dev$/.test(url.hostname));
        if (!allowed && !injected.services) fail(503,'Author access is unavailable on this host.');
        if (!env.SUPABASE_SERVICE_ROLE_KEY && !injected.services) {
            if (action === 'status') return reply({ready:false});
            fail(503,'Chapter access needs its database setup before authors can use it.');
        }
        const { db, user } = injected.services || createPaymentServices(env,injected.fetcher);
        if (action === 'status' && request.method === 'GET') {
            try { await db('author_access_connections',{query:{select:'id',limit:0}}); let version = 0;
                try { version = await db('rpc/author_access_pricing_version',{method:'POST',body:{}}); } catch { /* Bundle setup remains usable. */ }
                return reply({ready:true,individualPricing:version>=1,mixedPricing:version>=2}); }
            catch { return reply({ready:false}); }
        }
        if (action === 'webhook' && request.method === 'POST') {
            const connectionId = id(url.searchParams.get('connection'));
            const [connection] = await db('author_access_connections',{query:{id:`eq.${connectionId}`,enabled:'eq.true',limit:1}});
            if (!connection) fail(404,'Connection unavailable.');
            const data = await input(request, connection.provider === 'kofi');
            const supplied = connection.provider === 'kofi' ? await sha256(String(data.verification_token || '')) : String(data.signature || '').toLowerCase();
            // Compare hashes again so stored verifiers never leave the server.
            if (await sha256(supplied) !== await sha256(connection.verifier_hash)) fail(403,'Notification could not be verified.');
            const sale = saleFromNotification(connection.provider,data);
            if (!sale) return reply({received:true,ignored:true});
            if (!validateSale(sale)) fail(400,'Incomplete sale notification.');
            const emailHash = await sha256(sale.email);
            await db('rpc/apply_author_access_sale',{method:'POST',body:{p_connection:connectionId,p_transaction:sale.transaction,p_email_hash:emailHash,p_products:sale.products,p_amount:sale.amount,p_currency:sale.currency,p_reversed:sale.reversed}});
            return reply({received:true});
        }
        if (action === 'read' && request.method === 'GET') {
            const reader = await user(request,false);
            const chapters = await db('rpc/read_author_access',{method:'POST',body:{p_book:bookId(url.searchParams.get('book')),p_reader:reader?.id || null,p_email_hash:reader?.email ? await sha256(reader.email.trim().toLowerCase()) : null}});
            return reply({chapters:chapters || []});
        }
        const owner = await user(request);
        if (action === 'connections' && request.method === 'GET') {
            const connections = await db('author_access_connections',{query:{owner_id:`eq.${owner.id}`,select:'id,provider,enabled,verified_at',order:'created_at.asc'}});
            return reply({connections:connections.map(c=>({...c,webhookUrl:`${url.origin}/api/author-access?action=webhook&connection=${c.id}`}))});
        }
        if (action === 'connect' && request.method === 'POST') {
            const body = await input(request);
            if (!ACCESS_PROVIDERS.includes(body.provider)) fail(400,'Choose Ko-fi or Payhip.');
            const secret = String(body.secret || '').trim();
            if (secret.length < 16 || secret.length > 1024) fail(400,'Paste the verification token or API key from your own service.');
            const [existing] = await db('author_access_connections',{query:{owner_id:`eq.${owner.id}`,provider:`eq.${body.provider}`,limit:1}});
            const connectionId = existing?.id || crypto.randomUUID();
            await db('author_access_connections',{method:'POST',query:{on_conflict:'owner_id,provider'},preference:'resolution=merge-duplicates,return=representation',body:{id:connectionId,owner_id:owner.id,provider:body.provider,verifier_hash:await sha256(secret),enabled:true,verified_at:null}});
            return reply({id:connectionId,webhookUrl:`${url.origin}/api/author-access?action=webhook&connection=${connectionId}`});
        }
        if (action === 'book' && request.method === 'GET') {
            const sourceId = bookId(url.searchParams.get('book'));
            const [source] = await db('books',{query:{id:`eq.${sourceId}`,user_id:`eq.${owner.id}`,select:'id',limit:1}});
            if (!source) fail(404,'Book not found.');
            const [config] = await db('author_access_books',{query:{book_id:`eq.${sourceId}`,owner_id:`eq.${owner.id}`,select:'connection_id,product_key,purchase_url,minimum_amount,currency,chapter_ids,chapters',limit:1}});
            if (config) {
                config.chapterProducts = (config.chapters || []).filter(ch=>ch.productKey).map(ch=>({chapterId:ch.id,productUrl:ch.purchaseUrl,minimum:String(ch.minimumAmount/100)}));
                config.pricingMode=config.chapters.some(ch=>ch.offerMode==='mixed') ? 'mixed' : config.chapterProducts.length ? 'individual' : 'bundle';
                delete config.chapters;
            }
            return reply({config:config || null});
        }
        if (action === 'configure' && request.method === 'POST') {
            const body = await input(request); const sourceId = bookId(body.book);
            const [source] = await db('books',{query:{id:`eq.${sourceId}`,user_id:`eq.${owner.id}`,limit:1}});
            if (!source) fail(404,'Only the book’s owner can set chapter access.');
            if (source.media_format && !['novel','fiction','prose'].includes(source.media_format)) fail(400,'Chapter locks currently support prose books.');
            const chapterIds = [...new Set((Array.isArray(body.chapterIds) ? body.chapterIds : []).map(String))];
            const selectedIds = [...new Set((Array.isArray(body.selectedIds) ? body.selectedIds : []).map(String))];
            if (chapterIds.length > 500) fail(400,'Select up to 500 locked chapters.');
            const missingSelection = chapterIds.filter(ch=>!selectedIds.includes(ch));
            if (missingSelection.length) {
                const missingNames = listBodyChapters(source.sections).filter(ch=>missingSelection.includes(String(ch.id))).map(ch=>String(ch.title || 'Untitled')).join(', ');
                fail(400,`Select these locked chapters under Manuscript, or turn off their locks: ${missingNames || missingSelection.join(', ')}.`);
            }
            const manuscript = listBodyChapters(source.sections);
            // Completion describes the story, independently of which current chapters are paid.
            const chapters = manuscript.filter(ch=>chapterIds.includes(String(ch.id))).map(ch=>({id:String(ch.id),title:String(ch.title || 'Untitled').slice(0,300),text:manuscriptPlainText(ch.content || ''),wordCount:countWordsInHtml(ch.content || '')}));
            if (chapters.length !== chapterIds.length || chapters.some(ch=>ch.wordCount < 500) || JSON.stringify(chapters).length > 2000000) fail(400,'Locked chapters must contain at least 500 words each, up to two million characters per book.');
            let connectionId = null, productKey = '', purchaseUrl = '', minimum = 0, currency = '';
            if (chapterIds.length) {
                connectionId = id(body.connectionId);
                const [connection] = await db('author_access_connections',{query:{id:`eq.${connectionId}`,owner_id:`eq.${owner.id}`,enabled:'eq.true',limit:1}});
                if (!connection) fail(409,'Connect your shop first.');
                currency = String(body.currency || '').toUpperCase();
                if (!['USD','GBP','EUR','CAD','AUD'].includes(currency)) fail(400,'Choose a supported currency.');
                const validateProduct = (rawUrl, rawAmount, suppliedKey) => {
                    const purchaseUrl = normalizePurchaseUrl(rawUrl);
                    const productKey = normalizeProductKey(connection.provider,purchaseUrl);
                    if (!productKey || (suppliedKey && normalizeProductKey(connection.provider,suppliedKey) !== productKey)) fail(400,'Use the exact shop product link for your connected shop.');
                    const minimumAmount = Number(rawAmount);
                    if (!Number.isSafeInteger(minimumAmount) || minimumAmount < 50 || minimumAmount > 100000) fail(400,'Set each product price from 0.50 to 1,000.');
                    return {productKey,purchaseUrl,minimumAmount,currency};
                };
                if (['individual','mixed'].includes(body.pricingMode)) {
                    let version = 0;
                    try { version = await db('rpc/author_access_pricing_version',{method:'POST',body:{}}); } catch { /* Fail before saving on the old setup. */ }
                    if (version < (body.pricingMode === 'mixed' ? 2 : 1)) fail(503,'Chapter products need the latest chapter-access SQL update.');
                    const products = Array.isArray(body.chapterProducts) ? body.chapterProducts : [];
                    if (products.length !== chapterIds.length || new Set(products.map(p=>String(p.chapterId))).size !== products.length) fail(400,'Set a product and price for each locked chapter.');
                    const keys = new Map();
                    for (const chapter of chapters) {
                        const product = products.find(p=>String(p.chapterId) === chapter.id);
                        if (!product) fail(400,'Set a product and price for each locked chapter.');
                        const validated = validateProduct(product.purchaseUrl,product.minimumAmount);
                        if (keys.has(validated.productKey)) {
                            if (body.pricingMode !== 'mixed') fail(400,'Use a different shop product for each individually priced chapter.');
                            if (keys.get(validated.productKey)!==validated.minimumAmount) fail(400,'Every chapter in the same product must use that product’s full price.');
                        }
                        keys.set(validated.productKey,validated.minimumAmount);
                        Object.assign(chapter,validated,{offerMode:body.pricingMode});
                    }
                } else {
                    const product = validateProduct(body.purchaseUrl,body.minimumAmount,body.productKey);
                    productKey = product.productKey; purchaseUrl = product.purchaseUrl; minimum = product.minimumAmount;
                }
            }
            await db('rpc/save_author_access_book',{method:'POST',body:{p_book:sourceId,p_owner:owner.id,p_connection:connectionId,p_product:productKey,p_url:purchaseUrl,p_minimum:minimum,p_currency:currency,p_chapters:chapters}});
            return reply({saved:true});
        }
        if (action === 'sales' && request.method === 'GET') {
            const sales = await db('author_access_sales',{query:{owner_id:`eq.${owner.id}`,select:'id,book_id,transaction_id,status,created_at',order:'created_at.desc',limit:100}});
            return reply({sales});
        }
        if (action === 'revoke' && request.method === 'POST') {
            const body = await input(request);
            await db('author_access_sales',{method:'PATCH',query:{id:`eq.${id(body.saleId)}`,owner_id:`eq.${owner.id}`},body:{status:'reversed'}});
            return reply({revoked:true});
        }
        return reply({error:'Unknown action.'},404);
    } catch (error) {
        const status = error instanceof AccessError ? error.status : /Sign in|session|verified Alysum/.test(error.message || '') ? 401 : 503;
        return reply({error:status === 503 ? 'Chapter access is unavailable. The site owner may need to run the chapter-access SQL setup.' : error.message},status);
    }
}
