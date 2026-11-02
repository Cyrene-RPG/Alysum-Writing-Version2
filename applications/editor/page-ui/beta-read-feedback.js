import { chapterSelection, markBetaAnchors } from "./beta-read-selection.js";
export function mountBetaFeedback({ host, prose, chapter, threads, send, reload }) {
    const heading = document.createElement("h2");
    heading.textContent = "Feedback";
    host.append(heading);
    if (!prose) throw new Error("Chapter content is not ready.");
    markBetaAnchors(prose, threads);
    const toolbar = document.createElement("div");
    toolbar.className = "beta-selection-toolbar";
    toolbar.hidden = true;
    const toolbarButton = document.createElement("button");
    toolbarButton.type = "button";
    toolbarButton.textContent = "✎ Comment";
    toolbar.append(toolbarButton);
    document.body.append(toolbar);
    const composer = document.createElement("div");
    composer.className = "beta-selection-composer";
    composer.hidden = true;
    const selectedQuote = document.createElement("blockquote");
    const input = document.createElement("textarea");
    input.placeholder = "Write feedback about this passage…";
    input.setAttribute("aria-label", "Comment on highlighted text");
    const actions = document.createElement("div");
    actions.className = "beta-selection-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Post comment";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    actions.append(button, cancel);
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    composer.append(selectedQuote, input, actions, status);
    host.append(composer);
    let captured = null;
    const capture = () => {
        if (!composer.isConnected) return;
        const next = chapterSelection(prose);
        if (next) captured = next;
        toolbar.hidden = !next || !composer.hidden;
    };
    document.addEventListener("selectionchange", capture);
    prose.addEventListener("pointerup", capture);
    prose.addEventListener("touchend", () => setTimeout(capture, 180), { passive: true });
    prose.addEventListener("keyup", capture);
    toolbarButton.addEventListener("pointerdown", event => event.preventDefault());
    toolbarButton.addEventListener("click", () => {
        if (!captured) return;
        selectedQuote.textContent = captured.quote;
        composer.hidden = false;
        toolbar.hidden = true;
        composer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (!matchMedia("(pointer: coarse)").matches) input.focus();
    });
    cancel.addEventListener("click", () => { composer.hidden = true; captured = null; toolbar.hidden = true; });
    button.addEventListener("click", async () => {
        if (!captured) { status.textContent = "Highlight a passage first."; return; }
        button.disabled = true;
        try {
            await send("comment", { chapterId: chapter.id, startOffset: captured.startOffset, endOffset: captured.endOffset, message: input.value });
            composer.hidden = true;
            captured = null;
            toolbar.hidden = true;
            document.removeEventListener("selectionchange", capture);
            toolbar.remove();
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
