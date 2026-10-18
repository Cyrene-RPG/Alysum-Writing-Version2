import { normalizeExcerpt, countExcerptWords, MAX_EXCERPT_CHARACTERS, MAX_EXCERPT_WORDS } from "/core/publishing/excerpts.js";
import { normalizeSnippetCard, cardFileName, CARD_FORMATS, MAX_CARD_CHARACTERS } from "/core/publishing/snippet-card.js";
import { drawSnippetCard } from "/site-appearance/js-runtime/snippet-card.js";

export function mountSnippetSharing({ button, pageEl, getBook, getAuthor = () => "", initialExcerpt = "", excerptApi = null }) {
    if (!button || !pageEl) return;
    const dialog = document.createElement("dialog");
    dialog.className = "quote-dialog";
    dialog.setAttribute("aria-labelledby", "quote-dialog-title");
    dialog.innerHTML = `
        <div class="quote-dialog-head"><div><p class="quote-label">WIP sharing</p><h2 id="quote-dialog-title">Share an excerpt</h2></div><button type="button" class="quote-close" aria-label="Close card editor">×</button></div>
        <div class="quote-modes" role="group" aria-label="Sharing format"><button type="button" class="quote-button" data-share-mode="link" aria-pressed="true">Reading link</button><button type="button" class="quote-button" data-share-mode="image" aria-pressed="false">Image card</button></div>
        <div class="quote-workspace">
            <form class="quote-controls" id="quote-form">
                <label for="quote-excerpt">Selected text<textarea id="quote-excerpt" maxlength="${MAX_EXCERPT_CHARACTERS}" rows="7" required placeholder="Select text in your WIP first, or paste an excerpt here."></textarea></label>
                <p id="quote-count" class="quote-hint"></p>
                <div class="quote-option-row" id="quote-image-options"><label for="quote-style">Style<select id="quote-style"><option value="alysum">Alysum</option><option value="paper">Paper</option><option value="rose">Rose</option></select></label><label for="quote-format">Size<select id="quote-format"><option value="portrait">Portrait · 4:5</option><option value="square">Square · 1:1</option><option value="story">Story · 9:16</option></select></label></div>
                <label for="quote-title">Book title <span>(optional)</span><input id="quote-title" maxlength="80" autocomplete="off"></label>
                <label for="quote-author">Author <span>(optional)</span><input id="quote-author" maxlength="80" autocomplete="off"></label>
                <label id="quote-brand-option" class="quote-check" for="quote-brand"><input type="checkbox" id="quote-brand" checked> Include Alysum mark</label>
                <p class="quote-hint" id="quote-privacy-note">Only the selected section is shared. Your other chapters stay private.</p>
                <div id="quote-link-result" hidden><label for="quote-reading-url">Reading link<input id="quote-reading-url" readonly spellcheck="false"></label><div class="quote-actions"><button type="button" class="quote-button" id="quote-copy-link">Copy link</button><a class="quote-button" id="quote-open-link" target="_blank" rel="noopener noreferrer">Open section</a></div></div>
                <details id="quote-link-manager"><summary>Your reading links</summary><div id="quote-link-list"></div></details>
            </form>
            <section class="quote-preview" aria-label="Image preview"><div class="quote-preview-surface"><article id="quote-section-preview" hidden><p class="quote-label">Read-only section</p><h3 id="quote-section-title"></h3><p id="quote-section-author" class="quote-hint"></p><div id="quote-section-text"></div></article><canvas id="quote-canvas" role="img" aria-label="Preview of the selected excerpt card" hidden></canvas><p id="quote-placeholder" class="quote-hint">Select or paste an excerpt to preview the card.</p></div><p id="quote-dimensions" class="quote-hint"></p></section>
        </div>
        <p id="quote-error" class="quote-error" role="alert" hidden></p>
        <div class="quote-dialog-foot"><p id="quote-status" class="quote-hint" role="status"></p><div class="quote-actions"><button type="button" id="quote-create-link" class="quote-button quote-primary" disabled>Create reading link</button><button type="button" id="quote-save" class="quote-button quote-primary" disabled>Save PNG</button><button type="button" id="quote-share" class="quote-button" disabled hidden>Share image…</button></div></div>`;
    document.body.append(dialog);
    const find = (id) => dialog.querySelector(`#${id}`);
    const form = find("quote-form");
    const excerpt = find("quote-excerpt");
    const title = find("quote-title");
    const author = find("quote-author");
    const canvas = find("quote-canvas");
    const errorEl = find("quote-error");
    const save = find("quote-save");
    const share = find("quote-share");
    const status = find("quote-status");
    let mode = "link";
    let isCreatingLink = false;
    let capturedText = "";
    let objectUrl = "";
    let file = null;
    let generation = 0;
    let renderTimer = 0;
    let fontPromise = null;

    function readSelection() {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || selection.isCollapsed) return "";
        const range = selection.getRangeAt(0);
        return pageEl.contains(range.startContainer) && pageEl.contains(range.endContainer) ? selection.toString() : "";
    }
    function clearImage() {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = "";
        file = null;
        save.disabled = true;
        share.disabled = true;
    }
    function showError(error) {
        errorEl.textContent = error?.message || "Could not create the card. Try again.";
        errorEl.hidden = false;
    }
    function waitForFont() {
        if (!fontPromise) fontPromise = document.fonts
            ? Promise.race([document.fonts.load('600 48px "Cormorant Garamond"').catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1500))])
            : Promise.resolve();
        return fontPromise;
    }
    function setMode(nextMode) {
        mode = nextMode;
        for (const tab of dialog.querySelectorAll("[data-share-mode]")) tab.setAttribute("aria-pressed", String(tab.dataset.shareMode === mode));
        const image = mode === "image";
        find("quote-image-options").hidden = !image;
        find("quote-brand-option").hidden = !image;
        find("quote-link-manager").hidden = image;
        find("quote-create-link").hidden = image;
        find("quote-section-preview").hidden = image;
        save.hidden = !image;
        share.hidden = true;
        canvas.hidden = true;
        find("quote-link-result").hidden = true;
        find("quote-privacy-note").textContent = image ? "Only this text and attribution appear in the image." : "Anyone with the link can read this saved copy. Draft edits will not change it. Disable the link to stop future access.";
        void render();
    }
    function sectionPayload() { return normalizeExcerpt({ title: title.value, author: author.value, excerpt: excerpt.value }); }
    async function loadLinks() {
        const list = find("quote-link-list");
        list.textContent = "Loading links…";
        if (!excerptApi) { list.textContent = "Sign in to create and manage reading links."; return; }
        try {
            const items = await excerptApi.list(String(getBook()?.id || ""));
            list.textContent = "";
            if (!items.length) { list.textContent = "No reading links yet."; return; }
            for (const item of items) {
                const row = document.createElement("div"); row.className = "quote-managed-link";
                const label = document.createElement("p"); label.textContent = `${item.title} · ${item.wordCount.toLocaleString()} words${item.revokedAt ? " · Disabled" : ""}`; row.append(label);
                if (!item.revokedAt) {
                    const open = document.createElement("a"); open.href = item.url; open.textContent = "Open"; open.target = "_blank"; open.rel = "noopener noreferrer";
                    const revoke = document.createElement("button"); revoke.type = "button"; revoke.className = "quote-button"; revoke.textContent = "Disable link";
                    revoke.addEventListener("click", async () => {
                        revoke.disabled = true;
                        try { await excerptApi.revoke(item.id); status.textContent = "Link disabled. New visits can no longer open the section."; find("quote-link-result").hidden = true; await loadLinks(); }
                        catch(error) { showError(error); revoke.disabled = false; }
                    });
                    row.append(open, revoke);
                }
                list.append(row);
            }
        } catch(error) { list.textContent = error?.message || "Could not load reading links."; }
    }
    async function render() {
        const request = ++generation;
        clearImage();
        errorEl.hidden = true;
        const words = countExcerptWords(excerpt.value);
        find("quote-create-link").disabled = true;
        find("quote-count").textContent = mode === "link" ? `${words.toLocaleString()} / ${MAX_EXCERPT_WORDS.toLocaleString()} words · ${excerpt.value.length.toLocaleString()} / ${MAX_EXCERPT_CHARACTERS.toLocaleString()} characters` : `${words} words · ${excerpt.value.length.toLocaleString()} / ${MAX_CARD_CHARACTERS.toLocaleString()} characters`;
        if (!excerpt.value.trim()) {
            canvas.hidden = true;
            find("quote-section-preview").hidden = true;
            find("quote-placeholder").hidden = false;
            find("quote-dimensions").textContent = "";
            status.textContent = "";
            return;
        }
        if (mode === "link") {
            canvas.hidden = true;
            try {
                const data = sectionPayload();
                find("quote-section-title").textContent = data.title;
                find("quote-section-author").textContent = data.author ? `by ${data.author}` : "";
                find("quote-section-text").textContent = data.excerpt;
                find("quote-section-preview").hidden = false;
                find("quote-placeholder").hidden = true;
                find("quote-dimensions").textContent = `${data.wordCount.toLocaleString()} words · Read only`;
                find("quote-create-link").disabled = !excerptApi || isCreatingLink;
                status.textContent = "";
            } catch(error) { find("quote-section-preview").hidden = true; find("quote-placeholder").hidden = false; find("quote-dimensions").textContent = ""; showError(error); }
            return;
        }
        find("quote-section-preview").hidden = true;
        status.textContent = "Rendering…";
        try {
            const data = normalizeSnippetCard({ excerpt: excerpt.value, title: title.value, author: author.value, style: find("quote-style").value, format: find("quote-format").value, showBrand: find("quote-brand").checked });
            await waitForFont();
            if (request !== generation || !dialog.open) return;
            const dimensions = CARD_FORMATS[data.format];
            drawSnippetCard(canvas, data, dimensions);
            const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not save the image. Try again.")), "image/png"));
            if (request !== generation || !dialog.open) return;
            file = new File([blob], cardFileName(data.title), { type: "image/png" });
            objectUrl = URL.createObjectURL(file);
            canvas.hidden = false;
            canvas.setAttribute("aria-label", `Quote card: ${data.excerpt}`);
            find("quote-placeholder").hidden = true;
            find("quote-dimensions").textContent = `${dimensions.width} × ${dimensions.height} · PNG`;
            save.disabled = false;
            let canShare = false;
            try { canShare = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); } catch { /* Saving stays available. */ }
            share.hidden = !canShare;
            share.disabled = !canShare;
            status.textContent = canShare ? "" : "Save the PNG to share it from your photos or files.";
        } catch (error) {
            if (request !== generation || !dialog.open) return;
            canvas.hidden = true;
            find("quote-placeholder").hidden = false;
            find("quote-placeholder").textContent = "Adjust the text or size to preview your card.";
            find("quote-dimensions").textContent = "";
            status.textContent = "";
            showError(error);
        }
    }
    function queueRender() {
        generation++;
        clearImage();
        clearTimeout(renderTimer);
        find("quote-create-link").disabled = true;
        find("quote-link-result").hidden = true;
        renderTimer = setTimeout(render, 120);
    }
    button.addEventListener("pointerdown", () => { capturedText = readSelection(); });
    button.addEventListener("click", () => {
        const selected = readSelection() || capturedText || initialExcerpt;
        capturedText = "";
        form.reset();
        title.value = String(getBook()?.title || "").slice(0, 80);
        author.value = String(getAuthor() || "").slice(0, 80);
        excerpt.value = selected.length <= MAX_EXCERPT_CHARACTERS ? selected : "";
        find("quote-placeholder").textContent = "Select or paste an excerpt to preview the card.";
        dialog.showModal();
        setMode("link");
        void loadLinks();
        if (selected.length > MAX_EXCERPT_CHARACTERS) showError(new Error("That section is too long. Select up to 150,000 characters."));
    });
    dialog.querySelector(".quote-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
        generation++;
        clearTimeout(renderTimer);
        clearImage();
        form.reset();
        canvas.width = 1;
        canvas.height = 1;
        button.focus({ preventScroll: true });
    });
    for (const tab of dialog.querySelectorAll("[data-share-mode]")) tab.addEventListener("click", () => setMode(tab.dataset.shareMode));
    find("quote-create-link").addEventListener("click", async () => {
        if (!excerptApi || isCreatingLink) return;
        isCreatingLink = true;
        const create = find("quote-create-link"); create.disabled = true; create.textContent = "Saving…"; errorEl.hidden = true;
        const opening = generation;
        try {
            const data = sectionPayload();
            const result = await excerptApi.create(String(getBook()?.id || ""), data);
            if (!dialog.open || opening !== generation) return;
            find("quote-reading-url").value = result.url;
            find("quote-open-link").href = result.url;
            find("quote-link-result").hidden = false;
            status.textContent = "Reading link created. It contains only this saved section.";
            find("quote-copy-link").focus();
            void loadLinks();
        } catch(error) { if(dialog.open)showError(error); }
        finally { isCreatingLink = false; create.textContent = "Create reading link"; try { sectionPayload(); create.disabled = !excerptApi || mode !== "link"; } catch { create.disabled = true; } }
    });
    find("quote-copy-link").addEventListener("click", async () => {
        const input = find("quote-reading-url");
        try { await navigator.clipboard.writeText(input.value); status.textContent = "Link copied."; }
        catch { input.focus(); input.select(); input.setSelectionRange(0,input.value.length); status.textContent = "Select and copy the link above."; }
    });
    form.addEventListener("input", queueRender);
    form.addEventListener("change", queueRender);
    form.addEventListener("submit", (event) => event.preventDefault());
    save.addEventListener("click", () => {
        if (!file || !objectUrl) return;
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        status.textContent = "PNG ready. If your browser opens it, touch and hold the image to save it.";
    });
    share.addEventListener("click", () => {
        if (!file) return;
        navigator.share({ files: [file] }).catch((error) => {
            if (error?.name !== "AbortError") status.textContent = "Could not open sharing. Save the PNG instead.";
        });
    });
    return { close: () => dialog.close() };
}
