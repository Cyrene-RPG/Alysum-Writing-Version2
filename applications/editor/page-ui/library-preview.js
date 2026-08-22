import { listBodyChapters } from "@alysum/writing-engine/manuscript.js?v=5";

const WARNING_PRESETS = [
    "Graphic violence",
    "Sexual content",
    "Strong language",
    "Death",
    "Abuse",
    "Self-harm",
];

export function readPublishMeta(book) {
    const raw = book?.publish_meta && typeof book.publish_meta === "object" && !Array.isArray(book.publish_meta)
        ? book.publish_meta
        : {};
    const ids = Array.isArray(book?.published_chapter_ids) ? book.published_chapter_ids.map(String) : [];
    return {
        author: String(raw.author || ""),
        tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
        warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : [],
        synopsis: String(raw.synopsis || ""),
        cover_url: String(raw.cover_url || raw.coverUrl || ""),
        published_chapter_ids: ids,
    };
}

export function mountLibraryPreview({
    pane,
    writerMain,
    supabase,
    session,
    getBook,
    persistMeta,
    defaultAuthor = "",
}) {
    if (!pane) return { show() {}, hide() {}, paint() {} };

    pane.innerHTML = `
        <div class="lib-banner">
            <div class="lib-banner-copy">
                <p class="lib-banner-kicker">Library preview</p>
                <p>This is how the book will look. It isn’t published yet.</p>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
                <button type="button" class="lib-back-btn" id="libBackBtn">Back to settings</button>
            </div>
        </div>
        <div class="lib-cover-row">
            <button type="button" class="lib-cover" id="libCover" aria-label="Upload cover">
                <span class="lib-cover-ph">Add cover</span>
                <img id="libCoverImg" alt="" />
            </button>
            <input type="file" accept="image/*" class="lib-cover-file" id="libCoverFile" />
            <div class="lib-meta">
                <input class="lib-title" id="libTitle" aria-label="Book title" />
                <input class="lib-author" id="libAuthor" aria-label="Author name" />
                <div class="lib-tags" id="libTags"></div>
                <div class="lib-warns">
                    <div class="lib-warn-row" id="libWarns"></div>
                    <input class="lib-warn-input" id="libWarnInput" placeholder="Add a content warning" />
                    <div class="lib-presets" id="libPresets"></div>
                </div>
            </div>
        </div>
        <div class="lib-block">
            <h3>Synopsis</h3>
            <p class="lib-synopsis is-short" id="libSynopsis"></p>
            <textarea class="lib-syn-edit hidden" id="libSynopsisEdit"></textarea>
            <button type="button" class="lib-more" id="libSynopsisMore">Show more</button>
            <button type="button" class="lib-more" id="libSynopsisEditBtn">Edit</button>
        </div>
        <div class="lib-block">
            <h3>Table of contents</h3>
            <ol class="lib-toc" id="libToc"></ol>
            <button type="button" class="lib-manage" id="libManageBtn">Manage chapters</button>
        </div>
    `;

    const coverBtn = pane.querySelector("#libCover");
    const coverImg = pane.querySelector("#libCoverImg");
    const coverFile = pane.querySelector("#libCoverFile");
    const titleEl = pane.querySelector("#libTitle");
    const authorEl = pane.querySelector("#libAuthor");
    const tagsEl = pane.querySelector("#libTags");
    const warnsEl = pane.querySelector("#libWarns");
    const warnInput = pane.querySelector("#libWarnInput");
    const presetsEl = pane.querySelector("#libPresets");
    const synopsisEl = pane.querySelector("#libSynopsis");
    const synopsisEdit = pane.querySelector("#libSynopsisEdit");
    const synopsisMore = pane.querySelector("#libSynopsisMore");
    const synopsisEditBtn = pane.querySelector("#libSynopsisEditBtn");
    const tocEl = pane.querySelector("#libToc");
    const overlay = document.getElementById("chapterManageOverlay");
    const unpublishedList = document.getElementById("unpublishedList");
    const publishedList = document.getElementById("publishedList");
    const unpublishedCount = document.getElementById("unpublishedCount");
    const publishedCount = document.getElementById("publishedCount");
    const toast = document.getElementById("libToast");
    let expanded = false;
    let editingSynopsis = false;
    let draftUnpublished = [];
    let draftPublished = [];

    function metaFromBook() {
        const book = getBook();
        const meta = readPublishMeta(book);
        if (!meta.author) meta.author = defaultAuthor;
        return { book, meta };
    }

    function showToast(text) {
        if (!toast) return;
        toast.textContent = text;
        toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
    }

    function paintTags(tags) {
        tagsEl.innerHTML = tags.map((tag) => `
            <span class="lib-tag">${escapeHtml(tag)}<button type="button" data-remove-tag="${escapeHtml(tag)}" aria-label="Remove tag">×</button></span>
        `).join("") + `
            <span class="lib-tag-add"><input id="libTagInput" placeholder="Add tag" /></span>
        `;
    }

    function paintWarnings(warnings) {
        warnsEl.innerHTML = warnings.map((item) => `
            <span class="lib-warn">${escapeHtml(item)}<button type="button" data-remove-warn="${escapeHtml(item)}" aria-label="Remove warning" style="margin-left:4px;border:0;background:none;color:inherit;cursor:pointer">×</button></span>
        `).join("");
        presetsEl.innerHTML = WARNING_PRESETS.map((item) => (
            `<button type="button" class="lib-preset" data-preset="${escapeHtml(item)}">${escapeHtml(item)}</button>`
        )).join("");
    }

    function paintToc(book, ids) {
        const chapters = listBodyChapters(book.sections);
        const byId = new Map(chapters.map((ch) => [String(ch.id), ch]));
        const published = ids.map((id) => byId.get(String(id))).filter(Boolean);
        tocEl.innerHTML = published.length
            ? published.map((ch, i) => `<li>${i + 1}. ${escapeHtml(ch.title || "Untitled")}</li>`).join("")
            : "<li>No published chapters yet.</li>";
    }

    function paint() {
        const { book, meta } = metaFromBook();
        titleEl.value = book.title || "";
        authorEl.value = meta.author || "";
        if (meta.cover_url) {
            coverImg.src = meta.cover_url;
            coverBtn.classList.add("has-img");
        } else {
            coverImg.removeAttribute("src");
            coverBtn.classList.remove("has-img");
        }
        paintTags(meta.tags);
        paintWarnings(meta.warnings);
        synopsisEl.textContent = meta.synopsis || "No synopsis yet.";
        synopsisEl.classList.toggle("is-short", !expanded);
        synopsisMore.textContent = expanded ? "Show less" : "Show more";
        synopsisEdit.classList.toggle("hidden", !editingSynopsis);
        synopsisEl.classList.toggle("hidden", editingSynopsis);
        if (synopsisEditBtn) synopsisEditBtn.textContent = editingSynopsis ? "Done" : "Edit";
        if (editingSynopsis) synopsisEdit.value = meta.synopsis || "";
        paintToc(book, meta.published_chapter_ids);
    }

    function saveMeta(patch, extra = {}) {
        const { book, meta } = metaFromBook();
        const nextMeta = { ...meta, ...patch };
        const published = extra.published_chapter_ids || nextMeta.published_chapter_ids;
        persistMeta({
            title: extra.title != null ? extra.title : book.title,
            publish_meta: {
                author: nextMeta.author,
                tags: nextMeta.tags,
                warnings: nextMeta.warnings,
                synopsis: nextMeta.synopsis,
                cover_url: nextMeta.cover_url,
            },
            published_chapter_ids: published,
        });
    }

    function show() {
        writerMain?.classList.add("is-preview");
        pane.classList.remove("hidden");
        expanded = false;
        editingSynopsis = false;
        paint();
    }

    function hide() {
        writerMain?.classList.remove("is-preview");
        pane.classList.add("hidden");
        if (overlay) overlay.hidden = true;
    }

    pane.querySelector("#libBackBtn")?.addEventListener("click", hide);
    coverBtn?.addEventListener("click", () => coverFile?.click());
    coverFile?.addEventListener("change", async () => {
        const file = coverFile.files?.[0];
        coverFile.value = "";
        if (!file) return;
        const book = getBook();
        if (session?.mode !== "cloud" || !supabase) {
            showToast("Cover upload needs a signed-in account.");
            return;
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${book.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("book-covers").upload(path, file, { upsert: true });
        if (error) {
            showToast(error.message || "Couldn't upload cover.");
            return;
        }
        const { data } = supabase.storage.from("book-covers").getPublicUrl(path);
        saveMeta({ cover_url: data?.publicUrl || "" });
        paint();
    });
    titleEl?.addEventListener("change", () => saveMeta({}, { title: titleEl.value }));
    authorEl?.addEventListener("change", () => saveMeta({ author: authorEl.value }));
    tagsEl?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-remove-tag]");
        if (!btn) return;
        const { meta } = metaFromBook();
        saveMeta({ tags: meta.tags.filter((tag) => tag !== btn.dataset.removeTag) });
        paint();
    });
    tagsEl?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const input = event.target.closest("#libTagInput");
        if (!input) return;
        event.preventDefault();
        const tag = String(input.value || "").trim();
        if (!tag) return;
        const { meta } = metaFromBook();
        if (!meta.tags.includes(tag)) saveMeta({ tags: [...meta.tags, tag] });
        paint();
    });
    warnsEl?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-remove-warn]");
        if (!btn) return;
        const { meta } = metaFromBook();
        saveMeta({ warnings: meta.warnings.filter((item) => item !== btn.dataset.removeWarn) });
        paint();
    });
    presetsEl?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-preset]");
        if (!btn) return;
        const { meta } = metaFromBook();
        if (!meta.warnings.includes(btn.dataset.preset)) {
            saveMeta({ warnings: [...meta.warnings, btn.dataset.preset] });
            paint();
        }
    });
    warnInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const item = String(warnInput.value || "").trim();
        if (!item) return;
        const { meta } = metaFromBook();
        if (!meta.warnings.includes(item)) saveMeta({ warnings: [...meta.warnings, item] });
        warnInput.value = "";
        paint();
    });
    synopsisMore?.addEventListener("click", () => {
        expanded = !expanded;
        paint();
    });
    synopsisEditBtn?.addEventListener("click", () => {
        if (editingSynopsis) {
            saveMeta({ synopsis: synopsisEdit.value });
            editingSynopsis = false;
        } else {
            editingSynopsis = true;
        }
        paint();
        synopsisEditBtn.textContent = editingSynopsis ? "Done" : "Edit";
    });

    function chapterChip(chapter) {
        const el = document.createElement("div");
        el.className = "lib-chip";
        el.draggable = true;
        el.dataset.id = chapter.id;
        el.textContent = chapter.title || "Untitled";
        el.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/plain", chapter.id);
        });
        return el;
    }

    function paintManageLists() {
        unpublishedList.innerHTML = "";
        publishedList.innerHTML = "";
        draftUnpublished.forEach((ch) => unpublishedList.appendChild(chapterChip(ch)));
        draftPublished.forEach((ch) => publishedList.appendChild(chapterChip(ch)));
        unpublishedCount.textContent = String(draftUnpublished.length);
        publishedCount.textContent = String(draftPublished.length);
    }

    function bindDrop(listEl, side) {
        listEl?.addEventListener("dragover", (event) => event.preventDefault());
        listEl?.addEventListener("drop", (event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData("text/plain");
            if (!id) return;
            const fromPub = draftPublished.findIndex((ch) => ch.id === id);
            const fromUn = draftUnpublished.findIndex((ch) => ch.id === id);
            let item = null;
            if (fromPub >= 0) item = draftPublished.splice(fromPub, 1)[0];
            if (fromUn >= 0) item = draftUnpublished.splice(fromUn, 1)[0];
            if (!item) return;
            if (side === "published") draftPublished.push(item);
            else draftUnpublished.push(item);
            paintManageLists();
        });
    }
    bindDrop(unpublishedList, "unpublished");
    bindDrop(publishedList, "published");

    pane.querySelector("#libManageBtn")?.addEventListener("click", () => {
        const { book, meta } = metaFromBook();
        const chapters = listBodyChapters(book.sections);
        const publishedIds = new Set(meta.published_chapter_ids.map(String));
        draftPublished = meta.published_chapter_ids
            .map((id) => chapters.find((ch) => String(ch.id) === String(id)))
            .filter(Boolean);
        draftUnpublished = chapters.filter((ch) => !publishedIds.has(String(ch.id)));
        paintManageLists();
        if (overlay) overlay.hidden = false;
    });
    document.getElementById("chapterManageCancel")?.addEventListener("click", () => {
        if (overlay) overlay.hidden = true;
    });
    document.getElementById("chapterManageSave")?.addEventListener("click", () => {
        saveMeta({}, { published_chapter_ids: draftPublished.map((ch) => ch.id) });
        if (overlay) overlay.hidden = true;
        paint();
        showToast("Chapter lists saved.");
    });

    return { show, hide, paint };
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
