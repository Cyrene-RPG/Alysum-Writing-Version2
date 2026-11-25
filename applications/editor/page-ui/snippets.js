import { createBetaReadApi } from "./beta-read-api.js";
import { supabase as betaReadSupabase } from "@alysum/authentication/client.js";
import { mountBetaReadPicker } from "./beta-read-picker.js";
import { requestSnippetDownload, shareSnippet, copyReadingLink } from "/site-appearance/js-runtime/snippet-export.js";
import { normalizeExcerpt, countExcerptWords, excerptPages, EXCERPT_PAGE_BREAK, MAX_EXCERPT_CHARACTERS, MAX_EXCERPT_WORDS } from "/core/publishing/excerpts.js";
import { normalizeSnippetCard, cardFileName, CARD_FORMATS, MAX_CARD_CHARACTERS } from "/core/publishing/snippet-card.js";
import { layoutSnippetPages, drawSnippetPage } from "/site-appearance/js-runtime/snippet-card.js";

function captureCardFormatting(range) {
    let text = "";
    let mask = "";
    let lastBlock = null;
    function append(value, italic = false) {
        text += value;
        mask += (italic ? "1" : "0").repeat(value.length);
    }
    const blockSelector = "p, div, li, blockquote, h1, h2, h3, h4, h5, h6";
    function enterBlock(block) {
        if (lastBlock && lastBlock !== block) append("\n");
        lastBlock = block;
    }
    function visit(node) {
        if (!range.intersectsNode(node)) return;
        if (node.nodeType === Node.TEXT_NODE || node.nodeName === "BR") {
            const block = node.parentElement.closest(blockSelector);
            // Ignore whitespace used to indent the HTML between paragraph elements.
            if (node.nodeType === Node.TEXT_NODE && !node.data.trim() &&
                (node.previousSibling?.matches?.(blockSelector) || node.nextSibling?.matches?.(blockSelector))) return;
            enterBlock(block);
            if (node.nodeName === "BR") {
                // A lone break gives an empty editor paragraph a caret position.
                if (block?.childNodes.length !== 1 || node.parentElement !== block) append("\n");
                return;
            }
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : node.length;
            append(node.data.slice(start, end), /italic|oblique/.test(getComputedStyle(node.parentElement).fontStyle));
            return;
        }
        if (!node.childNodes.length && node.matches?.(blockSelector)) enterBlock(node);
        for (const child of node.childNodes) visit(child);
    }
    visit(range.commonAncestorContainer);
    const start = text.length - text.trimStart().length;
    const trimmed = text.trim();
    return trimmed ? { text: trimmed, italicMask: mask.slice(start, start + trimmed.length) } : null;
}

