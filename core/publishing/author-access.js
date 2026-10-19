/** Provider-specific notifications are interpreted only after server verification. */
export const ACCESS_PROVIDERS = ['kofi', 'payhip'];
export function normalizeProductKey(provider, raw) {
    const value = String(raw || '').trim();
    if (/^[a-zA-Z0-9_-]{2,120}$/.test(value)) return value;
    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./, '');
        const match = provider === 'kofi' && host === 'ko-fi.com' ? url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/)
            : provider === 'payhip' && host === 'payhip.com' ? url.pathname.match(/^\/b\/([a-zA-Z0-9_-]+)\/?$/) : null;
        return match?.[1] || '';
    } catch { return ''; }
}
export function saleFromNotification(provider, data) {
    if (!data || typeof data !== 'object') throw Error('Invalid notification.');
    if (data.is_test === true || data.is_test === 'true') return null;
    if (provider === 'kofi') {
        if (data.type !== 'Shop Order' || data.is_subscription_payment === true) return null;
        if (!Array.isArray(data.shop_items) || !data.shop_items.length) throw Error('Missing shop items.');
        const amount = String(data.amount || '');
        if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)) throw Error('Invalid amount.');
        return { transaction: String(data.kofi_transaction_id || ''), email: String(data.email || '').trim().toLowerCase(), currency: String(data.currency || '').toUpperCase(), amount: Math.round(Number(amount) * 100), reversed: false,
            products: [...new Set(data.shop_items.map(item => String(item.direct_link_code || '')).filter(Boolean))] };
    }
    if (provider === 'payhip') {
        if (!['paid','refunded'].includes(data.type) || data.is_gift === true) return null;
        if (!Array.isArray(data.items) || !Number.isSafeInteger(data.price)) throw Error('Invalid order.');
        return { transaction: String(data.id || ''), email: String(data.email || '').trim().toLowerCase(), currency: String(data.currency || '').toUpperCase(), amount: data.price,
            reversed: data.type === 'refunded', products: [...new Set(data.items.map(item => String(item.product_key || '')).filter(Boolean))] };
    }
    throw Error('Unsupported payment service.');
}
export function validateSale(sale) {
    return sale && /^[a-zA-Z0-9_-]{3,160}$/.test(sale.transaction) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sale.email)
        && sale.email.length <= 254 && /^[A-Z]{3}$/.test(sale.currency) && Number.isSafeInteger(sale.amount) && sale.amount > 0 && sale.products.length > 0 && sale.products.length <= 100;
}
