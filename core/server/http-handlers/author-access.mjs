import { createPaymentServices, sha256 } from './paid-access.mjs';
import { saleFromNotification, validateSale } from '../../publishing/author-access.js';
import { readWorkTags } from '../../publishing/work-tags.js';
import { UUID_PATTERN } from '../../publishing/paid-access.js';

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
        if (['connect','configure'].includes(action)) return reply({error:'This purchasing system is retired. Use Purchase Passes for new sales.',retired:true,url:'/purchase-passes'},410);
        const allowed = url.protocol === 'https:' && (['alysumwriting.com','www.alysumwriting.com'].includes(url.hostname) || /^[a-z0-9-]+\.alysum-writing-version2\.pages\.dev$/.test(url.hostname));
        if (!allowed && !injected.services) fail(503,'Author access is unavailable on this host.');
        if (!env.SUPABASE_SERVICE_ROLE_KEY && !injected.services) {
            if (action === 'status') return reply({ready:false});
            fail(503,'Chapter access needs its database setup before authors can use it.');
        }
        const services = injected.services || createPaymentServices(env,injected.fetcher);
        const {db,user}=services;
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
        if (action === 'epub-download' && request.method === 'GET') {
            const reader=await user(request),sourceId=bookId(url.searchParams.get('book'));
            const [edition]=await db('epub_editions',{query:{book_id:`eq.${sourceId}`,limit:1}});
            if(!edition)fail(404,'This EPUB is not available.');
            const [source]=await db('books',{query:{id:`eq.${sourceId}`,user_id:`eq.${edition.owner_id}`,select:'publish_meta',limit:1}});
            if(!source || readWorkTags(source.publish_meta).workType==='fanfiction')fail(403,'This EPUB is not available for purchase.');
            const chapters=await db('rpc/read_author_access',{method:'POST',body:{p_book:sourceId,p_reader:reader.id,p_email_hash:await sha256(reader.email.trim().toLowerCase())}});
            const unlocked=new Set((chapters||[]).map(ch=>String(ch.id)));
            if(!Array.isArray(edition.chapter_ids)||!edition.chapter_ids.length||edition.chapter_ids.some(id=>!unlocked.has(String(id))))fail(403,'This download is reserved for earlier whole-book buyers. Sign in with the verified Alysum account used for that purchase.');
            return reply({url:await services.signEpub(edition.storage_path),fileName:edition.file_name});
        }
        if (action === 'read' && request.method === 'GET') {
            const reader = await user(request,false);
            const chapters = await db('rpc/read_author_access',{method:'POST',body:{p_book:bookId(url.searchParams.get('book')),p_reader:reader?.id || null,p_email_hash:reader?.email ? await sha256(reader.email.trim().toLowerCase()) : null}});
            return reply({chapters:chapters || []});
        }
        const owner = await user(request);
        if (action === 'purchases' && request.method === 'GET') {
            const select='book_id';
            const [claimed,unclaimed]=await Promise.all([
                db('author_access_sales',{query:{buyer_id:`eq.${owner.id}`,status:'eq.paid',select,limit:500}}),
                db('author_access_sales',{query:{buyer_id:'is.null',email_hash:`eq.${await sha256(owner.email.trim().toLowerCase())}`,status:'eq.paid',select,limit:500}})
            ]);
            const ids=[...new Set([...claimed,...unclaimed].map(s=>s.book_id).filter(id=>/^[a-zA-Z0-9_-]{1,160}$/.test(id)))];
            const books=ids.length?await db('books',{query:{id:`in.(${ids.join(',')})`,select:'id,title',limit:1000}}):[];
            return reply({purchases:ids.map(id=>({id,title:books.find(b=>b.id===id)?.title||'Earlier purchase',url:'/book?id='+encodeURIComponent(id)}))});
        }
        if (action === 'connections'  && request.method === 'GET') {
            const connections = await db('author_access_connections',{query:{owner_id:`eq.${owner.id}`,select:'id,provider,enabled,verified_at',order:'created_at.asc'}});
            return reply({connections:connections.map(c=>({...c,webhookUrl:`${url.origin}/api/author-access?action=webhook&connection=${c.id}`}))});
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
