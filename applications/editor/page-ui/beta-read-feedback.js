import { activateBetaAnchor, chapterSelection, markBetaAnchors } from "./beta-read-selection.js";

const REVIEW_LABEL = { pending: "Pending review", accepted: "Accepted", rejected: "Rejected" };

function bindAnchorMarks(prose, host, id, kind) {
    const open = () => {
        const card = activateBetaAnchor(prose, host, id);
        card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        card?.focus({ preventScroll: true });
    };
    for (const mark of prose.querySelectorAll(".beta-anchored-text")) {
        if (mark.dataset.anchorId !== String(id)) continue;
        mark.tabIndex = 0;
        mark.setAttribute("role", "button");
        mark.setAttribute("aria-label", kind === "suggestion" ? "View suggested edit on this passage" : "View comment on this passage");
        mark.addEventListener("click", open);
        mark.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
        });
    }
}

export function mountBetaFeedback({ host, prose, chapter, threads, suggestions = [], send, reload }) {
    const heading = document.createElement("h2");
    heading.textContent = "Feedback";
    host.append(heading);
    if (!prose) throw new Error("Chapter content is not ready.");
    markBetaAnchors(prose, [
        ...(threads || []).map(thread => ({ ...thread, kind: "comment" })),
        ...(suggestions || []).map(suggestion => ({ ...suggestion, kind: "suggestion" })),
    ]);
    const toolbar = document.createElement("div");
    toolbar.className = "beta-selection-toolbar";
    toolbar.hidden = true;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Selected passage actions");
    const toolbarButton = document.createElement("button");
    toolbarButton.type = "button";
    toolbarButton.textContent = "✎ Comment";
    const suggestButton = document.createElement("button");
    suggestButton.type = "button";
    suggestButton.textContent = "✦ Suggest edit";
    toolbar.append(toolbarButton, suggestButton);
    document.body.append(toolbar);
    const positionToolbar = () => {
        const selection = window.getSelection();
        if (!selection?.rangeCount || selection.isCollapsed) return;
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        const width = toolbar.offsetWidth || 168;
        toolbar.style.left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)) + "px";
        const below = matchMedia("(pointer: coarse)").matches;
        const top = below ? rect.bottom + 8 : rect.top - 54;
        toolbar.style.top = Math.max(12, Math.min(window.innerHeight - 56, top)) + "px";
    };
    const composer = document.createElement("div");
    composer.className = "beta-selection-composer";
    composer.hidden = true;
    const selectedQuote = document.createElement("blockquote");
    const replacement = document.createElement("textarea");
    replacement.placeholder = "Edit this passage, or clear it to suggest deletion…";
    replacement.setAttribute("aria-label", "Suggested replacement text");
    replacement.hidden = true;
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
    composer.append(selectedQuote, replacement, input, actions, status);
    let mode = "comment";
    const openComposer = (nextMode) => {
        const finalSelection = chapterSelection(prose);
        if (finalSelection) captured = finalSelection;
        if (!captured) return;
        mode = nextMode;
        selectedQuote.textContent = captured.quote;
        replacement.hidden = mode !== "suggest";
        replacement.value = mode === "suggest" ? captured.quote : "";
        input.value = "";
        input.placeholder = mode === "suggest" ? "Optional note explaining your revision…" : "Write feedback about this passage…";
        input.setAttribute("aria-label", mode === "suggest" ? "Optional suggestion note" : "Comment on highlighted text");
        button.textContent = mode === "suggest" ? "Submit suggestion" : "Post comment";
        status.textContent = "Review the selected passage before submitting.";
        composer.hidden = false;
        toolbar.hidden = true;
        composer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (!matchMedia("(pointer: coarse)").matches) (mode === "suggest" ? replacement : input).focus();
    };
    host.append(composer);
    let captured = null;
    const capture = () => {
        if (!composer.isConnected) return;
        const next = chapterSelection(prose);
        if (next) captured = next;
        toolbar.hidden = !next || !composer.hidden;
        if (!toolbar.hidden) positionToolbar();
    };
    const onViewportChange = () => {
        if (toolbar.hidden || !composer.hidden) return;
        const live = chapterSelection(prose);
        if (!live) { toolbar.hidden = true; return; }
        positionToolbar();
    };
    document.addEventListener("selectionchange", capture);
    prose.addEventListener("pointerup", capture);
    prose.addEventListener("touchend", () => setTimeout(capture, 180), { passive: true });
    prose.addEventListener("keyup", capture);
    window.addEventListener("scroll", onViewportChange, { passive: true });
    window.addEventListener("resize", onViewportChange);
    toolbarButton.addEventListener("pointerdown", event => event.preventDefault());
    suggestButton.addEventListener("pointerdown", event => event.preventDefault());
    toolbarButton.addEventListener("click", () => openComposer("comment"));
    suggestButton.addEventListener("click", () => openComposer("suggest"));
    const dropToolbar = () => {
        document.removeEventListener("selectionchange", capture);
        window.removeEventListener("scroll", onViewportChange);
        window.removeEventListener("resize", onViewportChange);
        toolbar.remove();
    };
    cancel.addEventListener("click", () => { composer.hidden = true; captured = null; toolbar.hidden = true; });
    button.addEventListener("click", async () => {
        if (!captured) { status.textContent = "Highlight a passage first."; return; }
        button.disabled = true;
        try {
            if (mode === "suggest") {
                if (replacement.value === captured.quote) throw new Error("Your proposed wording must differ from the selected passage.");
                await send("suggest", {
                    chapterId: chapter.id, startOffset: captured.startOffset, endOffset: captured.endOffset,
                    quote: captured.quote, replacement: replacement.value, note: input.value
                });
            } else {
                await send("comment", {
                    chapterId: chapter.id, startOffset: captured.startOffset, endOffset: captured.endOffset,
                    quote: captured.quote, message: input.value
                });
            }
            composer.hidden = true;
            captured = null;
            toolbar.hidden = true;
            dropToolbar();
            await reload();
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    });
    for (const suggestion of suggestions) {
        const box = document.createElement("section");
        box.className = "comment beta-suggestion";
        box.id = "beta-suggestion-" + suggestion.id;
        box.dataset.anchorId = suggestion.id;
        box.dataset.anchorKind = "suggestion";
        box.tabIndex = -1;
        box.addEventListener("click", () => {
            activateBetaAnchor(prose, host, suggestion.id);
            const mark = prose.querySelector(`.beta-anchored-text[data-anchor-id="${CSS.escape(String(suggestion.id))}"]`);
            mark?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        box.addEventListener("focusin", () => activateBetaAnchor(prose, host, suggestion.id));
        const title = document.createElement("strong");
        title.textContent = "✦ " + (suggestion.authorLabel || "Reader") + " · " + (REVIEW_LABEL[suggestion.status] || suggestion.status);
        const original = document.createElement("blockquote");
        original.textContent = suggestion.quote;
        const proposed = document.createElement("p");
        proposed.className = "beta-suggestion-diff";
        const del = document.createElement("del");
        del.textContent = suggestion.quote;
        const ins = document.createElement("ins");
        ins.textContent = suggestion.replacement || "∅ (delete selection)";
        proposed.append(del, document.createTextNode(" → "), ins);
        box.append(title, original, proposed);
        if (suggestion.note) {
            const note = document.createElement("p");
            note.textContent = suggestion.note;
            box.append(note);
        }
        host.append(box);
        bindAnchorMarks(prose, host, suggestion.id, "suggestion");
    }
    for (const thread of threads) {
        const box = document.createElement("section");
        box.className = "comment";
        box.id = "beta-thread-" + thread.id;
        box.dataset.anchorId = thread.id;
        box.dataset.anchorKind = "comment";
        box.dataset.threadId = thread.id;
        box.tabIndex = -1;
        const activateThread = () => activateBetaAnchor(prose, host, thread.id);
        box.addEventListener("click", activateThread);
        box.addEventListener("focusin", activateThread);
        const quote = document.createElement("blockquote");
        quote.textContent = thread.quote;
        box.append(quote);
        for (const comment of thread.comments || []) {
            const line = document.createElement("p");
            line.textContent = `${comment.authorLabel}: ${comment.body}`;
            box.append(line);
            if (comment.canDelete) {
                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = "Delete my comment";
                remove.setAttribute("aria-label", "Delete your comment");
                const deleteStatus = document.createElement("p");
                deleteStatus.setAttribute("role", "status");
                deleteStatus.style.cssText = "font-size:.85rem;color:#e3cafa;margin:5px 0 12px";
                let awaitingConfirmation = false;
                remove.addEventListener("click", async () => {
                    if (!awaitingConfirmation) {
                        awaitingConfirmation = true;
                        remove.textContent = "Confirm delete";
                        deleteStatus.textContent = "Tap again to permanently remove your comment.";
                        return;
                    }
                    remove.disabled = true;
                    remove.textContent = "Deleting…";
                    deleteStatus.textContent = "Removing comment…";
                    try {
                        await send("delete-comment", { commentId: comment.id });
                        deleteStatus.textContent = "Comment removed.";
                        await reload();
                    } catch (error) {
                        remove.disabled = false;
                        remove.textContent = "Try deleting again";
                        deleteStatus.textContent = error?.message || "Could not delete comment.";
                    }
                });
                box.append(remove, deleteStatus);
            }
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
        bindAnchorMarks(prose, host, thread.id, "comment");
    }
}
