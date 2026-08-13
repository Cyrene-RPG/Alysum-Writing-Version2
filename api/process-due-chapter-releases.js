const { createClient } = require("@supabase/supabase-js");
const { SUPABASE_URL, createPublicClient } = require("../lib/seo-public.js");

function serviceRoleKey() {
    return String(
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_SECRET_KEY ||
            process.env.SUPABASE_SERVICE_KEY ||
            process.env.Secret ||
            ""
    ).trim();
}

function createLibraryClient() {
    const url = String(process.env.SUPABASE_URL || SUPABASE_URL || "").trim();
    const key = serviceRoleKey();
    if (url && key) {
        return createClient(url, key);
    }
    try {
        return createPublicClient();
    } catch {
        return null;
    }
}

function isAuthorized(req) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) return true;
    const auth = String(req.headers.authorization || "");
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    const querySecret = String(req.query?.secret || "").trim();
    return bearer === secret || querySecret === secret;
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        res.status(405).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    if (!isAuthorized(req)) {
        res.status(401).setHeader("Content-Type", "application/json").send(JSON.stringify({ error: "Unauthorized" }));
        return;
    }

    const supabase = createLibraryClient();
    if (!supabase) {
        res.status(503)
            .setHeader("Content-Type", "application/json")
            .send(JSON.stringify({ error: "Chapter service unavailable" }));
        return;
    }

    const bookId = String(req.query.book || req.query.bookId || "").trim();
    try {
        const { data, error } = await supabase.rpc("process_due_chapter_releases", {
            p_book_id: bookId || null,
        });
        if (error) throw error;
        const raw = data && typeof data === "object" ? data : {};
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(
            JSON.stringify({
                ok: true,
                releasedCount: Number(raw.releasedCount || 0),
                released: Array.isArray(raw.released) ? raw.released : [],
            })
        );
    } catch (err) {
        console.error("process-due-chapter-releases error", err);
        res.status(500)
            .setHeader("Content-Type", "application/json")
            .send(JSON.stringify({ error: "Could not process scheduled releases" }));
    }
};
