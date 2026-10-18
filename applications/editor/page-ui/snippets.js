import { createSnippetLink, normalizeSnippet, countSnippetWords, MAX_SNIPPET_LENGTH } from "/core/publishing/snippets.js";

/** Share a selection or pasted excerpt, never an implicit whole-manuscript export. */
export function mountSnippetSharing({ button, pageEl, getBook, getAuthor = () => "" }) {
    if (!button || !pageEl) return;
    const dialog = document.createElement("dialog");
    dialog.className = "snippet-dialog";
    dialog.setAttribute("aria-labelledby", "snippet-dialog-title");
    dialog.innerHTML = `
        <div class="snippet-dialog-head"><div><p class="snippet-label">Read-only excerpt</p><h2 id="snippet-dialog-title">Share snippet</h2></div><button type="button" class="snippet-close" aria-label="Close sharing dialog">×</button></div>
        <form id="snippet-form">
            <div class="snippet-fields">
                <label for="snippet-title">Title<input id="snippet-title" maxlength="120" autocomplete="off" /></label>
                <label for="snippet-byline">Author <span>(optional)</span><input id="snippet-byline" maxlength="80" autocomplete="off" /></label>
                <label for="snippet-excerpt">Excerpt<textarea id="snippet-excerpt" maxlength="${MAX_SNIPPET_LENGTH}" required placeholder="Select text in the editor first, or paste your excerpt here."></textarea></label>
                <p id="snippet-count" class="snippet-hint" aria-live="polite"></p>
                <label for="snippet-note">Note for readers <span>(optional)</span><textarea id="snippet-note" maxlength="280" rows="2" placeholder="For example: This is from chapter 3."></textarea></label>
            </div>
            <div id="snippet-preview" hidden><p class="snippet-label">Reader preview</p><article class="snippet-preview-card"><h3 id="snippet-preview-title"></h3><p id="snippet-preview-byline" class="snippet-byline"></p><p id="snippet-preview-note" class="snippet-reader-note"></p><div id="snippet-preview-excerpt" class="snippet-prose"></div></article></div>
            <p class="snippet-sharing-note">Anyone with the link can read and copy this excerpt. The link contains a fixed copy, not access to your draft. It cannot expire or be revoked.</p>
            <p id="snippet-error" class="snippet-error" role="alert" hidden></p>
            <div class="snippet-actions"><button type="button" id="snippet-back" class="snippet-button" hidden>Edit excerpt</button><button type="submit" id="snippet-next" class="snippet-button snippet-primary">Preview</button></div>
        </form>
        <section id="snippet-result" hidden aria-labelledby="snippet-result-title"><h3 id="snippet-result-title">Link ready</h3><p class="snippet-hint">Changes to your draft will not change this excerpt.</p><label for="snippet-link">Read-only link<input id="snippet-link" readonly spellcheck="false" /></label><div class="snippet-actions"><button type="button" id="snippet-copy" class="snippet-button snippet-primary">Copy link</button><button type="button" id="snippet-share" class="snippet-button">Share…</button><a id="snippet-open" class="snippet-button" target="_blank" rel="noopener noreferrer">Open reader view</a></div><p id="snippet-result-status" class="snippet-hint" role="status"></p><button type="button" id="snippet-another" class="snippet-text-button">Create another snippet</button></section>`;
    document.body.append(dialog);
    const find = (id) => dialog.querySelector(`#${id}`);
    const form = find("snippet-form");
    const fields = dialog.querySelector(".snippet-fields");
    const preview = find("snippet-preview");
    const result = find("snippet-result");
    const errorEl = find("snippet-error");
    const title = find("snippet-title");
    const byline = find("snippet-byline");
    const excerpt = find("snippet-excerpt");
    const note = find("snippet-note");
    const next = find("snippet-next");
    const back = find("snippet-back");
    let stage = "edit";
    let sharedUrl = "";
    let capturedText = "";
    let generation = 0;

    function selectedText() {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || selection.isCollapsed) return "";
        const range = selection.getRangeAt(0);
        return pageEl.contains(range.startContainer) && pageEl.contains(range.endContainer)
            ? selection.toString() : "";
    }
    function showError(error) {
        errorEl.textContent = error?.message || "Could not create the snippet link. Try again.";
        errorEl.hidden = false;
    }
    function updateCount() {
        find("snippet-count").textContent = `${countSnippetWords(excerpt.value)} words · ${excerpt.value.length.toLocaleString()} / ${MAX_SNIPPET_LENGTH.toLocaleString()} characters`;
    }
    function edit() {
        stage = "edit";
        fields.hidden = false;
        preview.hidden = true;
        result.hidden = true;
        form.hidden = false;
        back.hidden = true;
        next.textContent = "Preview";
        errorEl.hidden = true;
        updateCount();
    }
    function payload() {
        return normalizeSnippet({ version: 1, title: title.value, byline: byline.value, note: note.value, excerpt: excerpt.value });
    }
    function close() { dialog.close(); }
    button.addEventListener("pointerdown", () => { capturedText = selectedText(); });
    button.addEventListener("click", () => {
        generation++;
        form.reset();
        title.value = String(getBook()?.title || "Untitled").slice(0, 120);
        byline.value = String(getAuthor() || "").slice(0, 80);
        const selection = selectedText() || capturedText;
        capturedText = "";
        edit();
        next.disabled = false;
        dialog.showModal();
        if (selection.length > MAX_SNIPPET_LENGTH) {
            showError(new Error("The selection is too long. Choose a shorter excerpt or paste part of it below."));
        } else { excerpt.value = selection; updateCount(); }
        excerpt.focus();
    });
    dialog.querySelector(".snippet-close").addEventListener("click", close);
    dialog.addEventListener("close", () => {
        generation++;
        button.focus({ preventScroll: true });
        form.reset();
        find("snippet-link").value = "";
        sharedUrl = "";
        find("snippet-open").removeAttribute("href");
    });
    excerpt.addEventListener("input", updateCount);
    back.addEventListener("click", () => { edit(); excerpt.focus(); });
    find("snippet-another").addEventListener("click", () => { edit(); excerpt.focus(); });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorEl.hidden = true;
        try {
            const data = payload();
            if (stage === "edit") {
                find("snippet-preview-title").textContent = data.title;
                find("snippet-preview-byline").textContent = data.byline ? `by ${data.byline}` : "";
                find("snippet-preview-note").textContent = data.note;
                find("snippet-preview-note").hidden = !data.note;
                find("snippet-preview-excerpt").textContent = data.excerpt;
                fields.hidden = true;
                preview.hidden = false;
                back.hidden = false;
                next.textContent = "Create link";
                stage = "preview";
                next.focus();
                return;
            }
            const currentGeneration = ++generation;
            next.disabled = true;
            next.textContent = "Creating…";
            const url = await createSnippetLink(data, window.location.origin);
            if (currentGeneration !== generation || !dialog.open) return;
            sharedUrl = url;
            find("snippet-link").value = url;
            find("snippet-open").href = url;
            find("snippet-result-status").textContent = "";
            find("snippet-share").hidden = typeof navigator.share !== "function";
            form.hidden = true;
            result.hidden = false;
            find("snippet-copy").focus();
        } catch (error) { if (dialog.open) showError(error); }
        finally { next.disabled = false; next.textContent = stage === "preview" ? "Create link" : "Preview"; }
    });
    find("snippet-copy").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(sharedUrl);
            find("snippet-result-status").textContent = "Link copied.";
        } catch {
            const input = find("snippet-link");
            input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
            find("snippet-result-status").textContent = "Select and copy the link above.";
        }
    });
    find("snippet-share").addEventListener("click", async () => {
        try { await navigator.share({ title: title.value || "Shared snippet", url: sharedUrl }); }
        catch (error) { if (error?.name !== "AbortError") find("snippet-result-status").textContent = "Could not open sharing. Use Copy link instead."; }
    });
    return { close, destroy() { dialog.remove(); } };
}
