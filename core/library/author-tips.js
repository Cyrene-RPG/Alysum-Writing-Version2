import { normalizeSupportLinks } from './author-profile.js';

/** Build tip destinations only from the author's saved support links. */
export function authorTipOptions(raw) {
    const links = normalizeSupportLinks(raw);
    const options = [];
    for (const [kind, label, host] of [['kofi','Ko-fi','ko-fi.com'],['paypal','PayPal','paypal.me'],['cashapp','Cash App','cash.app']]) {
        if (!links[kind]) continue;
        let url; try { url = new URL(links[kind]); } catch { continue; }
        if (url.protocol !== 'https:' || url.username || url.password || url.hostname.replace(/^www\./,'') !== host) continue;
        let parts; try { parts = url.pathname.split('/').filter(Boolean).map(part=>decodeURIComponent(part)); } catch { continue; }
        if (kind === 'kofi') {
            if (parts.length !== 1 || !/^[a-z0-9_-]+$/i.test(parts[0]) || ['shop','s','manage','account','home','post','membership'].includes(parts[0].toLowerCase())) continue;
            const embed = new URL(`https://ko-fi.com/${parts[0]}/`);
            embed.search = 'hidefeed=true&widget=true&embed=true';
            options.push({kind,label,url:`https://ko-fi.com/${parts[0]}`,embedUrl:embed.href});
        } else if (kind === 'paypal') {
            if (!parts.length || !/^[a-z0-9]{1,20}$/i.test(parts[0])) continue;
            options.push({kind,label,url:`https://paypal.me/${parts[0]}`});
        } else if ((parts.length === 1 || (parts.length === 2 && /^\d+(\.\d{1,2})?$/.test(parts[1]))) && /^\$[a-z0-9_]+$/i.test(parts[0])) options.push({kind,label,url:`https://cash.app/${parts[0]}`});
    }
    return options;
}
export function paypalTipUrl(raw, amount, currency) {
    const option = authorTipOptions({paypal:raw}).find(item=>item.kind==='paypal');
    const value = String(amount || '').trim();
    if (!option || !/^\d{1,6}(\.\d{1,2})?$/.test(value) || Number(value)<=0 || Number(value)>10000 || !['USD','GBP','EUR','CAD','AUD'].includes(currency)) return '';
    return `${option.url}/${Number(value).toFixed(2)}${currency}`;
}

/** Cash App profile links do not provide a verified arbitrary-amount API here.
 * Copy the requested USD amount and open the saved recipient's profile. */
export function cashAppTip(raw, amount) {
    const option = authorTipOptions({cashapp:raw}).find(item=>item.kind==='cashapp');
    const value = String(amount || '').trim();
    if (!option || !/^\d{1,6}(\.\d{1,2})?$/.test(value) || Number(value)<=0 || Number(value)>10000) return null;
    return {url:option.url,amount:Number(value).toFixed(2),currency:'USD'};
}
