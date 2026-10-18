import { normalizeSnippetCard, cardFileName, CARD_FORMATS, MAX_CARD_CHARACTERS } from "/core/publishing/snippet-card.js";
import { drawSnippetCard } from "/site-appearance/js-runtime/snippet-card.js";

export function mountSnippetSharing({ button, pageEl, getBook, getAuthor = () => "", initialExcerpt = "" }) {
    if (!button || !pageEl) return;
    const dialog = document.createElement("dialog");
    dialog.className = "quote-dialog";
    dialog.setAttribute("aria-labelledby", "quote-dialog-title");
    dialog.innerHTML = `
        <div class="quote-dialog-head"><div><p class="quote-label">Image card</p><h2 id="quote-dialog-title">Share an excerpt</h2></div><button type="button" class="quote-close" aria-label="Close card editor">×</button></div>
        <div class="quote-workspace">
            <form class="quote-controls" id="quote-form">
                <button type="button" id="quote-select-in-wip" class="quote-button quote-select-in-wip">Select text in WIP</button><label for="quote-excerpt">Selected text<textarea id="quote-excerpt" maxlength="${MAX_CARD_CHARACTERS}" rows="7" required placeholder="Select text in your WIP first, or paste an excerpt here."></textarea></label>
                <p id="quote-count" class="quote-hint"></p>
                <div class="quote-option-row"><label for="quote-style">Style<select id="quote-style"><option value="alysum">Alysum</option><option value="paper">Paper</option><option value="rose">Rose</option></select></label><label for="quote-format">Size<select id="quote-format"><option value="portrait">Portrait · 4:5</option><option value="square">Square · 1:1</option><option value="story">Story · 9:16</option></select></label></div>
                <label for="quote-title">Book title <span>(optional)</span><input id="quote-title" maxlength="80" autocomplete="off"></label>
                <label for="quote-author">Author <span>(optional)</span><input id="quote-author" maxlength="80" autocomplete="off"></label>
                <label class="quote-check" for="quote-brand"><input type="checkbox" id="quote-brand" checked> Include Alysum mark</label>
                <p class="quote-hint">Only this text and attribution appear in the image.</p>
            </form>
            <section class="quote-preview" aria-label="Image preview"><div class="quote-preview-surface"><canvas id="quote-canvas" role="img" aria-label="Preview of the selected excerpt card" hidden></canvas><p id="quote-placeholder" class="quote-hint">Select or paste an excerpt to preview the card.</p></div><p id="quote-dimensions" class="quote-hint"></p></section>
        </div>
        <p id="quote-error" class="quote-error" role="alert" hidden></p>
        <div class="quote-dialog-foot"><p id="quote-status" class="quote-hint" role="status"></p><div class="quote-actions"><button type="button" id="quote-save" class="quote-button quote-primary" disabled>Save PNG</button><button type="button" id="quote-share" class="quote-button" disabled hidden>Share image…</button></div></div>`;
    document.body.append(dialog);
    const selectionBar = document.createElement("div");
    selectionBar.className = "quote-selection-bar";
    selectionBar.hidden = true;
    selectionBar.innerHTML = '<p role="status">Highlight text in your WIP, then choose Create card.</p><div><button type="button" class="quote-button quote-primary" data-use-selection disabled>Create card</button><button type="button" class="quote-button" data-cancel-selection>Cancel</button></div>';
    pageEl.before(selectionBar);
    const selectionNotice = selectionBar.querySelector("p");
    const useSelection = selectionBar.querySelector("[data-use-selection]");
    let selectAfterClose = false;
    function showSelectionBar() {
        selectionBar.hidden = false;
        capturedText = "";
        useSelection.disabled = true;
        selectionNotice.textContent = "Highlight text in your WIP, then choose Create card.";
        pageEl.focus({ preventScroll: true });
        selectionBar.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
    function captureSelection() {
        const text = readSelection();
        if (text.trim()) capturedText = text;
        return capturedText;
    }
    document.addEventListener("selectionchange", () => {
        if (dialog.open) return;
        const text = captureSelection();
        if (selectionBar.hidden) return;
        useSelection.disabled = !text.trim();
        selectionNotice.textContent = text.trim() ? `${text.trim().split(/\s+/u).length} words selected` : "Highlight text in your WIP, then choose Create card.";
    });
    useSelection.addEventListener("pointerdown", captureSelection);
    useSelection.addEventListener("click", () => { if (captureSelection().trim()) button.click(); });
    selectionBar.querySelector("[data-cancel-selection]").addEventListener("click", () => { selectionBar.hidden = true; capturedText = ""; });

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
    async function render() {
        const request = ++generation;
        clearImage();
        errorEl.hidden = true;
        const words = excerpt.value.trim().split(/\s+/u).filter(Boolean).length;
        find("quote-count").textContent = `${words} words · ${excerpt.value.length.toLocaleString()} / ${MAX_CARD_CHARACTERS.toLocaleString()} characters`;
        if (!excerpt.value.trim()) {
            canvas.hidden = true;
            find("quote-placeholder").hidden = false;
            find("quote-dimensions").textContent = "";
            status.textContent = "";
            return;
        }
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
        renderTimer = setTimeout(render, 120);
    }
    button.addEventListener("pointerdown", captureSelection);
    button.addEventListener("click", () => {
        const selected = readSelection() || capturedText || initialExcerpt;
        capturedText = "";
        if (!selected.trim()) { showSelectionBar(); return; }
        selectionBar.hidden = true;
        form.reset();
        title.value = String(getBook()?.title || "").slice(0, 80);
        author.value = String(getAuthor() || "").slice(0, 80);
        excerpt.value = selected;
        find("quote-placeholder").textContent = "Select or paste an excerpt to preview the card.";
        dialog.showModal();
        void render();
        if (selected.length > MAX_CARD_CHARACTERS) showError(new Error("That selection is too long for one card. Select a shorter excerpt or paste part of it below."));
    });
    find("quote-select-in-wip").addEventListener("click", () => { selectAfterClose = true; dialog.close(); });
    dialog.querySelector(".quote-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
        generation++;
        capturedText = "";
        clearTimeout(renderTimer);
        clearImage();
        form.reset();
        canvas.width = 1;
        canvas.height = 1;
        if (selectAfterClose) { selectAfterClose = false; showSelectionBar(); }
        else button.focus({ preventScroll: true });
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
