/**
 * Notify search engines when stories are published or updated.
 * IndexNow → Bing, Yandex, Seznam (DuckDuckGo uses Bing’s index).
 * Sitemap ping → Google + Bing crawl queue.
 */
const { absUrl, siteOrigin } = require("./seo-public.js");

const INDEXNOW_KEY = "7f3a9c2e8b1d4f6a8e0c3b5d7f9a1c2e";

function hostFromOrigin(origin) {
    try {
        return new URL(origin).hostname;
    } catch {
        return String(origin || "")
            .replace(/^https?:\/\//, "")
            .replace(/\/.*$/, "");
    }
}

async function fetchOk(url, options = {}) {
    try {
        const res = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
        return { ok: res.ok, status: res.status, url };
    } catch (err) {
        return { ok: false, status: 0, url, error: String(err?.message || err) };
    }
}

async function submitIndexNow(urls, origin) {
    const list = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))];
    if (!list.length) return { ok: false, skipped: true, reason: "no urls" };

    const base = origin || siteOrigin() || "https://www.alysumwriting.com";
    const host = hostFromOrigin(base);
    const keyLocation = absUrl(base, `/${INDEXNOW_KEY}.txt`);
    const endpoint = "https://api.indexnow.org/indexnow";

    const res = await fetchOk(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
            host,
            key: INDEXNOW_KEY,
            keyLocation,
            urlList: list.slice(0, 10000),
        }),
    });

    return { ...res, engine: "indexnow", submitted: list.length };
}

async function pingSitemaps(origin) {
    const base = origin || siteOrigin() || "https://www.alysumwriting.com";
    const sitemapUrl = encodeURIComponent(absUrl(base, "/sitemap.xml"));
    const pings = await Promise.all([
        fetchOk(`https://www.google.com/ping?sitemap=${sitemapUrl}`),
        fetchOk(`https://www.bing.com/ping?sitemap=${sitemapUrl}`),
    ]);
    return {
        google: pings[0],
        bing: pings[1],
        sitemap: absUrl(base, "/sitemap.xml"),
    };
}

/**
 * @param {string[]} urls Book/author/library URLs to index
 * @param {string} [origin]
 */
async function notifySearchEngines(urls, origin) {
    const base = origin || siteOrigin() || "https://www.alysumwriting.com";
    const unique = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))];
    unique.push(absUrl(base, "/sitemap.xml"));

    const [indexNow, sitemapPing] = await Promise.all([
        submitIndexNow(unique, base),
        pingSitemaps(base),
    ]);

    return {
        origin: base,
        urls: unique,
        indexNow,
        sitemapPing,
    };
}

function bookReadUrl(origin, bookId) {
    return absUrl(origin || siteOrigin() || "https://www.alysumwriting.com", `/read.html?book=${encodeURIComponent(bookId)}`);
}

function authorPageUrl(origin, username) {
    const handle = String(username || "").trim();
    if (!handle) return "";
    return absUrl(origin || siteOrigin() || "https://www.alysumwriting.com", `/author.html?u=${encodeURIComponent(handle)}`);
}

module.exports = {
    INDEXNOW_KEY,
    notifySearchEngines,
    submitIndexNow,
    pingSitemaps,
    bookReadUrl,
    authorPageUrl,
};
