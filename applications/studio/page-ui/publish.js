import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js?v=8";
import { listBodyChapters, listBodyChaptersWithDepth } from "@alysum/writing-engine/manuscript.js?v=6";
import { countWordsInHtml } from "@alysum/writing-engine/word-count.js";
import { peekWorkspaceProfile } from "@alysum/account/workspace-profile.js";
import { genreLabel, matchingGenreKeys, toggleGenreSelection } from "@alysum/publishing/genres.js";
import {
    clearDraftCover,
    defaultCrops,
    loadDraftCover,
    loadDraftCoverFile,
    saveDraftCover,
    uploadBookCover,
} from "@alysum/publishing/cover-upload.js?v=2";
import { CONTENT_WARNINGS, readPublishDraft } from "@alysum/publishing/publish-meta.js";
import { saveLibraryListing } from "@alysum/publishing/post-work.js";
import { bindPageLook, paintPageLook, readPageLook } from "./page-look.js";
import {
    CROP_ASPECT,
    applyPreview,
    fractionAspect,
    moveCrop,
    placeCrop,
    resizeCrop,
} from "/js/studio/cover-crop.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function bookIdFromUrl() {
    return new URLSearchParams(window.location.search).get("book") || "";
}

function checkedValues(root) {
    return [...(root?.querySelectorAll("input:checked") || [])].map((el) => el.value);
}

function orderedChapters(list, ids) {
    const byId = new Map(list.map((ch) => [String(ch.id), ch]));
    const seen = new Set();
    const ordered = [];
    for (const id of ids || []) {
        const ch = byId.get(String(id));
        if (!ch || seen.has(String(ch.id))) continue;
        seen.add(String(ch.id));
        ordered.push(ch);
    }
    for (const ch of list) {
        if (!seen.has(String(ch.id))) ordered.push(ch);
    }
    return ordered;
}

function paintPreview(chapter) {
    const label = document.getElementById("previewLabel");
    const words = document.getElementById("previewWords");
    const body = document.getElementById("previewBody");
    if (!chapter) {
        if (label) label.textContent = "Chapter preview";
        if (words) words.textContent = "";
        if (body) body.textContent = "Select a chapter.";
        return;
    }
    if (label) label.textContent = chapter.title || "Untitled";
    if (words) words.textContent = `${countWordsInHtml(chapter.content || "").toLocaleString()} words`;
    if (body) {
        const html = String(chapter.content || "").trim();
        body.innerHTML = html || "<p>(This chapter has no text yet.)</p>";
    }
}

function paintChapterSummary() {
    const summary = document.getElementById("chapterSummary");
    const n = document.querySelectorAll("[data-chapter-id]:checked").length;
    if (summary) summary.textContent = `Chapters to post (${n})`;
}