export function mountSnippetSharing({ button, pageEl, getBook, getChapterId = () => null, getAuthor = () => "", initialExcerpt = "", excerptApi = null, downloadApi = null, betaReadApi = null }) {
    if (!button || !pageEl) return;
    const dialog = document.createElement("dialog");
    dialog.className = "quote-dialog";
    dialog.setAttribute("aria-labelledby", "quote-dialog-title");
    dialog.innerHTML = `
        <div class="quote-dialog-head"><div><p class="quote-label">WIP sharing</p><h2 id="quote-dialog-title">Share an excerpt</h2></div><button type="button" class="quote-close" aria-label="Close card editor">×</button></div>
        <div class="quote-modes" role="group" aria-label="Sharing format"><button type="button" class="quote-button" data-share-mode="link" aria-pressed="true">Reading link</button><button type="button" class="quote-button" data-share-mode="image" aria-pressed="false">Image card</button><button type="button" class="quote-button" data-share-mode="beta" aria-pressed="false">Beta Read</button></div>
        <div class="quote-workspace">
            <form class="quote-controls" id="quote-form">
                <button type="button" id="quote-select-in-wip" class="quote-button quote-select-in-wip">Select text in WIP</button><label for="quote-excerpt">Selected text<textarea id="quote-excerpt" maxlength="${MAX_EXCERPT_CHARACTERS}" rows="7" required placeholder="Select text in your WIP first, or paste an excerpt here."></textarea></label>
                <p id="quote-count" class="quote-hint"></p>
                <div class="quote-option-row" id="quote-image-options"><label for="quote-style">Paper<select id="quote-style"><option value="alysum">Alysum</option><option value="paper">Paper</option><option value="rose">Rose</option><option value="midnight">Midnight</option><option value="fog">Fog</option><option value="moss">Moss</option><option value="ink">Ink</option><option value="parchment">Parchment</option><option value="dusk">Dusk</option><option value="slate">Slate</option></select></label><label for="quote-format">Size<select id="quote-format"><option value="portrait">Portrait · 1080×1350</option><option value="square">Square · 1080×1080</option><option value="story">Story · 1080×1920</option><option value="largePortrait">Large portrait · 1620×2025</option><option value="largeSquare">Large square · 1620×1620</option><option value="largeStory">Large story · 1440×2560</option><option value="landscape">Landscape · 1920×1080</option></select></label></div>
                <div id="quote-background-option" class="quote-background-option" hidden><label for="quote-background">Background image <span>(optional)</span><input id="quote-background" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><p id="quote-background-name" class="quote-hint" hidden></p><button type="button" id="quote-background-clear" class="quote-button" hidden>Remove background</button></div>
                <label for="quote-title">Book title <span>(optional)</span><input id="quote-title" maxlength="80" autocomplete="off"></label>
                <label for="quote-author">Author <span>(optional)</span><input id="quote-author" maxlength="80" autocomplete="off"></label>
                <label id="quote-brand-option" class="quote-check" for="quote-brand"><input type="checkbox" id="quote-brand" checked> Include Alysum mark</label>
                <p class="quote-hint" id="quote-privacy-note">Only the selected section is shared. Your other chapters stay private.</p>
                <div id="quote-link-result" hidden><label for="quote-reading-url">Reading link<input id="quote-reading-url" readonly spellcheck="false"></label><div class="quote-actions"><button type="button" class="quote-button" id="quote-copy-link">Copy link</button><a class="quote-button" id="quote-open-link" target="_blank" rel="noopener noreferrer">Open section</a></div></div>
                <details id="quote-link-manager"><summary>Your reading links</summary><div id="quote-link-list"></div></details>
            </form>
            <section class="quote-preview" aria-label="Excerpt preview"><div class="quote-preview-surface"><article id="quote-section-preview" hidden><p class="quote-label">Read-only section</p><h3 id="quote-section-title"></h3><p id="quote-section-author" class="quote-hint"></p><div id="quote-section-text"></div></article><canvas id="quote-canvas" role="img" aria-label="Preview of the selected excerpt card" hidden></canvas><p id="quote-placeholder" class="quote-hint">Select or paste an excerpt to preview the card.</p></div><div id="quote-pagination" class="quote-pagination" role="group" aria-label="Preview pages" hidden><button type="button" id="quote-previous" class="quote-button">Previous</button><span id="quote-page-number" class="quote-hint" aria-live="polite"></span><button type="button" id="quote-next" class="quote-button">Next</button></div><p id="quote-dimensions" class="quote-hint"></p></section>
        </div>
        <p id="quote-error" class="quote-error" role="alert" hidden></p>
        <div class="quote-dialog-foot"><p id="quote-status" class="quote-hint" role="status"></p><div class="quote-actions"><button type="button" id="quote-create-link" class="quote-button quote-primary" disabled>Create reading link</button><a id="quote-local-save" class="quote-button quote-primary" hidden>Save PNG</a><button type="button" id="quote-save" class="quote-button" disabled hidden>Use alternate download</button><button type="button" id="quote-share" class="quote-button" disabled hidden>Share image…</button></div></div>`;
    document.body.append(dialog);
    const selectionBar = document.createElement("div");
    selectionBar.className = "quote-selection-bar";
    selectionBar.hidden = true;
    selectionBar.innerHTML = '<p role="status">Highlight text in your WIP, then choose Share selection.</p><div><button type="button" class="quote-button quote-primary" data-use-selection disabled>Share selection</button><button type="button" class="quote-button" data-cancel-selection>Cancel</button></div>';
    pageEl.before(selectionBar);
    const selectionNotice = selectionBar.querySelector("p");
    const useSelection = selectionBar.querySelector("[data-use-selection]");
    let selectAfterClose = false;
    let addingSection = false;
    let capturedChapter = null;
    function selectionPrompt() {
        return addingSection
            ? "Open any chapter, highlight the passage you want, then choose Add selection."
            : "Highlight text in your WIP, then choose Share selection.";
    }
    function showSelectionBar() {
        selectionBar.hidden = false;
        capturedText = "";
        useSelection.disabled = true;
        capturedRange = null;
        if (addingSection) window.getSelection()?.removeAllRanges();
        useSelection.textContent = addingSection ? "Add selection" : "Share selection";
        selectionNotice.textContent = selectionPrompt();
        pageEl.focus({ preventScroll: true });
        selectionBar.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
    function captureSelection() {
        const text = readSelection();
        if (text.trim()) {
            capturedText = text;
            capturedChapter = getChapterId();
        } else if (addingSection && (capturedChapter !== getChapterId() || !capturedRange || capturedRange.collapsed)) {
            capturedText = "";
        }
        return capturedText;
    }
    document.addEventListener("selectionchange", () => {
        if (dialog.open) return;
        const text = captureSelection();
        if (selectionBar.hidden) return;
        useSelection.disabled = !text.trim();
        selectionNotice.textContent = text.trim() ? `${text.trim().split(/\s+/u).length} words selected` : selectionPrompt();
    });
    useSelection.addEventListener("pointerdown", captureSelection);
    useSelection.addEventListener("click", () => { if (captureSelection().trim()) button.click(); });
    selectionBar.querySelector("[data-cancel-selection]").addEventListener("click", () => {
        selectionBar.hidden = true;
        capturedText = "";
        capturedRange = null;
        if (addingSection) resumeReadingLink();
    });

    const find = (id) => dialog.querySelector(`#${id}`);
    const form = find("quote-form");
    const excerpt = find("quote-excerpt");
    const title = find("quote-title");
    const author = find("quote-author");
    const canvas = find("quote-canvas");
    const errorEl = find("quote-error");
    const save = find("quote-save");
    const localSave = find("quote-local-save");
    let localDownloadUrl = "";
    const share = find("quote-share");
    const status = find("quote-status");
    let mode = "link";
    let isCreatingLink = false;
    let capturedText = "";
    let capturedRange = null;
    let cardSelection = null;
    let file = null;
    let pageIndex = 0;
    let pageCount = 0;
    let generation = 0;
    let renderTimer = 0;
    let fontPromise = null;
    let backgroundImage = null;
    let backgroundObjectUrl = "";
    const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;

    function clearBackgroundImage() {
        if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
        backgroundObjectUrl = "";
        backgroundImage = null;
        const input = find("quote-background");
        if (input) input.value = "";
        find("quote-background-name").hidden = true;
        find("quote-background-name").textContent = "";
        find("quote-background-clear").hidden = true;
    }

    function loadBackgroundImage(sourceFile) {
        return new Promise((resolve, reject) => {
            if (!sourceFile || !String(sourceFile.type || "").startsWith("image/")) {
                reject(new Error("Choose a JPEG, PNG, WebP, or GIF image."));
                return;
            }
            if (sourceFile.size > MAX_BACKGROUND_BYTES) {
                reject(new Error("Background images must be 8 MB or smaller."));
                return;
            }
            const url = URL.createObjectURL(sourceFile);
            const image = new Image();
            image.onload = () => resolve({ image, url });
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Could not read that image. Try another file."));
            };
            image.src = url;
        });
    }

    function readSelection() {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || selection.isCollapsed) return "";
        const range = selection.getRangeAt(0);
        if (!pageEl.contains(range.startContainer) || !pageEl.contains(range.endContainer)) return "";
        capturedRange = range.cloneRange();
        return selection.toString();
    }
    function clearImage() {
        localSave.hidden = true;
        localSave.removeAttribute("href");
        save.hidden = true;
        if (localDownloadUrl) URL.revokeObjectURL(localDownloadUrl);
        localDownloadUrl = "";
        file = null;
        save.disabled = true;
        share.disabled = true;
        find("quote-pagination").hidden = true;
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
    const betaPicker = mountBetaReadPicker({ host: dialog, getBook, getAuthor, api: betaReadApi || createBetaReadApi(betaReadSupabase) });
    function setMode(nextMode, initialPage = 0) {
        mode = nextMode;
        pageIndex = initialPage;
        for (const tab of dialog.querySelectorAll("[data-share-mode]")) tab.setAttribute("aria-pressed", String(tab.dataset.shareMode === mode));
        const beta = mode === "beta";
        dialog.querySelector(".quote-workspace").hidden = beta;
        dialog.querySelector(".quote-dialog-foot").hidden = beta;
        if (beta) { betaPicker.open(); return; }
        betaPicker.close();
        const image = mode === "image";
        find("quote-image-options").hidden = !image;
        find("quote-background-option").hidden = !image;
        find("quote-brand-option").hidden = !image;
        find("quote-link-manager").hidden = image;
        find("quote-create-link").hidden = image;
        find("quote-section-preview").hidden = image;
        save.hidden = true;
        share.hidden = true;
        canvas.hidden = true;
        find("quote-link-result").hidden = true;
        find("quote-privacy-note").textContent = image ? "Up to 30,000 characters. Long excerpts split into numbered cards. Save or share each page." : "Each added selection starts a new page. Anyone with the link can read this saved copy. Draft edits will not change it. Disable the link to stop future access.";
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
    function updatePagination() {
        find("quote-pagination").hidden = pageCount <= 1;
        find("quote-page-number").textContent = `Page ${pageIndex + 1} of ${pageCount}`;
        find("quote-previous").disabled = pageIndex === 0;
        find("quote-next").disabled = pageIndex === pageCount - 1;
    }
    async function render() {
        const request = ++generation;
        clearImage();
        errorEl.hidden = true;
        const words = countExcerptWords(excerpt.value);
        find("quote-select-in-wip").textContent = mode === "link" && words ? "Add another section or chapter" : "Select text in WIP";
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
                const pages = excerptPages(data.excerpt);
                pageCount = pages.length;
                pageIndex = Math.min(pageIndex, pageCount - 1);
                find("quote-section-text").textContent = pages[pageIndex];
                updatePagination();
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
            if (cardSelection) {
                const formatted = normalizeSnippetCard({ ...data, excerpt: cardSelection.text });
                data.excerpt = formatted.excerpt;
                data.italicMask = cardSelection.italicMask;
            }
            data.backgroundImage = backgroundImage;
            await waitForFont();
            if (request !== generation || !dialog.open) return;
            const dimensions = CARD_FORMATS[data.format];
            const pages = layoutSnippetPages(canvas.getContext("2d"), data, dimensions);
            pageCount = pages.length;
            pageIndex = Math.min(pageIndex, pageCount - 1);
            const rendered = drawSnippetPage(canvas, data, dimensions, pages, pageIndex);
            canvas.parentElement.classList.toggle("quote-preview-long", rendered.height > 1920);
            const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not save the image. Try again.")), "image/png"));
            if (request !== generation || !dialog.open) return;
            file = new File([blob], cardFileName(data.title, pageCount > 1 ? pageIndex + 1 : 0), { type: "image/png" });
            canvas.hidden = false;
            canvas.setAttribute("aria-label", `Excerpt card, page ${pageIndex + 1} of ${pageCount}`);
            find("quote-placeholder").hidden = true;
            find("quote-dimensions").textContent = `${rendered.width} × ${rendered.height} · PNG`;
            updatePagination();
            localDownloadUrl = URL.createObjectURL(file);
            localSave.href = localDownloadUrl;
            localSave.download = file.name;
            localSave.hidden = false;
            localSave.textContent = pageCount > 1 ? `Save page ${pageIndex + 1} PNG` : "Save PNG";
            share.textContent = pageCount > 1 ? `Share page ${pageIndex + 1}…` : "Share image…";
            save.disabled = false;
            share.hidden = false;
            share.disabled = false;
            status.textContent = pageCount > 1 ? `${pageCount} cards. Save or share each page using Previous and Next.` : "Save PNG downloads this card directly to your device.";
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
        pageIndex = 0;
        generation++;
        clearImage();
        clearTimeout(renderTimer);
        find("quote-create-link").disabled = true;
        find("quote-link-result").hidden = true;
        renderTimer = setTimeout(render, 120);
    }
    function resumeReadingLink(targetPage = pageIndex) {
        addingSection = false;
        selectionBar.hidden = true;
        capturedText = "";
        capturedRange = null;
        dialog.showModal();
        setMode("link", targetPage);
        find("quote-select-in-wip").focus();
    }
    button.addEventListener("pointerdown", captureSelection);
    button.addEventListener("click", () => {
        const manuscriptSelection = captureSelection();
        if (addingSection) {
            if (!manuscriptSelection.trim()) return;
            const combined = excerpt.value.trimEnd() + EXCERPT_PAGE_BREAK + manuscriptSelection.trim();
            try {
                normalizeExcerpt({ excerpt: combined });
            } catch (error) {
                selectionNotice.textContent = error.message + " Highlight a shorter passage or cancel to return.";
                return;
            }
            excerpt.value = combined;
            cardSelection = null;
            resumeReadingLink(excerptPages(combined).length - 1);
            return;
        }
        const selected = manuscriptSelection || initialExcerpt;
        cardSelection = manuscriptSelection && capturedRange ? captureCardFormatting(capturedRange) : null;
        capturedRange = null;
        capturedText = "";
        if (!selected.trim() && !getBook()?.sections?.body?.length) { showSelectionBar(); return; }
        selectionBar.hidden = true;
        clearBackgroundImage();
        form.reset();
        title.value = String(getBook()?.title || "").slice(0, 80);
        author.value = String(getAuthor() || "").slice(0, 80);
        excerpt.value = selected;
        find("quote-placeholder").textContent = "Select or paste an excerpt to preview the card.";
        dialog.showModal();
        setMode("link");
        void loadLinks();
        if (selected.length > MAX_EXCERPT_CHARACTERS) showError(new Error(`That section is too long. Select up to ${MAX_EXCERPT_CHARACTERS.toLocaleString()} characters.`));
    });
    find("quote-select-in-wip").addEventListener("click", () => {
        addingSection = mode === "link" && Boolean(excerpt.value.trim());
        selectAfterClose = true;
        dialog.close();
    });
    dialog.querySelector(".quote-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
        generation++;
        capturedText = "";
        clearTimeout(renderTimer);
        clearImage();
        clearBackgroundImage();
        if (!addingSection) form.reset();
        canvas.width = 1;
        canvas.height = 1;
        if (selectAfterClose) { selectAfterClose = false; showSelectionBar(); }
        else button.focus({ preventScroll: true });
    });
    find("quote-background").addEventListener("change", async () => {
        const source = find("quote-background").files?.[0];
        if (!source) return;
        errorEl.hidden = true;
        try {
            const loaded = await loadBackgroundImage(source);
            if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
            backgroundObjectUrl = loaded.url;
            backgroundImage = loaded.image;
            find("quote-background-name").textContent = source.name;
            find("quote-background-name").hidden = false;
            find("quote-background-clear").hidden = false;
            queueRender();
        } catch (error) {
            clearBackgroundImage();
            showError(error);
            queueRender();
        }
    });
    find("quote-background-clear").addEventListener("click", () => {
        clearBackgroundImage();
        queueRender();
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
            status.textContent = "Reading link created. Its preview includes the word count, estimated reading time and opening sentence.";
            find("quote-copy-link").focus();
            void loadLinks();
        } catch(error) { if(dialog.open)showError(error); }
        finally { isCreatingLink = false; create.textContent = "Create reading link"; try { sectionPayload(); create.disabled = !excerptApi || mode !== "link"; } catch { create.disabled = true; } }
    });
    find("quote-copy-link").addEventListener("click", async () => {
        const copied = await copyReadingLink(find("quote-reading-url"));
        status.textContent = copied ? "Link copied." : "The link is selected above. Touch and hold it, then choose Copy.";
    });
    find("quote-previous").addEventListener("click", () => { if (pageIndex > 0) { pageIndex--; void render(); } });
    find("quote-next").addEventListener("click", () => { if (pageIndex + 1 < pageCount) { pageIndex++; void render(); } });
    excerpt.addEventListener("input", () => { cardSelection = null; });
    form.addEventListener("input", queueRender);
    form.addEventListener("change", queueRender);
    form.addEventListener("submit", (event) => event.preventDefault());
    localSave.addEventListener("click", () => {
        save.hidden = false;
        status.textContent = "If the PNG did not save, choose Use alternate download.";
    });
    save.addEventListener("click", async () => {
        if (!file || save.disabled) return;
        const saving = file; const opening = generation;
        save.disabled = true; status.textContent = "Preparing file download…";
        try {
            const started = await requestSnippetDownload(saving, dialog, downloadApi, () => opening === generation && dialog.open);
            if (started) status.textContent = "File download requested. Check your browser’s Downloads.";
        } catch (error) { if (opening === generation && dialog.open) status.textContent = error.message || "Could not prepare the file download. Try again."; }
        finally { save.disabled = !file; }
    });
    share.addEventListener("click", () => {
        if (!file || share.disabled) return;
        try {
            const sharing = shareSnippet(file);
            if (!sharing) {
                status.textContent = "Download the PNG to share from your files, or choose Reading link and copy its link.";
                return;
            }
            share.disabled = true;
            sharing.catch((error) => {
                status.textContent = error?.name === "AbortError" ? "Sharing cancelled." : "Download the PNG to share from your files, or copy a reading link.";
            }).finally(() => { share.disabled = !file; });
        } catch { status.textContent = "Download the PNG to share from your files, or copy a reading link."; }
    });
    return { close: () => dialog.close() };
}
