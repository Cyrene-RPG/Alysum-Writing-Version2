const { createClient } = require("@supabase/supabase-js");
const { isAiBotUserAgent } = require("../lib/bot-agents.js");
const { libraryRowData, SUPABASE_URL } = require("../lib/seo-public.js");

function createServiceClient() {
    const url = String(process.env.SUPABASE_URL || SUPABASE_URL || "").trim();
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!url || !key) return null;
    return createClient(url, key);
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.status(405).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    const userAgent = String(req.headers["user-agent"] || "");
    if (isAiBotUserAgent(userAgent)) {
        res.status(403)
            .setHeader("Content-Type", "application/json")
            .setHeader("X-Robots-Tag", "noai, noimageai, noindex, nofollow")
            .send(JSON.stringify({ error: "Forbidden" }));
        return;
    }

    const bookId = String(req.query.book || req.query.id || req.query.bookId || "").trim();
    if (!bookId) {
        res.status(400).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Missing book id" }));
        return;
    }

    const supabase = createServiceClient();
    if (!supabase) {
        res.status(503)
            .setHeader("Content-Type", "application/json")
            .send(JSON.stringify({ error: "Chapter service unavailable" }));
        return;
    }

    try {
        const { data, error } = await supabase.from("library").select("id, data").eq("id", bookId).maybeSingle();
        if (error) throw error;
        if (!data) {
            res.status(404).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Not found" }));
            return;
        }

        const payload = libraryRowData(data);
        if (payload.isPublished === false) {
            res.status(404).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Not found" }));
            return;
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Robots-Tag", "noai, noimageai, noindex, nofollow");
        res.status(200).send(
            JSON.stringify({
                chapters: Array.isArray(payload.chapters) ? payload.chapters : [],
                publishedChapterIds: Array.isArray(payload.publishedChapterIds) ? payload.publishedChapterIds : [],
            })
        );
    } catch (err) {
        console.error("book-content error", err);
        res.status(500).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Could not load chapters" }));
    }
};
