/** Public Beta Read guest actions. Called only after link-token validation. */
export async function handleBetaGuestAction({ action, body, read, rows, insert, sha, random }) {
    const betaId = read.id;
    if (action === "join") {
        const token = /^[a-f\d]{64}$/.test(String(body.guestToken || "")) ? body.guestToken : random();
        const hash = await sha(token);
        let guest = (await rows("snippet_beta_guests", { beta_read_id: `eq.${betaId}`, guest_token_hash: `eq.${hash}`, select: "id,guest_number" }))[0];
        if (!guest) {
            const existing = await rows("snippet_beta_guests", { beta_read_id: `eq.${betaId}`, select: "guest_number", order: "guest_number.desc", limit: "1" });
            guest = await insert("snippet_beta_guests", { beta_read_id: betaId, guest_number: (existing[0]?.guest_number || 0) + 1, guest_token_hash: hash, acknowledged_at: new Date().toISOString() });
        }
        return { guestToken: token, guestNumber: guest.guest_number };
    }
    if (action !== "comment" && action !== "reply") return null;
    if (!/^[a-f\d]{64}$/.test(String(body.guestToken || ""))) throw new Error("Guest identity required.");
    const hash = await sha(body.guestToken);
    const guest = (await rows("snippet_beta_guests", { beta_read_id: `eq.${betaId}`, guest_token_hash: `eq.${hash}`, select: "id" }))[0];
    if (!guest) throw new Error("Guest identity not found.");
    const message = String(body.message || "").trim();
    if (!message || message.length > 4000) throw new Error("Comment must contain 1–4000 characters.");
    const recent = await rows("snippet_beta_comments", { guest_id: `eq.${guest.id}`, select: "created_at", order: "created_at.desc", limit: "1" });
    if (recent[0] && Date.now() - Date.parse(recent[0].created_at) < 10000) throw new Error("Wait 10 seconds before commenting again.");
    let threadId = String(body.threadId || "");
    if (action === "comment") {
        const chapter = (await rows("snippet_beta_chapters", { beta_read_id: `eq.${betaId}`, id: `eq.${body.chapterId}`, select: "id,content" }))[0];
        if (!chapter) throw new Error("Chapter not found.");
        const plain = String(chapter.content).replace(/<[^>]*>/g, "");
        const start = Number(body.startOffset), end = Number(body.endOffset);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > plain.length || end - start > 2000) throw new Error("Select a passage to comment on.");
        const thread = await insert("snippet_beta_threads", { beta_read_id: betaId, chapter_id: chapter.id, quote: plain.slice(start, end), start_offset: start, end_offset: end });
        threadId = thread.id;
    } else {
        const thread = (await rows("snippet_beta_threads", { beta_read_id: `eq.${betaId}`, id: `eq.${threadId}`, select: "id" }))[0];
        if (!thread) throw new Error("Thread not found.");
    }
    const comment = await insert("snippet_beta_comments", { beta_read_id: betaId, thread_id: threadId, guest_id: guest.id, body: message });
    return { threadId, commentId: comment.id };
}
