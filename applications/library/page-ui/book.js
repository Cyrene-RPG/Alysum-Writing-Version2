import { supabase } from "@alysum/authentication/client.js";
import { resolveStudioSession } from "@alysum/desktop/studio-session.js";
import { fetchPublishedWork } from "@alysum/library/work.js";
import { cropFrameStyle, peekCoverSrc } from "@alysum/publishing/cover-upload.js";
import { genreLabel } from "@alysum/publishing/genres.js";
import { applyVisitListingLook } from "@alysum/site-appearance/js-runtime/visit-page-look.js";

const READ_KEY = "alysum:library:read-position";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function bookIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id") || "";
}

function readProgress(id) {
    try {
        const raw = JSON.parse(localStorage.getItem(READ_KEY) || "{}");
        const row = raw && typeof raw === "object" ? raw[id] : null;
        return row && typeof row === "object" ? row : null;
    } catch {
        return null;
    }
}

function readHref(id, chapterId) {
    const url = `/read?id=${encodeURIComponent(id)}`;
    return chapterId ? `${url}&chapter=${encodeURIComponent(chapterId)}` : url;
}

function publishHref(id) {
    return `/publish?book=${encodeURIComponent(id)}`;
}

function isOwner(work, session) {
    const uid = session?.user?.id;
    return Boolean(uid && work.ownerUserId && uid === work.ownerUserId);
}

function coverHtml(url, crop) {
    const src = peekCoverSrc(url);
    if (!src) return "";
    const style = cropFrameStyle(crop);
    const attr = style ? ` style="${style}"` : "";
    return `<img src="${escapeHtml(src)}" alt="" decoding="async"${attr} />`;
}

function showEmpty() {
    document.getElementById("bookPage").hidden = true;
    document.getElementById("bookEmpty").hidden = false;
}

function paintTags(work, owner) {
    const genres = work.genres || [];
    const tags = work.tags || [];
    const chips = [
        ...genres.map((key) => `<span class="book-tag">${escapeHtml(genreLabel(key))}</span>`),
        ...tags.map((tag) => `<span class="book-tag">${escapeHtml(tag)}</span>`),
    ];
    if (owner) {
        chips.push(`<a class="book-tag add" href="${publishHref(work.id)}">+ Add tag</a>`);
    }
    const el = document.getElementById("bookTags");
    const label = document.getElementById("tagsLabel");
    el.innerHTML = chips.join("");
    label.hidden = !chips.length;
}

function paintWarns(work, owner) {
    const warnings = work.warnings || [];
    const el = document.getElementById("bookWarns");
    const label = document.getElementById("warnsLabel");
    if (!warnings.length && !owner) {
        el.innerHTML = "";
        label.hidden = true;
        return;
    }
    label.hidden = false;
    el.innerHTML = warnings.map((item) =>
        `<span class="book-warn"><span class="lbl">${escapeHtml(item)}</span></span>`
    ).join("") + (owner ? `<a class="book-warn add" href="${publishHref(work.id)}">+ Add warning</a>` : "");
}

function paintChapters(work, owner, saved) {
    const chapters = work.chapters || [];
    const currentId = saved?.chapterId || "";
    const currentIx = chapters.findIndex((chapter) => chapter.id === currentId);
    document.getElementById("chapterCount").textContent =
        `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`;
    const hint = document.getElementById("tocHint");
    hint.hidden = !owner;
    const list = document.getElementById("chapterList");
    if (!chapters.length) {
        list.innerHTML = `<p class="book-reviews-empty">No chapters posted yet.</p>`;
        return;
    }
    if (owner) {
        list.innerHTML = chapters.map((chapter, index) => `
            <div class="book-toc-row">
                <span class="book-drag" aria-hidden="true">⠿</span>
                <div class="book-toc-main">
                    <span class="book-ch-name">${escapeHtml(chapter.title)}</span>
                    <span class="book-ch-sub">Chapter ${index + 1}</span>
                </div>
                <div class="book-toc-actions">
                    <a class="book-preview-btn" href="${readHref(work.id, chapter.id)}">Preview</a>
                    <a class="book-toc-rm" href="${publishHref(work.id)}" title="Manage listing">✕</a>
                </div>
            </div>`).join("");
        return;
    }
    list.innerHTML = chapters.map((chapter, index) => {
        const read = currentIx >= 0 && index < currentIx;
        const current = chapter.id === currentId;
        const state = current ? "current" : read ? "read" : "";
        const mark = current ? String(index + 1) : read ? "✓" : String(index + 1);
        const sub = current ? `Chapter ${index + 1} · reading now` : `Chapter ${index + 1}`;
        return `
            <a class="book-ch-row${current ? " current" : ""}" href="${readHref(work.id, chapter.id)}">
                <span class="book-ch-status ${state}">${mark}</span>
                <span class="book-ch-info">
                    <span class="book-ch-title">${escapeHtml(chapter.title)}</span>
                    <span class="book-ch-sub">${escapeHtml(sub)}</span>
                </span>
                <span class="book-ch-chevron" aria-hidden="true">›</span>
            </a>`;
    }).join("");
}

