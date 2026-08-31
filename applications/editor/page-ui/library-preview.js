import { listBodyChapters } from "@alysum/writing-engine/manuscript.js?v=6";
import { mergePublishMeta, readPublishDraft } from "@alysum/publishing/publish-meta.js";
import { storePickedCover, wideCropFromMeta } from "./cover.js?v=3";
import { clearVisitPageLook } from "@alysum/site-appearance/js-runtime/visit-page-look.js?v=6";
import { bindPreviewBook, paintPreviewBook, previewBookHtml } from "./preview-book.js?v=19";

export function readPublishMeta(book) {
    const draft = readPublishDraft(book);
    return { ...draft, published_chapter_ids: draft.draftChapterIds };
}

export function mountLibraryPreview({
    pane,
    writerMain,
    getBook,
    persistMeta,
    defaultAuthor = "",
}) {
    if (!pane) return { show() {}, hide() {}, paint() {} };

    pane.innerHTML = previewBookHtml();

    const overlay = document.getElementById("chapterManageOverlay");
    const unpublishedList = document.getElementById("unpublishedList");
    const publishedList = document.getElementById("publishedList");
    const unpublishedCount = document.getElementById("unpublishedCount");
    const publishedCount = document.getElementById("publishedCount");
    const toast = document.getElementById("libToast");
    let expanded = false;
    let editingSynopsis = false;
    let editingNotes = false;
    let draftUnpublished = [];
    let draftPublished = [];

    function metaFromBook() {
        const book = getBook();
        const meta = readPublishDraft(book);
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

    function saveMeta(patch, extra = {}) {
        const { book } = metaFromBook();
        const existing = book.publish_meta && typeof book.publish_meta === "object" && !Array.isArray(book.publish_meta)
            ? book.publish_meta
            : {};
        persistMeta({
            title: extra.title != null ? extra.title : book.title,
            publish_meta: mergePublishMeta(existing, patch),
        });
    }

    function lookTargets() {
        return [pane].filter(Boolean);
    }

    function paint() {
        const { book, meta } = metaFromBook();
        paintPreviewBook(pane, { book, meta, expanded, editingSynopsis, editingNotes, lookTargets: lookTargets() });
    }

    function openManage() {
        const { book, meta } = metaFromBook();
        const chapters = listBodyChapters(book.sections);
        const publishedIds = new Set(meta.draftChapterIds.map(String));
        draftPublished = meta.draftChapterIds
            .map((id) => chapters.find((ch) => String(ch.id) === String(id)))
            .filter(Boolean);
        draftUnpublished = chapters.filter((ch) => !publishedIds.has(String(ch.id)));
        paintManageLists();
        if (overlay) overlay.hidden = false;
    }

    function show() {
        writerMain?.classList.add("is-preview");
        pane.classList.remove("hidden");
        expanded = false;
        editingSynopsis = false;
        editingNotes = false;
        paint();
    }

    function hide() {
        writerMain?.classList.remove("is-preview");
        pane.classList.add("hidden");
        lookTargets().forEach((el) => clearVisitPageLook(el));
        writerMain?.style.removeProperty("--bg");
        writerMain?.style.removeProperty("--bg-gradient-top");
        clearVisitPageLook(pane.querySelector(".book-page"));
        if (overlay) overlay.hidden = true;
    }

    pane.querySelector("#libCoverFile")?.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            await storePickedCover(getBook().id, file);
            const { meta } = metaFromBook();
            if (meta.coverWideEnabled && !meta.coverWide) {
                saveMeta({ coverWide: wideCropFromMeta(meta) });
            }
            paint();
        } catch (error) {
            showToast(error?.message || "Couldn't save cover.");
        }
    });
    pane.querySelector("#libSynopsisMore")?.addEventListener("click", () => {
        expanded = !expanded;
        paint();
    });
    pane.querySelector("#libSynopsisEditBtn")?.addEventListener("click", () => {
        const synopsisEdit = pane.querySelector("#libSynopsisEdit");
        if (editingSynopsis) {
            saveMeta({ synopsis: synopsisEdit?.value || "" });
            editingSynopsis = false;
        } else {
            editingSynopsis = true;
        }
        paint();
    });

    pane.querySelector("#libNotesEditBtn")?.addEventListener("click", () => {
        const notesEdit = pane.querySelector("#libNotesEdit");
        if (editingNotes) {
            saveMeta({ notesAfter: notesEdit?.value || "" });
            editingNotes = false;
        } else {
            editingNotes = true;
        }
        paint();
    });

    bindPreviewBook(pane, { saveMeta, paint, metaFromBook, openManage });

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

    document.getElementById("chapterManageCancel")?.addEventListener("click", () => {
        if (overlay) overlay.hidden = true;
    });
    document.getElementById("chapterManageSave")?.addEventListener("click", () => {
        saveMeta({ draftChapterIds: draftPublished.map((ch) => ch.id) });
        if (overlay) overlay.hidden = true;
        paint();
        showToast("Publish order saved.");
    });

    return { show, hide, paint };
}
