export function mountBetaFeedback({ host, chapter, threads, send, reload }) {
    const heading = document.createElement("h2");
    heading.textContent = "Feedback";
    host.append(heading);
    const input = document.createElement("textarea");
    input.placeholder = "Comment on a selected passage";
    const button = document.createElement("button");
    button.textContent = "Comment on selection";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    host.append(input, button, status);
    button.addEventListener("click", async () => {
        const selection = window.getSelection();
        const selected = selection?.toString() || "";
        const text = String(chapter.content || "").replace(/<[^>]*>/g, "");
        const startOffset = text.indexOf(selected);
        if (!selected || startOffset < 0) { status.textContent = "Highlight a passage first."; return; }
        button.disabled = true;
        try {
            await send("comment", { chapterId: chapter.id, startOffset, endOffset: startOffset + selected.length, message: input.value });
            await reload();
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    });
    for (const thread of threads) {
        const box = document.createElement("section");
        box.className = "comment";
        const quote = document.createElement("blockquote");
        quote.textContent = thread.quote;
        box.append(quote);
        for (const comment of thread.comments || []) {
            const line = document.createElement("p");
            line.textContent = `${comment.authorLabel}: ${comment.body}`;
            box.append(line);
        }
        const reply = document.createElement("textarea");
        reply.placeholder = "Reply";
        const replyButton = document.createElement("button");
        replyButton.textContent = "Reply";
        const replyStatus = document.createElement("p");
        replyStatus.setAttribute("role", "status");
        replyButton.addEventListener("click", async () => {
            replyButton.disabled = true;
            try { await send("reply", { threadId: thread.id, message: reply.value }); await reload(); }
            catch (error) { replyStatus.textContent = error.message; }
            finally { replyButton.disabled = false; }
        });
        box.append(reply, replyButton, replyStatus);
        host.append(box);
    }
}
