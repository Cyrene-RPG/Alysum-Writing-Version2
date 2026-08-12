const { createClient } = require("@supabase/supabase-js");
const { isAiBotUserAgent } = require("../lib/bot-agents.js");
const { libraryRowData, SUPABASE_URL, createPublicClient } = require("../lib/seo-public.js");
const { encodeLibraryChapters, isAlreadyEncodedAtRest } = require("../lib/shield-encode.js");

function serviceRoleKey() {
    // Prefer the standard name. Also accept a misnamed Vercel "Secret" entry
    // so chapter reads keep working until the env is renamed.
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
        return { client: createClient(url, key), mode: "service" };
    }
    try {
        return { client: createPublicClient(), mode: "public" };
    } catch {
        return { client: null, mode: "none" };
    }
}

function isSuspiciousCrossSite(req) {
    const site = String(req.headers["sec-fetch-site"] || "").toLowerCase();
    if (!site) return false;
    return site === "cross-site";
}

async function loadLibraryRow(supabase, bookId) {
    const primary = await supabase.from("library").select("id, data").eq("id", bookId).maybeSingle();
    if (!primary.error) return primary;

    // After library_catalog migration, anon cannot read raw library bodies.
    const msg = String(primary.error.message || primary.error || "");
    if (/permission|rls|policy|not authorized|42501/i.test(msg)) {
        const err = new Error(
            "Chapter service needs SUPABASE_SERVICE_ROLE_KEY on the host (Vercel env) to read library chapter bodies."
        );
        err.code = "SERVICE_ROLE_REQUIRED";
        throw err;
    }
    throw primary.error;
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

    const { client: supabase, mode } = createLibraryClient();
    if (!supabase) {
        res.status(503)
            .setHeader("Content-Type", "application/json")
            .send(JSON.stringify({ error: "Chapter service unavailable" }));
        return;
    }

    try {
        const { data, error } = await loadLibraryRow(supabase, bookId);
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

        const { chapters, shield } = await encodeLibraryChapters(
            Array.isArray(payload.chapters) ? payload.chapters : [],
            bookId,
            { alreadyEncoded: isAlreadyEncodedAtRest(payload) }
        );

        // Metadata only — never echo unencoded chapter bodies beside the shielded payload.
        const {
            chapters: _dropChapters,
            publishedChapterIds,
            ...meta
        } = payload;

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Robots-Tag", "noai, noimageai, noindex, nofollow");
        res.setHeader("X-Alysum-Library-Mode", mode);
        if (isSuspiciousCrossSite(req)) {
            res.setHeader("X-Content-Type-Options", "nosniff");
        }
        res.status(200).send(
            JSON.stringify({
                chapters,
                publishedChapterIds: Array.isArray(publishedChapterIds) ? publishedChapterIds : [],
                meta,
                shield,
            })
        );
    } catch (err) {
        console.error("book-content error", err);
        if (err && err.code === "SERVICE_ROLE_REQUIRED") {
            res.status(503)
                .setHeader("Content-Type", "application/json")
                .send(JSON.stringify({ error: "Chapter service unavailable", detail: err.message }));
            return;
        }
        res.status(500)
            .setHeader("Content-Type", "application/json")
            .send(JSON.stringify({ error: "Could not load chapters" }));
    }
};
