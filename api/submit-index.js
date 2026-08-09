const {
    siteOrigin,
    absUrl,
    fetchPublishedBooks,
    fetchAuthorUsernames,
    createPublicClient,
} = require("../lib/seo-public.js");
const { notifySearchEngines, bookReadUrl, authorPageUrl } = require("../lib/index-notify.js");

module.exports = async function handler(req, res) {
    if (req.method !== "POST" && req.method !== "GET") {
        res.status(405).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    const origin =
        siteOrigin(req.headers.host) ||
        `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const body = req.method === "POST" && req.body ? req.body : {};
    const bookId = String(body.bookId || req.query.bookId || "").trim();
    const authorUsername = String(body.authorUsername || req.query.authorUsername || "").trim();
    const submitAll = body.all === true || req.query.all === "1" || req.query.all === "true";

    try {
        const urls = [absUrl(origin, "/library.html"), absUrl(origin, "/")];

        if (submitAll) {
            const supabase = createPublicClient();
            const books = await fetchPublishedBooks(supabase);
            for (const book of books) {
                urls.push(bookReadUrl(origin, book.id));
            }
            const authorIds = books.filter((b) => !b.isAnonymous && b.ownerUid).map((b) => b.ownerUid);
            const usernames = await fetchAuthorUsernames(supabase, authorIds);
            for (const username of usernames.values()) {
                urls.push(authorPageUrl(origin, username));
            }
        } else {
            if (bookId) urls.push(bookReadUrl(origin, bookId));
            if (authorUsername) urls.push(authorPageUrl(origin, authorUsername));
        }

        if (!bookId && !authorUsername && !submitAll) {
            res.status(400)
                .setHeader("Content-Type", "application/json")
                .send(JSON.stringify({ error: "Provide bookId, authorUsername, or all=1" }));
            return;
        }

        const result = await notifySearchEngines(urls, origin);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(JSON.stringify({ ok: true, ...result }));
    } catch (err) {
        console.error("submit-index error", err);
        res.status(500)
            .setHeader("Content-Type", "application/json")
            .send(JSON.stringify({ ok: false, error: String(err?.message || err) }));
    }
};