async function boot() {
    const id = bookIdFromUrl();
    const work = id ? await fetchPublishedWork(supabase, id) : null;
    if (!work) {
        showEmpty();
        return;
    }
    const session = await resolveStudioSession(supabase);
    const owner = isOwner(work, session);
    const saved = readProgress(work.id);
    const chapters = work.chapters || [];
    const current = chapters.find((chapter) => chapter.id === saved?.chapterId) || chapters[0];

    document.title = `${work.title || "Untitled"} — Alysum`;
    applyVisitListingLook(document.body, document.getElementById("bookPage"), work);
    document.getElementById("bookPage").hidden = false;
    document.getElementById("bookTitle").textContent = work.title || "Untitled";
    document.getElementById("bookAuthor").textContent = work.author || "Unknown";
    document.getElementById("bookMeta").textContent =
        `${chapters.length} chapter${chapters.length === 1 ? "" : "s"} published`;
    const complete = work.serializationStatus === "complete";
    document.getElementById("bookStatus").innerHTML =
        `<span class="book-status-dot${complete ? " is-done" : ""}"></span>${complete ? "Complete" : "Ongoing"}`;

    const hero = document.getElementById("bookHero");
    const cover = document.getElementById("bookCover");
    const wide = Boolean(work.coverWideEnabled && peekCoverSrc(work.coverUrl));
    hero.classList.toggle("is-wide", wide);
    hero.querySelector(".book-hero-art")?.remove();
    if (wide) {
        cover.hidden = true;
        cover.innerHTML = "";
        const img = coverHtml(work.coverUrl, null);
        hero.insertAdjacentHTML("afterbegin", `<div class="book-hero-art">${img}</div>`);
    } else {
        const img = coverHtml(work.coverUrl, work.coverCrop);
        cover.hidden = !img;
        cover.innerHTML = img;
        cover.classList.toggle("has-img", Boolean(img));
    }

    const pub = publishHref(work.id);
    ["editTitle", "editSynopsis", "addChapter"].forEach((nid) => {
        const el = document.getElementById(nid);
        if (!el) return;
        el.hidden = !owner;
        el.href = pub;
    });

    paintTags(work, owner);
    paintWarns(work, owner);

    const synopsis = document.getElementById("bookSynopsis");
    const text = String(work.summary || "").trim() || "No synopsis yet.";
    synopsis.textContent = text;
    const more = document.getElementById("synopsisMore");
    const fade = document.getElementById("synopsisFade");
    requestAnimationFrame(() => {
        const overflow = synopsis.scrollHeight > 120;
        more.hidden = !overflow;
        fade.hidden = !overflow;
    });
    more.addEventListener("click", () => {
        const open = synopsis.classList.toggle("clipped");
        more.textContent = open ? "Show more" : "Show less";
        fade.hidden = !open;
    });

    const cta = document.getElementById("readCta");
    const cap = document.getElementById("readCaption");
    if (!chapters.length) {
        cta.hidden = true;
        cap.hidden = true;
    } else if (saved?.chapterId && current) {
        cta.textContent = `Continue reading — ${current.title} ›`;
        cta.href = readHref(work.id, current.id);
        const pct = Math.round(Number(saved.progress) || 0);
        cap.hidden = !pct;
        cap.textContent = pct ? `${pct}% through this book` : "";
    } else {
        cta.textContent = "Start reading ›";
        cta.href = readHref(work.id, chapters[0].id);
        cap.hidden = true;
    }

    paintChapters(work, owner, saved);

    const score = Number(work.ratingScore) || 0;
    const scoreEl = document.getElementById("reviewScore");
    if (score) {
        scoreEl.hidden = false;
        scoreEl.textContent = score.toFixed(1);
    }
}

boot();
