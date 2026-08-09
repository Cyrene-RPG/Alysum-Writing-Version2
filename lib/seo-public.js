/** Shared SEO helpers for Vercel API routes and build scripts. */
const SUPABASE_URL = "https://jrfxgpkpbacajhcwimgz.supabase.co";
const SUPABASE_KEY = "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";

const {
    SEARCH_BOT_UA,
    AI_BOT_UA,
    isSearchBotUserAgent,
    isAiBotUserAgent,
    isAnyBotUserAgent,
} = require("./bot-agents.js");

/** @deprecated Use SEARCH_BOT_UA — kept for existing imports. */
const BOT_UA = SEARCH_BOT_UA;

function createPublicClient() {
    const { createClient } = require("@supabase/supabase-js");
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function siteOrigin(fallbackHost) {
    const fromEnv = String(process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
    if (fromEnv) return fromEnv.replace(/\/$/, "");
    const host = String(fallbackHost || "").trim();
    if (host) {
        const proto = host.includes("localhost") ? "http" : "https";
        return `${proto}://${host.replace(/^https?:\/\//, "")}`;
    }
    const vercel = String(process.env.VERCEL_URL || "").trim();
    if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
    return "https://www.alysumwriting.com";
}

function absUrl(origin, pathOrUrl) {
    const raw = String(pathOrUrl || "").trim();
    if (!raw) return origin || "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!origin) return raw;
    return origin + (raw.startsWith("/") ? raw : `/${raw}`);
}

function escHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function libraryRowData(row) {
    const data = row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
    return Object.keys(data).length ? data : row && typeof row.data === "undefined" && typeof row === "object" ? row : {};
}

function normalizePublishedBook(row) {
    const data = libraryRowData(row);
    const id = String(row?.id || data.id || data.bookId || "").trim();
    if (!id || data.isPublished === false) return null;
    const updatedMs = typeof data.updated === "number" && Number.isFinite(data.updated) ? data.updated : 0;
    return {
        id,
        title: String(data.title || "Untitled").trim() || "Untitled",
        author: String(data.author || "Unknown").trim() || "Unknown",
        summary: String(data.summary || "").trim(),
        coverUrl: String(data.coverUrl || data.cover_url || "").trim(),
        ownerUid: String(data.ownerUid || data.user_id || row?.user_id || "").trim(),
        isAnonymous: !!(data.isAnonymous ?? data.is_anonymous),
        type: String(data.type || "fiction").trim() || "fiction",
        updatedMs,
    };
}

async function fetchPublishedBooks(supabase) {
    const { data, error } = await supabase.from("library").select("id, data, user_id");
    if (error) throw error;
    return (data || []).map(normalizePublishedBook).filter(Boolean);
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function fetchAuthorUsernames(supabase, userIds) {
    const ids = [...new Set(userIds.map((id) => String(id || "").trim()).filter(isUuid))];
    const map = new Map();
    if (!ids.length) return map;
    const chunkSize = 80;
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase.from("users").select("id, username").in("id", chunk);
        if (error) throw error;
        for (const row of data || []) {
            const username = String(row.username || "").trim();
            if (username) map.set(row.id, username);
        }
    }
    return map;
}

function truncate(text, maxLen) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.slice(0, maxLen - 1).trim()}…`;
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

function isBotUserAgent(userAgent) {
    return isAnyBotUserAgent(userAgent);
}

function bookAuthorLabel(author, isAnonymous) {
    if (isAnonymous) return "Anonymous";
    const name = String(author || "").trim();
    return name || "Unknown";
}

function bookPageTitle(title, author, isAnonymous) {
    const bookTitle = String(title || "Untitled").trim() || "Untitled";
    return `${bookTitle} by ${bookAuthorLabel(author, isAnonymous)} — Alysum`;
}

function bookMetaDescription(title, author, summary, isAnonymous, maxLen = 160) {
    const bookTitle = String(title || "Untitled").trim() || "Untitled";
    const authorName = bookAuthorLabel(author, isAnonymous);
    const blurb = String(summary || "").trim();

    if (blurb) {
        const lead = `${bookTitle} by ${authorName}. `;
        const room = maxLen - lead.length;
        if (room > 20) return lead + truncate(blurb, room);
    }

    return truncate(`Read ${bookTitle} by ${authorName} online for free on Alysum.`, maxLen);
}

function stripHtml(html) {
    return String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

function firstChapterExcerpt(payload) {
    const chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
    const publishedIds = Array.isArray(payload.publishedChapterIds) ? payload.publishedChapterIds : [];
    let list = chapters;
    if (publishedIds.length) {
        list = chapters.filter((ch) => ch && publishedIds.includes(ch.id));
    }
    list = [...list].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
    const first = list[0];
    if (!first) return { chapterTitle: "", excerpt: "" };

    return {
        chapterTitle: String(first.title || "Chapter 1").trim() || "Chapter 1",
        excerpt: truncate(stripHtml(first.content), 800),
    };
}

function buildBookJsonLd({ title, author, isAnonymous, summary, description, pageUrl, imageUrl, authorPageUrl }) {
    const authorName = bookAuthorLabel(author, isAnonymous);
    const authorEntity = { "@type": "Person", name: authorName };
    if (authorPageUrl && !isAnonymous) authorEntity.url = authorPageUrl;

    return {
        "@context": "https://schema.org",
        "@type": "Book",
        name: String(title || "Untitled").trim() || "Untitled",
        headline: String(title || "Untitled").trim() || "Untitled",
        description: String(summary || "").trim() || description,
        url: pageUrl,
        image: imageUrl,
        author: authorEntity,
        publisher: { "@type": "Organization", name: "Alysum" },
        isAccessibleForFree: true,
        inLanguage: "en",
    };
}

module.exports = {
    SUPABASE_URL,
    SUPABASE_KEY,
    BOT_UA,
    SEARCH_BOT_UA,
    AI_BOT_UA,
    isSearchBotUserAgent,
    isAiBotUserAgent,
    isAnyBotUserAgent,
    createPublicClient,
    siteOrigin,
    absUrl,
    escHtml,
    truncate,
    xmlEscape,
    isoDateFromMs,
    isBotUserAgent,
    normalizePublishedBook,
    fetchPublishedBooks,
    fetchAuthorUsernames,
    libraryRowData,
    bookAuthorLabel,
    bookPageTitle,
    bookMetaDescription,
    firstChapterExcerpt,
    buildBookJsonLd,
    stripHtml,
};
