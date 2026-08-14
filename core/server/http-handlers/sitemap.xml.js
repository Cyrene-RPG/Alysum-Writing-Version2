const {
    createPublicClient,
    siteOrigin,
    absUrl,
    xmlEscape,
    isoDateFromMs,
    fetchPublishedBooks,
    fetchAuthorUsernames,
} = require("../utilities/seo-public.js");

const STATIC_PAGES = [
    { loc: "/", changefreq: "weekly", priority: "1.0" },
    { loc: "/signup.html", changefreq: "yearly", priority: "0.5" },
    { loc: "/login.html", changefreq: "yearly", priority: "0.4" },
    { loc: "/privacy-policy.html", changefreq: "yearly", priority: "0.3" },
    { loc: "/terms-of-service.html", changefreq: "yearly", priority: "0.3" },
];

function urlEntry(origin, { loc, changefreq, priority, lastmod }) {
    const href = absUrl(origin, loc);
    const parts = [
        "  <url>",
        `    <loc>${xmlEscape(href)}</loc>`,
        lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>` : "",
        changefreq ? `    <changefreq>${xmlEscape(changefreq)}</changefreq>` : "",
        priority ? `    <priority>${xmlEscape(priority)}</priority>` : "",
        "  </url>",
    ].filter(Boolean);
    return parts.join("\n");
}

module.exports = async function handler(req, res) {
    const origin = siteOrigin(req.headers.host) ||
        `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    try {
        const supabase = createPublicClient();
        const books = await fetchPublishedBooks(supabase);
        const authorIds = books.filter((book) => !book.isAnonymous && book.ownerUid).map((book) => book.ownerUid);
        const usernames = await fetchAuthorUsernames(supabase, authorIds);
        const authorHandles = [...new Set([...usernames.values()])];

        const entries = [];

        for (const page of STATIC_PAGES) {
            entries.push(urlEntry(origin, page));
        }

        for (const book of books) {
            entries.push(
                urlEntry(origin, {
                    loc: `/read.html?book=${encodeURIComponent(book.id)}`,
                    changefreq: "weekly",
                    priority: "0.8",
                    lastmod: isoDateFromMs(book.updatedMs),
                })
            );
        }

        for (const username of authorHandles) {
            entries.push(
                urlEntry(origin, {
                    loc: `/author.html?u=${encodeURIComponent(username)}`,
                    changefreq: "weekly",
                    priority: "0.7",
                })
            );
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`;

        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        res.status(200).send(xml);
    } catch (err) {
        console.error("sitemap error", err);
        res.status(500).setHeader("Content-Type", "text/plain; charset=utf-8").send("Could not generate sitemap.");
    }
};
