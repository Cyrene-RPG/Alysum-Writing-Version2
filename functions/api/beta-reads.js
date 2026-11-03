import { handleBetaGuestAction } from "./beta-guest-actions.js";
/** Dedicated Beta Read server API. No dependencies on other collaboration modules. */
const URL = "https://jrfxgpkpbacajhcwimgz.supabase.co";
const KEY = "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (data, status = 200) => Response.json(data, { status, headers });
const fail = (message, status = 400) => json({ error: message }, status);
const sha = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
const random = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); };
function db(env, table, { method = "GET", query = {}, body, prefer = "" } = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) params.set(k, v);
    const url = `${URL}/rest/v1/${table}?${params.toString()}`;
    return fetch(url, { method, headers: {
        apikey: KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function rows(env, table, query) {
    const response = await db(env, table, { query });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); console.error("Beta Read query failed", table, response.status, detail.code); throw new Error(`Beta Read database query failed (HTTP ${response.status}).`); }
    return response.json();
}
async function insert(env, table, body) {
    const response = await db(env, table, { method: "POST", body, prefer: "return=representation" });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); console.error("Beta Read insert failed", table, response.status, detail.code, detail.message); throw new Error(`Beta Read database insert failed (${table}, HTTP ${response.status}${detail.code ? `, ${detail.code}` : ""}).`); }
    return (await response.json())[0];
}
async function update(env, table, query, body) {
    const response = await db(env, table, { method: "PATCH", query, body, prefer: "return=representation" });
    if (!response.ok) throw new Error("Could not update beta read.");
    return response.json();
}
async function userFromRequest(request) {
    const auth = request.headers.get("Authorization") || "";
    if (!/^Bearer \S+$/.test(auth)) return null;
    const response = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: auth } });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
}
async function ownerRead(env, id, userId) {
    if (!/^[a-f\d-]{36}$/i.test(String(id))) return null;
    return (await rows(env, "snippet_beta_reads", { id: `eq.${id}`, owner_id: `eq.${userId}`, select: "*" }))[0] || null;
}
async function publicRead(env, token) {
    if (!/^[a-f\d]{64}$/.test(String(token || ""))) return null;
    const hash = await sha(token);
    return (await rows(env, "snippet_beta_reads", { share_token_hash: `eq.${hash}`, select: "*" }))[0] || null;
}
async function verifyBook(request, bookId, userId) {
    const response = await fetch(`${URL}/rest/v1/books?select=id&id=eq.${encodeURIComponent(bookId)}&user_id=eq.${encodeURIComponent(userId)}`, {
        headers: { apikey: KEY, Authorization: request.headers.get("Authorization") },
    });
    return response.ok && (await response.json()).length === 1;
}
async function threadsForChapter(env, betaId, chapterId) {
    const threads = await rows(env, "snippet_beta_threads", { beta_read_id: `eq.${betaId}`, chapter_id: `eq.${chapterId}`, select: "*", order: "created_at.asc" });
    const guests = await rows(env, "snippet_beta_guests", { beta_read_id: `eq.${betaId}`, select: "id,guest_number,authenticated_username" });
    const labels = new Map(guests.map(g => [g.id, g.authenticated_username || `Guest ${g.guest_number}`]));
    const comments = await rows(env, "snippet_beta_comments", { beta_read_id: `eq.${betaId}`, select: "*", order: "created_at.asc" });
    return threads.map(t => ({ id: t.id, quote: t.quote, startOffset: t.start_offset, endOffset: t.end_offset, resolvedAt: t.resolved_at, comments: comments.filter(c => c.thread_id === t.id).map(c => ({
        id: c.id, parentCommentId: c.parent_comment_id, body: c.deleted_at ? "[Comment removed]" : c.body,
        authorLabel: c.author_id ? "Author" : labels.get(c.guest_id) || "Guest", guestId: c.guest_id, deleted: Boolean(c.deleted_at), createdAt: c.created_at,
    })) })).filter(thread => thread.comments.some(comment => !comment.deleted));
}
async function suggestionsForChapter(env, betaId, chapterId) {
    const suggestions = await rows(env, "snippet_beta_suggestions", {
        beta_read_id: "eq." + betaId, chapter_id: "eq." + chapterId,
        select: "id,guest_id,quote,start_offset,end_offset,replacement,note,status,reviewed_at,created_at",
        order: "created_at.asc"
    });
    const guests = await rows(env, "snippet_beta_guests", {
        beta_read_id: "eq." + betaId, select: "id,guest_number,authenticated_username"
    });
    const names = new Map(guests.map(g => [g.id, g.authenticated_username || "Guest " + g.guest_number]));
    return suggestions.map(s => ({
        id: s.id, quote: s.quote, startOffset: s.start_offset, endOffset: s.end_offset,
        replacement: s.replacement, note: s.note, status: s.status,
        reviewedAt: s.reviewed_at, createdAt: s.created_at,
        authorLabel: names.get(s.guest_id) || "Guest"
    }));
}
export async function onRequest({ request, env }) {
    if (request.method !== "POST") return fail("Method not allowed.", 405);
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return fail("Beta Read service is not configured.", 503);
    if (Number(request.headers.get("content-length") || 0) > 1200000) return fail("Request too large.", 413);
    let body;
    try { body = await request.json(); } catch { return fail("Invalid request."); }
    if (!body || typeof body !== "object") return fail("Invalid request.");
    const action = String(body.action || "");
    try {
        if (["create", "list", "close", "delete", "threads", "moderate", "review-suggestion", "snapshot"].includes(action)) {
            const user = await userFromRequest(request);
            if (!user) return fail("Sign in required.", 401);
            if (action === "create") {
                const s = body.snapshot;
                if (!s || typeof s !== "object" || !Array.isArray(s.chapters) || !s.chapters.length || s.chapters.length > 100) return fail("Choose 1–100 chapters.");
                if (!/^[\w-]{1,200}$/.test(String(s.sourceBookId || ""))) return fail("Invalid book.");
                if (!await verifyBook(request, s.sourceBookId, user.id)) return fail("Book ownership could not be verified.", 403);
                if (!String(s.authorUsername || "").trim() || String(s.authorUsername).length > 100) return fail("Invalid author name.");
                if (s.chapters.some(c => !c.sourceChapterId || !c.title || !c.content || String(c.content).length > 300000)) return fail("Invalid chapter.");
                const token = random();
                const saved = await insert(env, "snippet_beta_reads", { owner_id: user.id, source_book_id: s.sourceBookId, title: String(s.title || "Untitled").slice(0, 200), author_username: String(s.authorUsername), share_token_hash: await sha(token) });
                try {
                    for (const [ordinal, chapter] of s.chapters.entries()) {
                        await insert(env, "snippet_beta_chapters", { beta_read_id: saved.id, source_chapter_id: String(chapter.sourceChapterId), ordinal, title: String(chapter.title).slice(0, 200), content: String(chapter.content) });
                    }
                } catch (error) {
                    await db(env, "snippet_beta_reads", { method: "DELETE", query: { id: `eq.${saved.id}` } });
                    throw error;
                }
                return json({ id: saved.id, url: `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host") || "alysumwriting.com"}/beta-read/${token}` });
            }
            if (action === "list") {
                const reads = await rows(env, "snippet_beta_reads", { owner_id: `eq.${user.id}`, select: "id,title,author_username,status,created_at,closed_at", order: "created_at.desc" });
                return json({ reads });
            }
            const read = await ownerRead(env, body.id, user.id);
            if (!read) return fail("Beta read not found.", 404);
            if (action === "close") {
                await update(env, "snippet_beta_reads", { id: `eq.${read.id}` }, { status: "closed", closed_at: new Date().toISOString() });
                return json({ closed: true });
            }
            if (action === "delete") {
                if (body.confirmTitle !== read.title) return fail("Type the exact document title to confirm deletion.");
                const response = await db(env, "snippet_beta_reads", {
                    method: "DELETE",
                    query: { id: `eq.${read.id}`, owner_id: `eq.${user.id}` },
                    prefer: "return=representation",
                });
                if (!response.ok) return fail("Could not delete beta copy. Its feedback may still be linked to it.", 409);
                const removed = await response.json();
                return removed.length ? json({ deleted: true }) : fail("Beta copy not found.", 404);
            }
            if (action === "snapshot") {
                const chapters = await rows(env, "snippet_beta_chapters", {
                    beta_read_id: `eq.${read.id}`,
                    select: "id,title,content,ordinal",
                    order: "ordinal.asc",
                });
                return json({ id: read.id, title: read.title, authorUsername: read.author_username, status: read.status, chapters });
            }
            if (action === "threads") {
                const chapters = await rows(env, "snippet_beta_chapters", { beta_read_id: `eq.${read.id}`, select: "id,title,ordinal", order: "ordinal.asc" });
                return json({ chapters: await Promise.all(chapters.map(async chapter => ({ ...chapter, threads: await threadsForChapter(env, read.id, chapter.id), suggestions: await suggestionsForChapter(env, read.id, chapter.id) }))) });
            }
            if (action === "review-suggestion") {
                const status = String(body.status || "");
                if (!["accepted", "rejected", "pending"].includes(status)) return fail("Invalid review status.");
                const suggestionId = String(body.suggestionId || "");
                if (!/^[a-f0-9-]{36}$/i.test(suggestionId)) return fail("Invalid suggestion.");
                const changed = await update(env, "snippet_beta_suggestions", {
                    id: "eq." + suggestionId, beta_read_id: "eq." + read.id
                }, { status, reviewed_at: status === "pending" ? null : new Date().toISOString() });
                return changed.length ? json({ updated: true, status }) : fail("Suggestion not found.", 404);
            }
            if (action === "moderate") {
                const op = String(body.operation || "");
                const thread = (await rows(env, "snippet_beta_threads", { id: `eq.${body.threadId}`, beta_read_id: `eq.${read.id}`, select: "id" }))[0];
                if (!thread) return fail("Thread not found.", 404);
                if (op === "resolve" || op === "reopen") {
                    await update(env, "snippet_beta_threads", { id: `eq.${thread.id}` }, { resolved_at: op === "resolve" ? new Date().toISOString() : null });
                    return json({ updated: true });
                }
                if (op === "delete-comment") {
                    const changed = await update(env, "snippet_beta_comments", { id: `eq.${body.commentId}`, thread_id: `eq.${thread.id}` }, { deleted_at: new Date().toISOString(), body: "[Comment removed]" });
                    return changed.length ? json({ updated: true }) : fail("Comment not found.", 404);
                }
                return fail("Unknown moderation operation.");
            }
        }
        const read = await publicRead(env, body.token);
        if (!read || read.status !== "active") return fail("This beta read is unavailable or closed.", 404);
        if (["join", "comment", "suggest", "reply", "delete-comment"].includes(action)) {
            try {
                const result = await handleBetaGuestAction({
                    action, body, read,
                    rows: (table, query) => rows(env, table, query),
                    insert: (table, data) => insert(env, table, data),
                    update: (table, query, data) => update(env, table, query, data),
                    sha, random, authenticatedUser: await userFromRequest(request),
                });
                return json(result);
            } catch (error) {
                return fail(error.message || "Could not save feedback.");
            }
        }
        if (action === "preview") return json({ id: read.id, authorUsername: read.author_username, status: read.status });
        if (action === "read" || action === "chapter-threads") {
            const guestHash = /^[a-f0-9]{64}$/.test(String(body.guestToken || "")) ? await sha(body.guestToken) : "";
            const guest = (await rows(env, "snippet_beta_guests", { beta_read_id: `eq.${read.id}`, guest_token_hash: `eq.${guestHash}`, select: "id,acknowledged_at" }))[0];
            if (!guest?.acknowledged_at) return fail("Copyright acknowledgment required.", 403);
        }
        if (action === "read") {
            const chapters = await rows(env, "snippet_beta_chapters", { beta_read_id: `eq.${read.id}`, select: "id,title,content,ordinal", order: "ordinal.asc" });
            return json({ id: read.id, title: read.title, authorUsername: read.author_username, chapters });
        }
        if (action === "chapter-threads") {
            const chapter = (await rows(env, "snippet_beta_chapters", { id: `eq.${body.chapterId}`, beta_read_id: `eq.${read.id}`, select: "id" }))[0];
            if (!chapter) return fail("Chapter not found.", 404);
            const guestHash = await sha(String(body.guestToken || ""));
            const guest = (await rows(env, "snippet_beta_guests", { beta_read_id: "eq." + read.id, guest_token_hash: "eq." + guestHash, select: "id" }))[0];
            const threads = await threadsForChapter(env, read.id, chapter.id);
            return json({ threads: threads.map(t => ({ ...t, comments: t.comments.map(c => ({ ...c, canDelete: !c.deleted && Boolean(guest) && c.guestId === guest.id, guestId: undefined })) })), suggestions: await suggestionsForChapter(env, read.id, chapter.id) });
        }
        return fail("Unknown action.");
    } catch (error) {
        console.error("Beta Read API failed", action, error?.message); return fail(error?.message || "Beta Read request failed.", 503);
    }
}
