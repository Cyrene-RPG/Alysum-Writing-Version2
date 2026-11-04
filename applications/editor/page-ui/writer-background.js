import { mergePublishMeta, readPublishDraft } from "@alysum/publishing/publish-meta.js";
import {
    MAX_BACKGROUND_BYTES,
    assertWriterBackgroundFile,
    clearLocalWriterBackground,
    loadLocalWriterBackground,
    rememberWriterBackground,
    saveLocalWriterBackground,
    uploadWriterBackground,
} from "@alysum/publishing/writer-background.js";

const MAX_EDGE = 2560;
const JPEG_QUALITY = 0.82;

async function prepareWriterBackgroundFile(file) {
    assertWriterBackgroundFile(file);
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file;
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close?.();
        return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    if (blob.size > MAX_BACKGROUND_BYTES) {
        throw new Error("Image is still too large after shrinking. Choose a smaller photo.");
    }
    return new File([blob], "writer-background.jpg", { type: "image/jpeg" });
}

function ensureLayer(mainEl) {
    let layer = mainEl.querySelector(":scope > .writer-bg");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.className = "writer-bg";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `<img alt="" /><div class="writer-bg-scrim"></div>`;
    mainEl.prepend(layer);
    return layer;
}

function ensureButton(root) {
    const host = root.getElementById("editorActions");
    let button = root.getElementById("writer-background");
    if (!button) {
        button = root.createElement("button");
        button.type = "button";
        button.id = "writer-background";
        button.className = "quote-button";
        button.setAttribute("aria-haspopup", "dialog");
        button.textContent = "Background";
        (host || root.body).append(button);
    }
    return button;
}