async function boot() {
    const status = document.getElementById("pubStatus");
    const session = await requireStudioSession(supabase, "/publish");
    if (!session) return;
    const bookId = bookIdFromUrl();
    if (!bookId) {
        window.location.replace("/studio");
        return;
    }
    const api = createBooksApi(session, supabase);
    const book = await api.getBook(bookId);
    if (!book) {
        if (status) status.textContent = "Book not found.";
        return;
    }
    const profile = peekWorkspaceProfile(session);
    const draft = readPublishDraft(book);
    book._author = draft.author || profile?.name || "";
    const chapters = listBodyChapters(book.sections);
    const chapterDepth = new Map(
        listBodyChaptersWithDepth(book.sections).map((row) => [String(row.chapter.id), row.depth]),
    );
    const selectedIds = draft.draftChapterIds;
    const hasSelection = selectedIds.length > 0;
    let coverUrl = draft.cover_url;
    let coverSrc = "";
    let selectedGenres = draft.genres.slice();
    const seeds = defaultCrops();
    const oldAutoLibrary = draft.coverCrop
        && draft.coverCrop.h >= 0.98
        && Math.abs(draft.coverCrop.w - 2 / 3) < 0.04;
    const crops = {
        library: (!draft.coverCrop || oldAutoLibrary) ? seeds.coverCrop : draft.coverCrop,
        mini: draft.coverMini || seeds.coverMini,
        wide: draft.coverWide || seeds.coverWide,
    };
    let wideOn = draft.coverWideEnabled;
    let activeCrop = "library";

    const editor = document.getElementById("coverEditor");
    const stageImg = document.getElementById("coverStageImg");
    const cropFrame = document.getElementById("cropFrame");
    const wideCheck = document.getElementById("coverWideOn");

    function paintCrops() {
        placeCrop(cropFrame, crops[activeCrop]);
        document.querySelectorAll("[data-crop-tab]").forEach((el) => {
            const key = el.getAttribute("data-crop-tab");
            el.classList.toggle("is-on", key === activeCrop);
            if (key === "wide") el.hidden = !wideOn;
        });
        const wrap = document.getElementById("prevWideWrap");
        if (wrap) wrap.hidden = !wideOn;
        if (wideCheck) wideCheck.checked = wideOn;
        applyPreview(document.getElementById("prevLib"), coverSrc, crops.library);
        applyPreview(document.getElementById("prevMini"), coverSrc, crops.mini);
        applyPreview(document.getElementById("prevWide"), coverSrc, crops.wide);
    }

    function showEditor(src) {
        coverSrc = src;
        if (editor) editor.hidden = !src;
        if (stageImg) stageImg.src = src || "";
        paintCrops();
    }

    function setActiveCrop(key) {
        if (key === "wide" && !wideOn) return;
        if (!CROP_ASPECT[key]) return;
        activeCrop = key;
        paintCrops();
    }

    function readForm() {
        const tags = String(document.getElementById("extraTags")?.value || "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
        const selected = [...document.querySelectorAll("[data-chapter-id]:checked")].map((el) => el.dataset.chapterId);
        return {
            title: document.getElementById("workTitle")?.value || book.title,
            author: book._author || "",
            summary: document.getElementById("workSummary")?.value || "",
            notesBefore: document.getElementById("workNotes")?.value || "",
            genre: selectedGenres[0] || "",
            genres: selectedGenres.slice(0, 3),
            rating: document.querySelector("#ratingPicker input:checked")?.value || "",
            warnings: checkedValues(document.getElementById("warningPicker")),
            tags,
            coverUrl,
            coverCrop: crops.library,
            coverMini: crops.mini,
            coverWide: crops.wide,
            coverWideEnabled: wideOn,
            complete: Boolean(document.getElementById("workComplete")?.checked),
            chapterIds: selected,
            ...readPageLook(),
        };
    }

    async function save(isPublished) {
        try {
            const form = { ...readForm(), isPublished };
            const title = String(form.title || "").trim();
            if (isPublished) {
                if (session.mode !== "cloud" || !session.user?.id) {
                    if (status) status.textContent = "Sign in and save this book to your account before posting.";
                    return;
                }
                if (!form.genres.length || !form.rating || !title) {
                    if (status) status.textContent = "Choose a genre, rating, and title first.";
                    return;
                }
                if (!form.chapterIds.length) {
                    if (status) status.textContent = "Pick at least one chapter to post.";
                    return;
                }
            }
            if (status) status.textContent = isPublished ? "Posting…" : "Saving…";
            if (isPublished) {
                const draftFile = await loadDraftCoverFile(book.id);
                if (draftFile) {
                    coverUrl = await uploadBookCover(supabase, book.id, draftFile, session.user.id);
                    form.coverUrl = coverUrl;
                    await clearDraftCover(book.id);
                }
            }
            const publishMeta = {
                author: form.author,
                synopsis: form.summary,
                tags: form.tags,
                warnings: form.warnings,
                cover_url: form.coverUrl,
                coverCrop: form.coverCrop,
                coverMini: form.coverMini,
                coverWide: form.coverWideEnabled ? form.coverWide : null,
                coverWideEnabled: form.coverWideEnabled,
                genre: form.genre,
                genres: form.genres,
                rating: form.rating,
                notesBefore: form.notesBefore,
                complete: form.complete,
                draftChapterIds: form.chapterIds,
                pageLook: form.pageLook,
                pageLookSaved: form.pageLookSaved,
                pageBgId: form.pageBgId,
                pageBg: form.pageBg,
            };
            if (isPublished) {
                await saveLibraryListing(supabase, session.user.id, book, form);
            }
            const patch = {
                title: title || book.title || "Untitled",
                publish_meta: publishMeta,
            };
            if (isPublished || !book.is_published) {
                patch.published_chapter_ids = form.chapterIds;
            }
            if (isPublished) patch.is_published = true;
            await api.updateBook(book.id, patch);
            window.location.replace(isPublished
                ? `/book?id=${encodeURIComponent(book.id)}`
                : "/studio");
        } catch (error) {
            if (status) status.textContent = error?.message || "Could not save this listing.";
        }
    }
    document.getElementById("saveDraftBtn")?.addEventListener("click", () => { void save(false); });
    document.getElementById("postBtn")?.addEventListener("click", () => { void save(true); });

    function paintStrip() {
        const strip = document.getElementById("previewStrip");
        if (!strip) return;
        const form = readForm();
        strip.textContent = [
            form.rating ? `Rating: ${form.rating}` : "Rating: —",
            form.genres.length ? form.genres.map(genreLabel).join(" · ") : "Genre: —",
            `${form.chapterIds.length} chapter${form.chapterIds.length === 1 ? "" : "s"}`,
            form.complete ? "Complete" : "Work in progress",
        ].join(" · ");
    }

    let genreQuery = "";

    function paintGenrePicker() {
        const chips = document.getElementById("genreChips");
        const menu = document.getElementById("genreMenu");
        if (chips) {
            chips.innerHTML = selectedGenres.map((key, ix) =>
                `<button type="button" class="is-on" data-genre="${key}" data-role="${ix + 1}">${genreLabel(key)}</button>`
            ).join("");
        }
        if (menu) {
            const keys = matchingGenreKeys(genreQuery).filter((key) => !selectedGenres.includes(key));
            menu.innerHTML = keys.length
                ? keys.map((key) => `<button type="button" data-genre="${key}">${genreLabel(key)}</button>`).join("")
                : `<p class="pub-hint">No matching genres.</p>`;
        }
    }

    function applyGenre(key) {
        selectedGenres = toggleGenreSelection(selectedGenres, key);
        paintGenrePicker();
        paintStrip();
    }

    const warningPicker = document.getElementById("warningPicker");
    if (warningPicker) {
        warningPicker.innerHTML = CONTENT_WARNINGS.map((item) =>
            `<label><input type="checkbox" value="${escapeHtml(item)}" /> ${escapeHtml(item)}</label>`
        ).join("");
    }

    paintPageLook(document, draft);
    bindPageLook(document);
    const workTitle = document.getElementById("workTitle");
    if (workTitle) workTitle.value = book.title || "";
    const workSummary = document.getElementById("workSummary");
    if (workSummary) workSummary.value = draft.synopsis || "";
    const workNotes = document.getElementById("workNotes");
    if (workNotes) workNotes.value = draft.notesBefore || "";
    const extraTags = document.getElementById("extraTags");
    if (extraTags) extraTags.value = draft.tags.join(", ");
    void loadDraftCover(book.id).then((localSrc) => {
        const src = localSrc || coverUrl;
        if (src) showEditor(src);
    });
    if (draft.complete) {
        document.getElementById("workComplete").checked = true;
        document.getElementById("workWip").checked = false;
    }
    if (draft.rating) {
        const radio = document.querySelector(`#ratingPicker input[value="${CSS.escape(String(draft.rating))}"]`);
        if (radio) radio.checked = true;
    }
    const warningSet = new Set(draft.warnings);
    document.querySelectorAll("#warningPicker input").forEach((el) => {
        el.checked = warningSet.has(el.value);
    });

    const picker = document.getElementById("genrePicker");
    const search = document.getElementById("genreSearch");
    const menu = document.getElementById("genreMenu");
    picker?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-genre]");
        if (!btn) return;
        applyGenre(btn.dataset.genre);
        if (menu && !document.getElementById("genreChips")?.contains(btn)) menu.hidden = true;
    });
    search?.addEventListener("input", (event) => {
        genreQuery = event.target.value;
        paintGenrePicker();
        if (menu) menu.hidden = false;
    });
    search?.addEventListener("focus", () => {
        if (menu) menu.hidden = false;
    });
    document.addEventListener("click", (event) => {
        if (!picker || picker.contains(event.target)) return;
        if (menu) menu.hidden = true;
    });
    paintGenrePicker();

    wideCheck?.addEventListener("change", () => {
        wideOn = Boolean(wideCheck.checked);
        if (!wideOn && activeCrop === "wide") activeCrop = "library";
        paintCrops();
    });

    document.getElementById("cropTabs")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-crop-tab]");
        if (btn) setActiveCrop(btn.getAttribute("data-crop-tab"));
    });
    document.querySelector(".pub-cover-previews")?.addEventListener("click", (event) => {
        const fig = event.target.closest("[data-crop-tab]");
        if (fig) setActiveCrop(fig.getAttribute("data-crop-tab"));
    });

    cropFrame?.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const stage = document.getElementById("coverStage");
        const box = stage?.getBoundingClientRect();
        if (!box || !box.width || !box.height) return;
        const handle = event.target.closest("[data-handle]")?.getAttribute("data-handle") || "";
        const pointerX = event.clientX;
        const pointerY = event.clientY;
        const start = { ...crops[activeCrop] };
        try {
            cropFrame.setPointerCapture(event.pointerId);
        } catch {
            /* ignore */
        }
        function move(ev) {
            const dx = (ev.clientX - pointerX) / box.width;
            const dy = (ev.clientY - pointerY) / box.height;
            const aspect = fractionAspect(CROP_ASPECT[activeCrop], box);
            crops[activeCrop] = handle
                ? resizeCrop(handle, start, dx, dy, aspect)
                : moveCrop(start, dx, dy);
            paintCrops();
        }
        function up() {
            cropFrame.removeEventListener("pointermove", move);
            cropFrame.removeEventListener("pointerup", up);
        }
        cropFrame.addEventListener("pointermove", move);
        cropFrame.addEventListener("pointerup", up);
        paintCrops();
    });

    document.getElementById("workCoverFile")?.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const localUrl = URL.createObjectURL(file);
        activeCrop = "library";
        showEditor(localUrl);
        const applyDefaults = () => {
            const fresh = defaultCrops(stageImg?.naturalWidth, stageImg?.naturalHeight);
            crops.library = fresh.coverCrop;
            crops.mini = fresh.coverMini;
            crops.wide = fresh.coverWide;
            paintCrops();
        };
        if (stageImg?.complete && stageImg.naturalWidth) applyDefaults();
        else stageImg?.addEventListener("load", applyDefaults, { once: true });
        try {
            await saveDraftCover(book.id, file);
            if (status) status.textContent = "Cover saved on this device. It uploads when you post.";
        } catch (error) {
            if (status) status.textContent = error?.message || "Could not save cover.";
        }
    });

    const list = document.getElementById("chapterList");
    const select = document.getElementById("chapterSelect");
    const shown = orderedChapters(chapters, selectedIds);
    if (list) {
        list.innerHTML = shown.map((ch, index) => {
            const on = hasSelection ? selectedIds.includes(String(ch.id)) : index === 0;
            const depth = chapterDepth.get(String(ch.id)) || 0;
            return `
            <label class="pub-chapter" style="--ch-depth:${depth}">
                <input type="checkbox" data-chapter-id="${escapeHtml(ch.id)}" ${on ? "checked" : ""} />
                ${escapeHtml(ch.title || "Untitled")}
            </label>`;
        }).join("") || "<p class='pub-hint'>This book has no chapters yet.</p>";
    }
    if (select) {
        select.innerHTML = shown.map((ch, index) => {
            const depth = chapterDepth.get(String(ch.id)) || 0;
            const pad = "\u00a0\u00a0".repeat(depth);
            return `<option value="${index}">${pad}${escapeHtml(ch.title || "Untitled")}</option>`;
        }).join("");
        select.addEventListener("change", () => paintPreview(shown[Number(select.value)]));
    }
    paintPreview(shown[0]);
    paintChapterSummary();
    document.getElementById("workComplete")?.addEventListener("change", (event) => {
        if (event.target.checked) document.getElementById("workWip").checked = false;
        paintStrip();
    });
    document.getElementById("workWip")?.addEventListener("change", (event) => {
        if (event.target.checked) document.getElementById("workComplete").checked = false;
        paintStrip();
    });
    document.querySelector(".pub-page")?.addEventListener("change", () => {
        paintChapterSummary();
        paintStrip();
    });
    paintStrip();
}

boot().catch((error) => {
    const status = document.getElementById("pubStatus");
    if (status) status.textContent = error?.message || "Publish page failed to load.";
});
