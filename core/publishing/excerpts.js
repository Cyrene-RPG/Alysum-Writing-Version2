/** Stored snapshots of explicitly selected manuscript text. */
export const MAX_EXCERPT_WORDS = 20000;
export const MAX_EXCERPT_CHARACTERS = 150000;
export function countExcerptWords(text) { return String(text || "").trim().split(/\s+/u).filter(Boolean).length; }
export function normalizeExcerpt(value) {
    const excerpt = typeof value?.excerpt === "string" ? value.excerpt.replace(/\r\n?/g, "\n").trim() : "";
    if (!excerpt) throw new Error("Select or paste the section you want to share.");
    const wordCount = countExcerptWords(excerpt);
    if (wordCount > MAX_EXCERPT_WORDS || excerpt.length > MAX_EXCERPT_CHARACTERS) throw new Error("Choose a section of up to 20,000 words and 150,000 characters.");
    const title = typeof value?.title === "string" ? value.title.trim() : "";
    const author = typeof value?.author === "string" ? value.author.trim() : "";
    if (title.length > 160 || author.length > 80) throw new Error("Shorten the title or author name.");
    return { title: title || "Untitled section", author, excerpt, wordCount };
}
export function excerptUrl(token, origin) {
    if (!/^[a-f0-9]{48}$/.test(String(token))) throw new Error("Invalid reading link.");
    const url = new URL("/shared-section", origin);
    url.hash = token;
    return url.href;
}
function readableError(error) {
    if (/permission denied|not authenticated|JWT/i.test(String(error?.message || error))) return new Error("Sign in to create or manage reading links.");
    if (/schema cache|does not exist|could not find.*function/i.test(String(error?.message || error))) return new Error("Reading-link storage has not been enabled for this site yet.");
    return new Error(error?.message || "Could not save the reading link. Try again.");
}
function mapShare(row, origin) {
    return { id: row.id, title: row.title || "Untitled section", author: row.author || "", wordCount: Number(row.word_count) || 0, createdAt: row.created_at, revokedAt: row.revoked_at || null, url: row.token ? excerptUrl(row.token, origin) : "" };
}
export function createExcerptApi(supabase, { origin }) {
    async function rpc(name, args) {
        const { data, error } = await supabase.rpc(name, args);
        if (error) throw readableError(error);
        return data;
    }
    return {
        async create(bookId, value) {
            const data = normalizeExcerpt(value);
            return mapShare(await rpc("create_wip_excerpt", { p_book_id: bookId, p_title: data.title, p_author: data.author, p_excerpt: data.excerpt }), origin);
        },
        async list(bookId) { return (await rpc("list_wip_excerpts", { p_book_id: bookId }) || []).map((row) => mapShare(row, origin)); },
        async revoke(id) {
            const result = await rpc("revoke_wip_excerpt", { p_id: id });
            if (!result) throw new Error("This link could not be disabled.");
        },
        async read(token) {
            if (!/^[a-f0-9]{48}$/.test(token)) return null;
            const data = await rpc("get_wip_excerpt", { p_token: token });
            return data ? { ...normalizeExcerpt(data), createdAt: data.created_at } : null;
        },
    };
}