function ensureDialog(root) {
    let overlay = root.getElementById("writerBackgroundOverlay");
    if (overlay) return overlay;
    overlay = root.createElement("div");
    overlay.className = "confirm-overlay writer-bg-overlay";
    overlay.id = "writerBackgroundOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="writer-bg-dialog" role="dialog" aria-modal="true" aria-labelledby="writerBgTitle">
            <h2 class="writer-bg-title" id="writerBgTitle">Editor background</h2>
            <p class="writer-bg-copy">Pick a picture for this book. It stays still while the writing scrolls. Each book can have its own.</p>
            <div class="writer-bg-preview" data-preview hidden>
                <img alt="Current editor background" />
            </div>
            <p class="writer-bg-status" data-status role="status"></p>
            <input type="file" accept="image/*" hidden data-file />
            <div class="writer-bg-actions">
                <button type="button" class="quote-button quote-primary" data-choose>Choose image</button>
                <button type="button" class="quote-button" data-remove hidden>Remove</button>
                <button type="button" class="quote-button" data-close>Close</button>
            </div>
        </div>
    `;
    root.body.append(overlay);
    return overlay;
}

function canUpload(session, bookId) {
    return session?.mode === "cloud"
        && Boolean(session?.user?.id)
        && Boolean(bookId)
        && !String(bookId).startsWith("local-book-");
}

export function mountWriterBackground({
    bookId,
    session,
    supabase,
    getBook,
    persist,
    mainEl,
    root = document,
} = {}) {
    if (!mainEl || !bookId) return { refresh() {} };

    const button = ensureButton(root);
    const overlay = ensureDialog(root);
    const dialog = overlay.querySelector(".writer-bg-dialog");
    const preview = overlay.querySelector("[data-preview]");
    const previewImg = preview?.querySelector("img");
    const statusEl = overlay.querySelector("[data-status]");
    const fileInput = overlay.querySelector("[data-file]");
    const chooseBtn = overlay.querySelector("[data-choose]");
    const removeBtn = overlay.querySelector("[data-remove]");
    const closeBtn = overlay.querySelector("[data-close]");
    const layer = ensureLayer(mainEl);
    const layerImg = layer.querySelector("img");

    let paintGeneration = 0;
    let currentSrc = "";
    let busy = false;

    function setStatus(text) {
        if (statusEl) statusEl.textContent = text || "";
    }

    function setBusy(next) {
        busy = next;
        if (chooseBtn) chooseBtn.disabled = next;
        if (removeBtn) removeBtn.disabled = next;
        if (fileInput) fileInput.disabled = next;
    }

    function paintPreview(src) {
        if (!preview || !previewImg) return;
        if (!src) {
            previewImg.removeAttribute("src");
            preview.hidden = true;
            if (removeBtn) removeBtn.hidden = true;
            return;
        }
        previewImg.src = src;
        preview.hidden = false;
        if (removeBtn) removeBtn.hidden = false;
    }

    function paint(src) {
        currentSrc = src || "";
        if (!src) {
            layerImg.removeAttribute("src");
            layer.hidden = true;
            mainEl.classList.remove("has-writer-bg");
            paintPreview("");
            return;
        }
        layerImg.onload = () => {
            layer.hidden = false;
            mainEl.classList.add("has-writer-bg");
        };
        layerImg.onerror = () => {
            layer.hidden = true;
            mainEl.classList.remove("has-writer-bg");
        };
        layerImg.src = src;
        paintPreview(src);
    }

    function storedUrl() {
        return readPublishDraft(getBook?.() || {}).writerBackgroundUrl || "";
    }

    async function resolveSrc() {
        const local = await loadLocalWriterBackground(bookId);
        if (local) return local;
        const remote = storedUrl();
        if (!remote) return "";
        return rememberWriterBackground(remote);
    }

    async function refresh() {
        const token = ++paintGeneration;
        try {
            const src = await resolveSrc();
            if (token !== paintGeneration) return;
            paint(src);
            if (!src) setStatus("");
        } catch {
            if (token !== paintGeneration) return;
            paint("");
        }
    }

    function persistUrl(url) {
        const book = getBook?.();
        if (!book || !persist) return;
        persist({
            ...book,
            publish_meta: mergePublishMeta(book.publish_meta, { writerBackgroundUrl: url || "" }),
        });
    }

    function openDialog() {
        overlay.hidden = false;
        button.setAttribute("aria-expanded", "true");
        paintPreview(currentSrc);
        if (!statusEl?.textContent) {
            setStatus(currentSrc
                ? (canUpload(session, bookId) ? "Saved for this book." : "Saved for this book on this device.")
                : "");
        }
        (chooseBtn || closeBtn)?.focus();
    }

    function closeDialog() {
        overlay.hidden = true;
        button.setAttribute("aria-expanded", "false");
        if (fileInput) fileInput.value = "";
        button.focus();
    }

    async function chooseFile(file) {
        if (!file) return;
        const token = ++paintGeneration;
        setBusy(true);
        setStatus("Preparing image…");
        try {
            const prepared = await prepareWriterBackgroundFile(file);
            if (token !== paintGeneration) return;
            const localSrc = await saveLocalWriterBackground(bookId, prepared);
            if (token !== paintGeneration) return;
            paint(localSrc);
            if (canUpload(session, bookId)) {
                setStatus("Saving…");
                const url = await uploadWriterBackground(supabase, bookId, prepared, session.user.id);
                if (token !== paintGeneration) return;
                persistUrl(url);
                setStatus("Saved for this book.");
            } else {
                setStatus("Saved for this book on this device.");
            }
        } catch (error) {
            if (token !== paintGeneration) return;
            setStatus(String(error?.message || error || "Could not use that image."));
        } finally {
            if (token === paintGeneration) setBusy(false);
            if (fileInput) fileInput.value = "";
        }
    }

    async function removeBackground() {
        const token = ++paintGeneration;
        setBusy(true);
        try {
            await clearLocalWriterBackground(bookId);
            if (token !== paintGeneration) return;
            persistUrl("");
            paint("");
            setStatus("Background removed.");
        } catch (error) {
            if (token !== paintGeneration) return;
            setStatus(String(error?.message || error || "Could not remove the background."));
        } finally {
            if (token === paintGeneration) setBusy(false);
        }
    }

    button.addEventListener("click", () => {
        if (overlay.hidden) openDialog();
        else closeDialog();
    });
    chooseBtn?.addEventListener("click", () => fileInput?.click());
    removeBtn?.addEventListener("click", () => { void removeBackground(); });
    closeBtn?.addEventListener("click", closeDialog);
    fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) void chooseFile(file);
    });
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeDialog();
    });
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeDialog();
        }
    });
    dialog?.addEventListener("click", (event) => event.stopPropagation());

    void refresh();
    return { refresh, close: closeDialog, applyFile: chooseFile };
}
