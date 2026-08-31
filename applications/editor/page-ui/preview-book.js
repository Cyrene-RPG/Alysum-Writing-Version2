import { listBodyChaptersWithDepth } from "@alysum/writing-engine/manuscript.js?v=6";
import { genreLabel, matchingGenreKeys, toggleGenreSelection } from "@alysum/publishing/genres.js?v=4";
import { CONTENT_WARNINGS, RATINGS, toggleContentWarning } from "@alysum/publishing/publish-meta.js?v=7";
import { isLibraryListed, readLocalLibraryListings } from "@alysum/publishing/post-work.js?v=8";
import { applyVisitListingLook, applyVisitSiteAccent, applyVisitTitleColor } from "@alysum/site-appearance/js-runtime/visit-page-look.js?v=10";
import { isFullCoverCrop, libraryCardCrop, coverCropForImage } from "@alysum/publishing/cover-upload.js?v=10";
import { paintBookHero, resolvePreviewCoverSrc, wideCropFromMeta } from "./cover.js?v=15";

export function previewBookHtml() {
    return `
        <div class="lib-banner">
            <div class="lib-banner-copy">
                <p class="lib-banner-kicker">Library preview</p>
                <p>This is the book page readers see. Edit it here, then publish.</p>
            </div>
            <div class="lib-banner-actions">
                <a class="lib-back-btn" id="libEditBtn" href="/publish">Edit</a>
            </div>
        </div>
        <div class="book-page">
            <article class="book-card">
                <header class="book-hero" id="libHero">
                    <div class="book-hero-top">
                        <label class="book-status" id="libCoverChange" for="libCoverFile">Change cover</label>
                    </div>
                    <div class="book-hero-bottom">
                        <label class="book-cover" id="libCover" for="libCoverFile" aria-label="Upload cover"></label>
                        <div class="book-title-block">
                            <div class="book-title-row">
                                <input class="book-title-input" id="libTitle" aria-label="Book title" />
                            </div>
                            <p class="book-by">by <input class="book-author-input" id="libAuthor" aria-label="Author name" /></p>
                            <p class="book-meta" id="libMeta"></p>
                            <label class="lib-wide-check"><input type="checkbox" id="libWideOn" /> Use wide banner</label>
                        </div>
                    </div>
                </header>
                <div class="book-body">
                    <p class="book-label">Genres</p>
                    <div class="book-tags" id="libGenreChips"></div>
                    <div class="lib-genre-picker" id="libGenres">
                        <input id="libGenreSearch" type="search" placeholder="Search genres…" autocomplete="off" />
                        <div class="lib-genre-menu" id="libGenreMenu" hidden></div>
                    </div>
                    <p class="book-label">Tags</p>
                    <div class="book-tags" id="libTags"></div>
                    <p class="book-label">Rating</p>
                    <div class="book-tags" id="libRating"></div>
                    <p class="book-label">Content warnings</p>
                    <div class="book-warns" id="libWarns"></div>
                    <div class="book-row-head">
                        <p class="book-label">Synopsis</p>
                        <button type="button" class="book-edit" id="libSynopsisEditBtn" title="Edit synopsis">✎</button>
                    </div>
                    <div class="book-synopsis-wrap">
                        <div class="book-synopsis clipped" id="libSynopsis"></div>
                        <textarea class="lib-syn-edit hidden" id="libSynopsisEdit"></textarea>
                        <div class="book-synopsis-fade" id="libSynopsisFade"></div>
                    </div>
                    <button type="button" class="book-more" id="libSynopsisMore">Edit</button>
                    <div class="book-row-head">
                        <p class="book-label">Notes</p>
                        <button type="button" class="book-edit" id="libNotesEditBtn" title="Edit notes">✎</button>
                    </div>
                    <div class="book-synopsis-wrap">
                        <div class="book-synopsis" id="libNotes"></div>
                        <textarea class="lib-syn-edit hidden" id="libNotesEdit" placeholder="Optional notes under the synopsis."></textarea>
                    </div>
                    <span class="book-cta" id="libCta">Start reading ›</span>
                    <div class="book-rule"></div>
                    <div class="book-toc-head">
                        <div class="book-toc-left">
                            <p class="book-label">Chapters</p>
                            <button type="button" class="book-add-ch" id="libManageBtn">＋ Add</button>
                        </div>
                        <span class="book-toc-count" id="libChapterCount"></span>
                    </div>
                    <p class="book-toc-hint">Manage which chapters go live</p>
                    <div id="libToc"></div>
                    <div class="book-rule"></div>
                    <div class="book-reviews">
                        <p class="book-label">Reviews</p>
                        <p class="book-reviews-empty">No reviews yet</p>
                    </div>
                </div>
            </article>
        </div>
        <input type="file" accept="image/*" class="lib-cover-file" id="libCoverFile" />
    `;
}

