/** Public Beta Read guest actions. Called only after link-token validation. */
import { isMissingSuggestionsTable, matchSelectedQuote, snapshotPlainText } from "./beta-quote.js";

function tooSoon(timestamp) {
    return Boolean(timestamp) && Date.now() - Date.parse(timestamp) < 10000;
}

export async function handleBetaGuestAction({ action, body, read, rows, insert, update, sha, random, authenticatedUser = null }) {
    const betaId = read.id;
    if (action === "join") {
        const token = /^[a-f\d]{64}$/.test(String(body.guestToken || "")) ? body.guestToken : random();
        const hash = await sha(token);
        let guest = (await rows("snippet_beta_guests", { beta_read_id: `eq.${betaId}`, guest_token_hash: `eq.${hash}`, select: "id,guest_number" }))[0];
        if (!guest) {
            const existing = await rows("snippet_beta_guests", { beta_read_id: `eq.${betaId}`, select: "guest_number", order: "guest_number.desc", limit: "1" });
            guest = await insert("snippet_beta_guests", { beta_read_id: betaId, guest_number: (existing[0]?.guest_number || 0) + 1, guest_token_hash: hash, acknowledged_at: new Date().toISOString() });
        }
        if (authenticatedUser?.id) {
            const raw = authenticatedUser.user_metadata?.username || authenticatedUser.user_metadata?.user_name || authenticatedUser.user_metadata?.name || authenticatedUser.email?.split("@")[0] || "";
            const username = String(raw).trim().slice(0, 80);
            if (username) {
                await update("snippet_beta_guests", { id: "eq." + guest.id, beta_read_id: "eq." + betaId }, {
                    authenticated_user_id: authenticatedUser.id, authenticated_username: username,
                });
                guest.authenticated_username = username;
            }
        }
        return { guestToken: token, guestNumber: guest.guest_number, username: guest.authenticated_username || null };
    }
    if (!["comment", "suggest", "reply", "delete-comment"].includes(action)) return null;
    if (!/^[a-f\d]{64}$/.test(String(body.guestToken || ""))) throw new Error("Guest identity required.");
    const hash = await sha(body.guestToken);
    const guest = (await rows("snippet_beta_guests", { beta_read_id: `eq.${betaId}`, guest_token_hash: `eq.${hash}`, select: "id" }))[0];
    if (!guest) throw new Error("Guest identity not found.");
    if (action === "delete-comment") {
        const id = String(body.commentId || "");
        if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid comment.");
        const filters = { id: "eq." + id, beta_read_id: "eq." + betaId, guest_id: "eq." + guest.id, deleted_at: "is.null" };
        const changed = await update("snippet_beta_comments", filters, { body: "[Comment removed]", deleted_at: new Date().toISOString() });
        if (!changed.length) throw new Error("Comment not found or not yours.");
        return { deleted: true };
    }
    if (action === "suggest") {
        const recent = await rows("snippet_beta_comments", { guest_id: `eq.${guest.id}`, select: "created_at", order: "created_at.desc", limit: "1" });
        let recentSuggestions = [];
        try {
            recentSuggestions = await rows("snippet_beta_suggestions", { guest_id: "eq." + guest.id, select: "created_at", order: "created_at.desc", limit: "1" });
        } catch (error) {
            if (!isMissingSuggestionsTable(error)) throw error;
            throw new Error("Suggested edits are not available yet.");
        }
        if (tooSoon(recent[0]?.created_at) || tooSoon(recentSuggestions[0]?.created_at)) {
            throw new Error("Wait 10 seconds between feedback submissions.");
        }
        const chapter = (await rows("snippet_beta_chapters", { beta_read_id: `eq.${betaId}`, id: `eq.${body.chapterId}`, select: "id,content" }))[0];
        if (!chapter) throw new Error("Chapter not found.");
        const matched = matchSelectedQuote(snapshotPlainText(chapter.content), Number(body.startOffset), Number(body.endOffset), body.quote);
        if (!matched) throw new Error("Selected passage could not be matched. Please highlight it again.");
        const replacement = String(body.replacement ?? "");
        const note = String(body.note ?? "").trim();
        if (replacement.length > 2000 || replacement === matched.quote) throw new Error("Suggestion must differ from the selected text and be at most 2,000 characters.");
        if (note.length > 4000) throw new Error("Suggestion note is too long.");
        try {
            const suggestion = await insert("snippet_beta_suggestions", {
                beta_read_id: betaId, chapter_id: chapter.id, guest_id: guest.id,
                quote: matched.quote, start_offset: matched.startOffset, end_offset: matched.endOffset,
                replacement, note, status: "pending"
            });
            return { suggestionId: suggestion.id };
        } catch (error) {
            if (isMissingSuggestionsTable(error)) throw new Error("Suggested edits are not available yet.");
            throw error;
        }
    }
    const message = String(body.message || "").trim();
    if (!message || message.length > 4000) throw new Error("Comment must contain 1–4000 characters.");
    const recent = await rows("snippet_beta_comments", { guest_id: `eq.${guest.id}`, select: "created_at", order: "created_at.desc", limit: "1" });
    if (tooSoon(recent[0]?.created_at)) throw new Error("Wait 10 seconds between feedback submissions.");
    let threadId = String(body.threadId || "");
    if (action === "comment") {
        const chapter = (await rows("snippet_beta_chapters", { beta_read_id: `eq.${betaId}`, id: `eq.${body.chapterId}`, select: "id,content" }))[0];
        if (!chapter) throw new Error("Chapter not found.");
        const matched = matchSelectedQuote(snapshotPlainText(chapter.content), Number(body.startOffset), Number(body.endOffset), body.quote);
        if (!matched) throw new Error("Selected passage could not be matched. Please highlight it again.");
        const thread = await insert("snippet_beta_threads", {
            beta_read_id: betaId, chapter_id: chapter.id, quote: matched.quote,
            start_offset: matched.startOffset, end_offset: matched.endOffset
        });
        threadId = thread.id;
    } else {
        const thread = (await rows("snippet_beta_threads", { beta_read_id: `eq.${betaId}`, id: `eq.${threadId}`, select: "id" }))[0];
        if (!thread) throw new Error("Thread not found.");
    }
    const comment = await insert("snippet_beta_comments", { beta_read_id: betaId, thread_id: threadId, guest_id: guest.id, body: message });
    return { threadId, commentId: comment.id };
}
