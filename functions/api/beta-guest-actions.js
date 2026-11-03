/** Public Beta Read guest actions. Called only after link-token validation. */
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
    const message = action === "suggest" ? "Suggested revision" : String(body.message || "").trim();
    if (!message || message.length > 4000) throw new Error("Comment must contain 1–4000 characters.");
    const recent = await rows("snippet_beta_comments", { guest_id: `eq.${guest.id}`, select: "created_at", order: "created_at.desc", limit: "1" });
    if (recent[0] && Date.now() - Date.parse(recent[0].created_at) < 10000) throw new Error("Wait 10 seconds before commenting again.");
    let threadId = String(body.threadId || "");
    if (action === "comment" || action === "suggest") {
        const chapter = (await rows("snippet_beta_chapters", { beta_read_id: `eq.${betaId}`, id: `eq.${body.chapterId}`, select: "id,content" }))[0];
        if (!chapter) throw new Error("Chapter not found.");
        // Reconstruct the reader's text stream from the snapshot HTML.
        const plain = String(chapter.content)
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]*>/g, "")
            .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
                const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
                if (code[0] !== "#") return named[code.toLowerCase()] || entity;
                const number = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
                return Number.isInteger(number) && number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : entity;
            });
        const start = Number(body.startOffset), end = Number(body.endOffset);
        const selectedQuote = String(body.quote || "");
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end - start > 2000 || !selectedQuote || selectedQuote.length !== end - start) {
            throw new Error("Select a passage to comment on.");
        }
        // Reject missing quotes; tolerate source-HTML entity offset differences
        // by choosing the occurrence nearest the original browser selection.
        let anchorStart = plain.slice(start, end) === selectedQuote ? start : -1;
        if (anchorStart < 0) {
            let match = plain.indexOf(selectedQuote), nearest = Infinity;
            while (match !== -1) {
                const distance = Math.abs(match - start);
                if (distance < nearest) { nearest = distance; anchorStart = match; }
                match = plain.indexOf(selectedQuote, match + 1);
            }
        }
        if (anchorStart < 0) throw new Error("Selected passage could not be matched. Please highlight it again.");
        const anchorEnd = anchorStart + selectedQuote.length;
        if (action === "suggest") {
            const replacement = String(body.replacement ?? "");
            const note = String(body.note ?? "").trim();
            if (replacement.length > 2000 || replacement === selectedQuote) throw new Error("Suggestion must differ from the selected text and be at most 2,000 characters.");
            if (note.length > 4000) throw new Error("Suggestion note is too long.");
            const suggestion = await insert("snippet_beta_suggestions", {
                beta_read_id: betaId, chapter_id: chapter.id, guest_id: guest.id,
                quote: selectedQuote, start_offset: anchorStart, end_offset: anchorEnd,
                replacement, note, status: "pending"
            });
            return { suggestionId: suggestion.id };
        }
        const thread = await insert("snippet_beta_threads", { beta_read_id: betaId, chapter_id: chapter.id, quote: selectedQuote, start_offset: anchorStart, end_offset: anchorEnd });
        threadId = thread.id;
    } else {
        const thread = (await rows("snippet_beta_threads", { beta_read_id: `eq.${betaId}`, id: `eq.${threadId}`, select: "id" }))[0];
        if (!thread) throw new Error("Thread not found.");
    }
    const comment = await insert("snippet_beta_comments", { beta_read_id: betaId, thread_id: threadId, guest_id: guest.id, body: message });
    return { threadId, commentId: comment.id };
}
