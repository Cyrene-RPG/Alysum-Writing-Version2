import { listBodyChaptersWithDepth } from "@alysum/writing-engine/manuscript.js?v=6";
import { genreLabel, matchingGenreKeys, toggleGenreSelection } from "@alysum/publishing/genres.js";
import { CONTENT_WARNINGS, RATINGS } from "@alysum/publishing/publish-meta.js";
import { bindBookLookPicker, paintBookLookPicker } from "@alysum/site-appearance/js-runtime/book-look-picker.js";
import { applyVisitBookLook, applyVisitPageBackground } from "@alysum/site-appearance/js-runtime/visit-page-look.js";
import { paintBookHero, resolvePreviewCoverSrc, wideCropFromMeta } from "./cover.js?v=3";

export function previewBookHtml() {
    return `
        <div class="lib-banner">
            <div class="lib-banner-copy">
                <p class="lib-banner-kicker">Library preview</p>
                <p>This is the book page readers see. Edit it here, then publish.</p>
            </div>
            <div class="lib-banner-actions">
                <a class="lib-publish-btn" id="libPublishBtn" href="/publish">Continue to publish</a>
            </div>
        </div>
        <div class="lib-look-panel">
            <div class="lib-look-block">
                <p class="lib-look-kicker">Listing theme</p>
                <div data-book-look-swatches class="book-look-swatches"></div>
                <button type="button" class="lib-look-reset" data-book-look-reset>Reset</button>
            </div>
            <div class="lib-look-block">
                <p class="lib-look-kicker">Page background</p>
                <div data-book-bg-chips class="book-look-bg-chips"></div>
                <div data-book-bg-custom hidden>
                    <input type="color" data-book-bg-color value="#0b1220" />
                </div>
                <button type="button" class="lib-look-reset" data-book-bg-reset>Reset</button>
            </div>
        </div>
        <div class="book-page">
            <article class="book-card panel">
                <header class="book-hero" id="libHero">
                    <div class="book-hero-top">
                        <span class="book-back">‹ Library</span>
                        <button type="button" class="book-status" id="libCoverChange">Change cover</button>
                    </div>
                    <div class="book-hero-bottom">
                        <button type="button" class="book-cover" id="libCover" aria-label="Upload cover"></button>
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
                    <p class="book-label">Genres &amp; tags</p>
                    <div class="book-tags" id="libTags"></div>
                    <div class="lib-genre-picker" id="libGenres">
                        <input id="libGenreSearch" type="search" placeholder="Search genres…" autocomplete="off" />
                        <div class="lib-genre-menu" id="libGenreMenu" hidden></div>
                    </div>
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
        <input type="file" accept="image/*" class="lib-cover-file" id="libCoverFile" hidden />
    `;
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function applyPreviewLook(targets, meta, pageEl) {
    for (const el of targets) applyVisitPageBackground(el, meta?.pageBgId, meta?.pageBg);
    applyVisitBookLook(pageEl, meta);
}

export function paintPreviewBook(pane, { book, meta, expanded, editingSynopsis, lookTargets }) {
    const titleEl = pane.querySelector("#libTitle");
    const authorEl = pane.querySelector("#libAuthor");
    const changeEl = pane.querySelector("#libCoverChange");
    const metaEl = pane.querySelector("#libMeta");
    const wideCheck = pane.querySelector("#libWideOn");
    const tagsEl = pane.querySelector("#libTags");
    const genreMenu = pane.querySelector("#libGenreMenu");
    const ratingEl = pane.querySelector("#libRating");
    const warnsEl = pane.querySelector("#libWarns");
    const synopsisEl = pane.querySelector("#libSynopsis");
    const synopsisEdit = pane.querySelector("#libSynopsisEdit");
    const synopsisFade = pane.querySelector("#libSynopsisFade");
    const tocEl = pane.querySelector("#libToc");
    const countEl = pane.querySelector("#libChapterCount");
    const publishBtn = pane.querySelector("#libPublishBtn");
    const hero = pane.querySelector("#libHero");
    const coverEl = pane.querySelector("#libCover");

    if (titleEl) titleEl.value = book.title || "";
    if (authorEl) authorEl.value = meta.author || "";
    if (publishBtn && book.id) {
        publishBtn.href = `/publish?book=${encodeURIComponent(book.id)}`;
    }
    if (wideCheck) wideCheck.checked = Boolean(meta.coverWideEnabled);
    paintBookLookPicker(pane, meta);
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

    if (tagsEl) {
        const genres = (meta.genres || []).map((key, ix) =>
            `<button type="button" class="book-tag" data-genre="${escapeHtml(key)}" data-role="${ix + 1}">${escapeHtml(genreLabel(key))}</button>`
        );
        const tags = (meta.tags || []).map((tag) =>
            `<span class="book-tag">${escapeHtml(tag)}<button type="button" data-remove-tag="${escapeHtml(tag)}" aria-label="Remove tag">×</button></span>`
        );
        tagsEl.innerHTML = [...genres, ...tags].join("") +
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

    void resolvePreviewCoverSrc(book.id, meta.cover_url).then((src) => {
        paintBookHero(hero, coverEl, src, meta);
        if (changeEl) changeEl.textContent = src ? "Change cover" : "Add cover";
    });
}

export function bindPreviewBook(pane, { saveMeta, paint, metaFromBook, openManage }) {
    const genreEl = pane.querySelector("#libGenres");
    const genreMenu = pane.querySelector("#libGenreMenu");
    const genreSearch = pane.querySelector("#libGenreSearch");
    pane._genreQuery = "";

    const openCoverPicker = () => pane.querySelector("#libCoverFile")?.click();
    pane.querySelector("#libCover")?.addEventListener("click", openCoverPicker);
    pane.querySelector("#libCoverChange")?.addEventListener("click", openCoverPicker);
    pane.addEventListener("click", (event) => {
        if (event.target.closest("#libHeroArt")) openCoverPicker();
        if (event.target.closest("#libManageBtn")) openManage();
    });
    pane.querySelector("#libTitle")?.addEventListener("change", (event) => {
        saveMeta({}, { title: event.target.value });
    });
    pane.querySelector("#libAuthor")?.addEventListener("change", (event) => {
        saveMeta({ author: event.target.value });
    });
    bindBookLookPicker(pane, {
        onChange(look) {
            saveMeta({
                pageLook: look.pageLook,
                pageLookSaved: look.pageLookSaved,
                pageBgId: look.pageBgId,
                pageBg: look.pageBg,
            });
            paint();
        },
    });
    pane.querySelector("#libWideOn")?.addEventListener("change", (event) => {
        const { meta } = metaFromBook();
        saveMeta({
            coverWideEnabled: Boolean(event.target.checked),
            coverWide: meta.coverWide || wideCropFromMeta(meta),
        });
        paint();
    });
    pane.querySelector("#libTags")?.addEventListener("click", (event) => {
        const genreBtn = event.target.closest("[data-genre]");
        if (genreBtn) {
            const genres = toggleGenreSelection(metaFromBook().meta.genres, genreBtn.dataset.genre);
            saveMeta({ genre: genres[0] || "", genres });
            paint();
            return;
        }
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
        const next = meta.warnings.includes(btn.dataset.preset)
            ? meta.warnings.filter((item) => item !== btn.dataset.preset)
            : [...meta.warnings, btn.dataset.preset];
        saveMeta({ warnings: next });
        paint();
    });
}