function localListingData(book) {
    const id = String(book?.id || "");
    if (!id) return null;
    return readLocalLibraryListings().find((row) => String(row.id) === id)?.data || null;
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function applyPreviewLook(targets, meta, pageEl) {
    const bg = targets[0];
    if (!bg) return;
    const page = pageEl && bg.contains(pageEl) ? pageEl : bg;
    applyVisitListingLook(bg, page, meta);
    applyVisitTitleColor(bg.querySelector("#libTitle"), meta);
    applyVisitSiteAccent(bg.querySelector(".book-card"), meta);
    for (let i = 1; i < targets.length; i++) {
        applyVisitListingLook(targets[i], targets[i], meta);
        applyVisitTitleColor(targets[i].querySelector("#libTitle"), meta);
        applyVisitSiteAccent(targets[i].querySelector(".book-card"), meta);
    }
}

export function paintPreviewBook(pane, { book, meta, expanded, editingSynopsis, editingNotes, lookTargets, listed }) {
    const titleEl = pane.querySelector("#libTitle");
    const authorEl = pane.querySelector("#libAuthor");
    const changeEl = pane.querySelector("#libCoverChange");
    const metaEl = pane.querySelector("#libMeta");
    const wideCheck = pane.querySelector("#libWideOn");
    const tagsEl = pane.querySelector("#libTags");
    const genreChips = pane.querySelector("#libGenreChips");
    const genreMenu = pane.querySelector("#libGenreMenu");
    const ratingEl = pane.querySelector("#libRating");
    const warnsEl = pane.querySelector("#libWarns");
    const synopsisEl = pane.querySelector("#libSynopsis");
    const synopsisEdit = pane.querySelector("#libSynopsisEdit");
    const synopsisFade = pane.querySelector("#libSynopsisFade");
    const notesEl = pane.querySelector("#libNotes");
    const notesEdit = pane.querySelector("#libNotesEdit");
    const tocEl = pane.querySelector("#libToc");
    const countEl = pane.querySelector("#libChapterCount");
    const editBtn = pane.querySelector("#libEditBtn");
    const hero = pane.querySelector("#libHero");
    const coverEl = pane.querySelector("#libCover");
    const listedOn = listed == null ? isLibraryListed(book) : Boolean(listed);
    const listing = listedOn ? localListingData(book) : null;
    const pubHref = book.id ? `/publish?book=${encodeURIComponent(book.id)}` : "/publish";
    pane.classList.toggle("is-listed", listedOn);

    if (titleEl) titleEl.value = book.title || "";
    if (authorEl) authorEl.value = meta.author || "";
    if (editBtn) {
        editBtn.href = pubHref;
        editBtn.hidden = false;
        editBtn.textContent = listedOn ? "Edit" : "Publish";
    }
    if (wideCheck) {
        wideCheck.checked = Boolean(meta.coverWideEnabled);
    }
    applyPreviewLook(lookTargets || [pane], meta, pane.querySelector(".book-page"));

    const ranked = listBodyChaptersWithDepth(book.sections);
    const byId = new Map(ranked.map((row) => [String(row.chapter.id), row]));
    const published = (meta.draftChapterIds || []).map((id) => byId.get(String(id))).filter(Boolean);
    if (metaEl) {
        metaEl.textContent = `${published.length} chapter${published.length === 1 ? "" : "s"} published`;
    }
    if (countEl) {
        countEl.textContent = `${published.length} chapter${published.length === 1 ? "" : "s"}`;
    }
    if (tocEl) {
        tocEl.innerHTML = published.length
            ? published.map((row, i) => `
                <div class="book-toc-row" style="--toc-depth:${row.depth}">
                    <span class="book-drag" aria-hidden="true">⠿</span>
                    <div class="book-toc-main">
                        <span class="book-ch-name">${escapeHtml(row.chapter.title || "Untitled")}</span>
                        <span class="book-ch-sub">Chapter ${i + 1}</span>
                    </div>
                </div>`).join("")
            : `<p class="book-reviews-empty">No chapters posted yet.</p>`;
    }

    if (genreChips) {
        genreChips.innerHTML = (meta.genres || []).map((key, ix) =>
            `<button type="button" class="book-tag" data-genre="${escapeHtml(key)}" data-role="${ix + 1}">${escapeHtml(genreLabel(key))}</button>`
        ).join("");
    }
    if (tagsEl) {
        const tags = (meta.tags || []).map((tag) =>
            `<span class="book-tag">${escapeHtml(tag)}<button type="button" data-remove-tag="${escapeHtml(tag)}" aria-label="Remove tag">×</button></span>`
        );
        tagsEl.innerHTML = tags.join("") +
            `<span class="book-tag add"><input id="libTagInput" placeholder="Add tag" /></span>`;
    }
    if (genreMenu) {
        const selected = meta.genres || [];
        const keys = matchingGenreKeys(pane._genreQuery || "").filter((key) => !selected.includes(key));
        genreMenu.innerHTML = keys.length
            ? keys.map((key) => `<button type="button" data-genre="${key}">${escapeHtml(genreLabel(key))}</button>`).join("")
            : `<p class="lib-field-hint">No matching genres.</p>`;
    }
    if (ratingEl) {
        ratingEl.innerHTML = RATINGS.map((item) =>
            `<button type="button" class="book-tag${meta.rating === item.id ? " is-on" : ""}" data-rating="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`
        ).join("");
    }
    if (warnsEl) {
        const on = new Set(meta.warnings || []);
        warnsEl.innerHTML = CONTENT_WARNINGS.map((item) =>
            `<button type="button" class="book-warn${on.has(item) ? " is-on" : ""}" data-preset="${escapeHtml(item)}"><span class="lbl">${escapeHtml(item)}</span></button>`
        ).join("");
    }
    if (synopsisEl) {
        synopsisEl.textContent = meta.synopsis || "No synopsis yet.";
        synopsisEl.classList.toggle("clipped", !expanded);
        synopsisEl.classList.toggle("hidden", editingSynopsis);
    }
    if (synopsisFade) synopsisFade.hidden = expanded || editingSynopsis;
    const more = pane.querySelector("#libSynopsisMore");
    if (more) {
        more.hidden = editingSynopsis;
        more.textContent = expanded ? "Show less" : "Show more";
    }
    if (synopsisEdit) {
        synopsisEdit.classList.toggle("hidden", !editingSynopsis);
        if (editingSynopsis) synopsisEdit.value = meta.synopsis || "";
    }
    if (notesEl) {
        notesEl.textContent = meta.notesAfter || "No notes yet.";
        notesEl.classList.toggle("hidden", editingNotes);
    }
    if (notesEdit) {
        notesEdit.classList.toggle("hidden", !editingNotes);
        if (editingNotes) notesEdit.value = meta.notesAfter || "";
    }

    const cta = pane.querySelector("#libCta");
    if (cta) {
        const first = published[0]?.chapter;
        cta.hidden = listedOn && !first;
        cta.textContent = listedOn && first
            ? `Start reading — ${first.title || "Chapter 1"} ›`
            : "Start reading ›";
    }

    const coverUrl = meta.cover_url || listing?.coverUrl || "";
    const heroMeta = {
        ...meta,
        coverWideEnabled: Boolean(meta.coverWideEnabled),
    };
    const paintGen = (pane._previewCoverPaint = (pane._previewCoverPaint || 0) + 1);
    void resolvePreviewCoverSrc(book.id, coverUrl, listedOn).then((src) => {
        if (pane._previewCoverPaint !== paintGen) return;
        paintBookHero(hero, coverEl, src, heroMeta, { allowPlaceholder: !listedOn });
        if (changeEl) changeEl.textContent = src ? "Change cover" : "Add cover";
    });
}

export function bindPreviewBook(pane, { saveMeta, paint, metaFromBook, openManage }) {
    const genreEl = pane.querySelector("#libGenres");
    const genreMenu = pane.querySelector("#libGenreMenu");
    const genreSearch = pane.querySelector("#libGenreSearch");
    pane._genreQuery = "";

    pane.addEventListener("click", (event) => {
        if (event.target.closest("#libManageBtn")) openManage();
    });
    pane.querySelector("#libTitle")?.addEventListener("change", (event) => {
        saveMeta({}, { title: event.target.value });
    });
    pane.querySelector("#libAuthor")?.addEventListener("change", (event) => {
        saveMeta({ author: event.target.value });
    });
    pane.querySelector("#libWideOn")?.addEventListener("change", (event) => {
        const { meta } = metaFromBook();
        const on = Boolean(event.target.checked);
        const img = pane.querySelector(".book-hero-art img, .book-cover img");
        const patch = {
            coverWideEnabled: on,
            coverWide: meta.coverWide || wideCropFromMeta(meta),
        };
        if (on && isFullCoverCrop(meta.coverCrop)) {
            patch.coverCrop = libraryCardCrop(img?.naturalWidth, img?.naturalHeight);
        }
        if (!on) patch.coverCrop = coverCropForImage(null, img?.naturalWidth, img?.naturalHeight);
        saveMeta(patch);
        paint();
    });
    pane.querySelector("#libGenreChips")?.addEventListener("click", (event) => {
        const genreBtn = event.target.closest("[data-genre]");
        if (!genreBtn) return;
        const genres = toggleGenreSelection(metaFromBook().meta.genres, genreBtn.dataset.genre);
        saveMeta({ genre: genres[0] || "", genres });
        paint();
    });
    pane.querySelector("#libTags")?.addEventListener("click", (event) => {
        const rm = event.target.closest("[data-remove-tag]");
        if (!rm) return;
        saveMeta({ tags: metaFromBook().meta.tags.filter((tag) => tag !== rm.dataset.removeTag) });
        paint();
    });
    pane.querySelector("#libTags")?.addEventListener("keydown", (event) => {
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
    genreEl?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-genre]");
        if (!btn) return;
        const genres = toggleGenreSelection(metaFromBook().meta.genres, btn.dataset.genre);
        saveMeta({ genre: genres[0] || "", genres });
        paint();
        if (genreMenu) genreMenu.hidden = true;
    });
    genreSearch?.addEventListener("input", (event) => {
        pane._genreQuery = event.target.value;
        paint();
        if (genreMenu) genreMenu.hidden = false;
    });
    genreSearch?.addEventListener("focus", () => {
        if (genreMenu) genreMenu.hidden = false;
    });
    document.addEventListener("click", (event) => {
        if (!genreEl || genreEl.contains(event.target)) return;
        if (genreMenu) genreMenu.hidden = true;
    });
    pane.querySelector("#libRating")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-rating]");
        if (!btn) return;
        saveMeta({ rating: btn.dataset.rating });
        paint();
    });
    pane.querySelector("#libWarns")?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-preset]");
        if (!btn) return;
        const { meta } = metaFromBook();
        saveMeta({ warnings: toggleContentWarning(meta.warnings, btn.dataset.preset) });
        paint();
    });
}
