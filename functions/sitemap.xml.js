/**
 * Cloudflare Pages Function: GET /sitemap.xml.
 *
 * Same output as core/server/http-handlers/sitemap.xml.js (the Vercel version), but it talks
 * to Supabase with plain fetch instead of @supabase/supabase-js, and asks for only the book
 * fields the sitemap uses instead of each book's full contents.
 */

const SUPABASE_URL = "https://jrfxgpkpbacajhcwimgz.supabase.co";
const SUPABASE_KEY = "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";

const STATIC_PAGES = [
    { loc: "/", changefreq: "weekly", priority: "1.0" },
    { loc: "/signup.html", changefreq: "yearly", priority: "0.5" },
    { loc: "/login.html", changefreq: "yearly", priority: "0.4" },
    { loc: "/privacy-policy.html", changefreq: "yearly", priority: "0.3" },
    { loc: "/terms-of-service.html", changefreq: "yearly", priority: "0.3" },
];

const BOOK_FIELDS = [
    "id",
    "user_id",
    "isPublished:data->isPublished",
    "updated:data->updated",
    "isAnonymous:data->isAnonymous",
    "is_anonymous:data->is_anonymous",
    "ownerUid:data->>ownerUid",
].join(",");

async function supabaseGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`supabase_${res.status}: ${await res.text()}`);
    return res.json();
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function fetchPublishedBooks() {
    const rows = await supabaseGet(`library?select=${BOOK_FIELDS}`);
    return rows
        .filter((row) => row.id && row.isPublished !== false)
        .map((row) => ({
            id: String(row.id),
            isAnonymous: !!(row.isAnonymous ?? row.is_anonymous),
            ownerUid: String(row.ownerUid || row.user_id || "").trim(),
            updatedMs: typeof row.updated === "number" && Number.isFinite(row.updated) ? row.updated : 0,
        }));
}

async function fetchAuthorUsernames(userIds) {
    const ids = [...new Set(userIds.filter(isUuid))];
    const names = new Set();
    for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80);
        const rows = await supabaseGet(`users?select=id,username&id=in.(${chunk.join(",")})`);
        for (const row of rows) {
            const username = String(row.username || "").trim();
            if (username) names.add(username);
        }
    }
    return [...names];
}

function xmlEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function isoDateFromMs(ms) {
    if (!ms || !Number.isFinite(ms)) return null;
    try {
        return new Date(ms).toISOString().slice(0, 10);
    } catch {
        return null;
    }
}

function urlEntry(origin, { loc, changefreq, priority, lastmod }) {
    return [
        "  <url>",
        `    <loc>${xmlEscape(origin + loc)}</loc>`,
        lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>` : "",
        changefreq ? `    <changefreq>${xmlEscape(changefreq)}</changefreq>` : "",
        priority ? `    <priority>${xmlEscape(priority)}</priority>` : "",
        "  </url>",
    ]
        .filter(Boolean)
        .join("\n");
}

export async function onRequestGet({ request, env }) {
    const origin = String(env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");

    try {
        const books = await fetchPublishedBooks();
        const authorHandles = await fetchAuthorUsernames(
            books.filter((book) => !book.isAnonymous && book.ownerUid).map((book) => book.ownerUid)
        );

        const entries = STATIC_PAGES.map((page) => urlEntry(origin, page));
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

        return new Response(xml, {
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
            },
        });
    } catch (err) {
        console.error("sitemap error", err);
        return new Response("Could not generate sitemap.", {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }
}
