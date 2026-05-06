/**
 * Novel exporter — loads the same Firestore document as editor.html (`users/{uid}/books/{bookId}`).
 */
import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const bookId = params.get("book");

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function safeNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function generateId() {
    return "ch_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function normalizeChapter(raw, fallbackTitle = "Untitled") {
    const chapter = safeObject(raw, {});
    return {
        id: safeString(chapter.id, generateId()),
        title: safeString(chapter.title, fallbackTitle),
        content: safeString(chapter.content, "")
    };
}

function normalizeSections(rawSections) {
    const sections = safeObject(rawSections, {});
    const frontRaw = safeArray(sections.front, []);
    const bodyRaw = safeArray(sections.body, []);
    const backRaw = safeArray(sections.back, []);

    const front = frontRaw.length
        ? frontRaw.map((ch, index) =>
              normalizeChapter(ch, index === 0 ? "Copyright" : "Table of Contents")
          )
        : [
              { id: generateId(), title: "Copyright", content: "" },
              { id: generateId(), title: "Table of Contents", content: "" }
          ];

    const body = bodyRaw.length
        ? bodyRaw.map((ch, index) => normalizeChapter(ch, `Chapter ${index + 1}`))
        : [{ id: generateId(), title: "Chapter 1", content: "" }];

    const back = backRaw.map((ch, index) => normalizeChapter(ch, `Back Matter ${index + 1}`));

    return { front, body, back };
}

function normalizeBookData(rawData) {
    const data = safeObject(rawData, {});
    return {
        title: safeString(data.title, "Untitled Book"),
        sections: normalizeSections(data.sections),
        words: safeNumber(data.words, 0),
        updated: safeNumber(data.updated, Date.now())
    };
}

function ensureChapterIds(list) {
    list.forEach(ch => {
        if (!ch.id) ch.id = generateId();
    });
}

function ensureStructure(book) {
    if (!book.sections || typeof book.sections !== "object") {
        book.sections = {};
    }
    if (!Array.isArray(book.sections.front)) {
        book.sections.front = [
            { id: generateId(), title: "Copyright", content: "" },
            { id: generateId(), title: "Table of Contents", content: "" }
        ];
    }
    if (!Array.isArray(book.sections.body) || book.sections.body.length === 0) {
        book.sections.body = [{ id: generateId(), title: "Chapter 1", content: "" }];
    }
    if (!Array.isArray(book.sections.back)) {
        book.sections.back = [];
    }
    ensureChapterIds(book.sections.front);
    ensureChapterIds(book.sections.body);
    ensureChapterIds(book.sections.back);
}

function escapeHtml(str) {
    return safeString(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function allChaptersFlat(book) {
    if (!book) return [];
    return [
        ...book.sections.front.map((ch, i) => ({ section: "front", index: i, ...ch })),
        ...book.sections.body.map((ch, i) => ({ section: "body", index: i, ...ch })),
        ...book.sections.back.map((ch, i) => ({ section: "back", index: i, ...ch }))
    ];
}

function normalizeAtName(raw) {
    const v = safeString(raw, "").trim();
    if (!v) return "";
    return v.startsWith("@") ? v : `@${v}`;
}

/**
 * Same normalization as pdf-editor: editor HTML (mostly div + br) → paragraphs for reading.
 */
function normalizeDomBlocks(container, doc) {
    const nodes = [...container.childNodes];
    for (const node of nodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = /** @type {Element} */ (node);
        const tag = el.tagName.toUpperCase();
        if (tag === "SCRIPT" || tag === "STYLE") continue;
        if (["P", "UL", "OL", "BLOCKQUOTE", "TABLE", "H1", "H2", "H3", "H4", "HR", "PRE"].includes(tag)) {
            if (tag === "P" && !el.classList.contains("ne-ms-para")) el.classList.add("ne-ms-para");
            normalizeDomBlocks(el, doc);
            continue;
        }
        if (tag === "DIV") {
            if (el.querySelector("p, div, ul, ol, blockquote, h1, h2, h3, table")) {
                normalizeDomBlocks(el, doc);
                continue;
            }
            const inner = el.innerHTML;
            if (!/<br\s*\/?>/i.test(inner)) {
                const p = doc.createElement("p");
                p.className = "ne-ms-para";
                while (el.firstChild) p.appendChild(el.firstChild);
                el.replaceWith(p);
                continue;
            }
            const parts = inner.split(/<br\s*\/?>/gi);
            const frag = doc.createDocumentFragment();
            for (const part of parts) {
                const stripped = part.replace(/&nbsp;/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
                if (!part.trim() || !stripped) continue;
                const p = doc.createElement("p");
                p.className = "ne-ms-para";
                p.innerHTML = part.trim();
                frag.appendChild(p);
            }
            if (!frag.childNodes.length) {
                const p = doc.createElement("p");
                p.className = "ne-ms-para";
                el.replaceWith(p);
            } else {
                el.replaceWith(frag);
            }
        }
    }
}

function normalizeChapterBodyHtml(html) {
    const raw = String(html || "").trim();
    if (!raw) return '<p class="ne-ms-para"></p>';
    try {
        const doc = new DOMParser().parseFromString(`<div id="alysum-ne-norm">${raw}</div>`, "text/html");
        const root = doc.getElementById("alysum-ne-norm");
        if (!root) return `<p class="ne-ms-para">${escapeHtml(raw)}</p>`;
        normalizeDomBlocks(root, root.ownerDocument);
        return root.innerHTML;
    } catch (e) {
        console.warn("normalizeChapterBodyHtml", e);
        return `<p class="ne-ms-para">${escapeHtml(raw)}</p>`;
    }
}

function currentPreviewInputs() {
    const title = safeString(document.getElementById("neBookTitleInput")?.value, "").trim();
    const pen = normalizeAtName(safeString(document.getElementById("neAuthorUsernameInput")?.value, "").trim());

    return {
        title,
        pen,
        cp: {
            year: safeString(document.getElementById("neCpYear")?.value, "").trim(),
            holder: safeString(document.getElementById("neCpHolderName")?.value, "").trim(),
            contact: safeString(document.getElementById("neCpContact")?.value, "").trim(),
            editionYear: safeString(document.getElementById("neCpEditionYear")?.value, "").trim(),
            imprint: safeString(document.getElementById("neCpImprint")?.value, "").trim(),
            publisherLocation: safeString(document.getElementById("neCpPublisherLoc")?.value, "").trim(),
            isbn: safeString(document.getElementById("neCpIsbn")?.value, "").trim(),
            coverDesignBy: safeString(document.getElementById("neCpCoverDesign")?.value, "").trim(),
            editingBy: safeString(document.getElementById("neCpEditingBy")?.value, "").trim(),
            printedIn: safeString(document.getElementById("neCpPrintedIn")?.value, "").trim(),
            optionalOn: Boolean(document.getElementById("neCpOptionalInclude")?.checked),
            optionalText: safeString(document.getElementById("neCpOptional")?.value, "").trim()
        }
    };
}

function titlePageHtml(title, pen) {
    const t = escapeHtml(title || "Untitled");
    const penClean = safeString(pen, "").replace(/^@/, "").trim();
    const authorLine = penClean
        ? `<p class="ne-preview-title-author">${escapeHtml(penClean)}</p>`
        : `<p class="ne-preview-title-author">&nbsp;</p>`;

    return (
        `<div class="ne-preview-page-frame ne-preview-page-title">` +
        `${authorLine}` +
        `<div class="ne-preview-title-rule" aria-hidden="true"></div>` +
        `<h1 class="ne-preview-title-work">${t}</h1>` +
        `</div>`
    );
}

function copyrightPageHtml(cp) {
    const year = escapeHtml(cp.year || "");
    const holder = escapeHtml(cp.holder || "");
    const contact = escapeHtml(cp.contact || "");
    const edition = escapeHtml(cp.editionYear || "");
    const imprint = escapeHtml(cp.imprint || "");
    const loc = escapeHtml(cp.publisherLocation || "");
    const isbn = escapeHtml(cp.isbn || "");
    const cover = escapeHtml(cp.coverDesignBy || "");
    const editing = escapeHtml(cp.editingBy || "");
    const printed = escapeHtml(cp.printedIn || "");
    const opt = cp.optionalOn ? escapeHtml(cp.optionalText || "") : "";

    const blocks = [];
    const firstLine = `Copyright © ${year || "____"}${holder ? ` by ${holder}` : ""}`;
    blocks.push(`<p>${firstLine}</p>`);
    blocks.push(`<p>All rights reserved.</p>`);
    blocks.push(
        `<p>No part of this publication may be reproduced, distributed, stored in a retrieval system, or transmitted in any form or by any means—electronic, mechanical, photocopying, recording, scanning, or otherwise—without the prior written permission of the publisher or copyright owner, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.</p>`
    );
    blocks.push(
        `<p>This is a work of fiction. Names, characters, businesses, organizations, places, events, and incidents are either the product of the author’s imagination or used fictitiously. Any resemblance to actual persons, living or dead, or actual events is purely coincidental.</p>`
    );
    if (contact) blocks.push(`<p>For permissions, rights, or licensing requests: ${contact}</p>`);
    if (edition) blocks.push(`<p>First Edition: ${edition}</p>`);
    if (imprint) blocks.push(`<p>Published by ${imprint}</p>`);
    if (loc) blocks.push(`<p>${loc}</p>`);
    if (isbn) blocks.push(`<p>ISBN: ${isbn}</p>`);
    if (cover) blocks.push(`<p>Cover design by: ${cover}</p>`);
    if (editing) blocks.push(`<p>Editing by: ${editing}</p>`);
    if (printed) blocks.push(`<p>Printed in ${printed}</p>`);
    if (opt) blocks.push(`<p>${opt.replace(/\n+/g, "<br>")}</p>`);

    return `<div class="ne-preview-page-frame ne-preview-page-copyright">${blocks.join("")}</div>`;
}

function tocPageHtml(book, firstChapterPageNumber) {
    const chapters = (book.sections?.body || []).map((ch, i) => ({
        label: safeString(ch.title, "").trim() || `Chapter ${i + 1}`
    }));
    const rows = chapters
        .map((e, idx) => {
            const pageNum = firstChapterPageNumber + idx;
            return (
                `<li class="ne-preview-toc-row">` +
                `<span>${escapeHtml(e.label)}</span>` +
                `<span class="ne-preview-toc-dots" aria-hidden="true"></span>` +
                `<span>${escapeHtml(String(pageNum))}</span>` +
                `</li>`
            );
        })
        .join("");

    return (
        `<div class="ne-preview-page-frame ne-preview-page-toc">` +
        `<h2 class="ne-preview-toc-title">Contents</h2>` +
        `<ol class="ne-preview-toc-list">${rows || "<li>—</li>"}</ol>` +
        `</div>`
    );
}

function chapterPageHtml(ch) {
    const title = escapeHtml(ch.title || "Untitled");
    const body = normalizeChapterBodyHtml(ch.content);
    return (
        `<div class="ne-preview-page-frame ne-preview-manuscript">` +
        `<section class="ne-ms-ch" data-section="${escapeHtml(ch.section || "")}">` +
        `<h2 class="ne-ms-ch-title">${title}</h2>` +
        `<div class="ne-ms-ch-body">${body}</div>` +
        `</section>` +
        `</div>`
    );
}

function buildManuscriptPreviewHtml(book) {
    const parts = [];
    for (const ch of allChaptersFlat(book)) {
        const title = escapeHtml(ch.title || "Untitled");
        const body = normalizeChapterBodyHtml(ch.content);
        const sec = escapeHtml(ch.section || "");
        parts.push(
            `<section class="ne-ms-ch" data-section="${sec}">` +
                `<h2 class="ne-ms-ch-title">${title}</h2>` +
                `<div class="ne-ms-ch-body">${body}</div>` +
                `</section>`
        );
    }
    return parts.join("");
}

function wireBackLink() {
    const a = document.getElementById("neBackLink");
    if (!a) return;
    if (bookId) {
        a.href = "/editor.html?book=" + encodeURIComponent(bookId);
    } else {
        a.href = "/studio.html";
    }
}

function setPreviewPlaceholder(visible, text) {
    const ph = document.getElementById("nePreviewPlaceholder");
    const sc = document.getElementById("nePreviewScroll");
    if (!ph || !sc) return;
    if (visible) {
        ph.hidden = false;
        ph.textContent = text;
        sc.hidden = true;
    } else {
        ph.hidden = true;
        sc.hidden = false;
    }
}

let loadedBook = null;
let previewPages = [];
let previewIndex = 0;

function buildPreviewPages(book) {
    const inputs = currentPreviewInputs();
    const title = inputs.title || safeString(book.title, "Untitled Book");
    const pen = inputs.pen;

    const pages = [];
    pages.push({ kind: "title", label: "Title page", html: titlePageHtml(title, pen) });
    pages.push({ kind: "copyright", label: "Copyright", html: copyrightPageHtml(inputs.cp) });

    const tocIndex = pages.length;
    pages.push({ kind: "toc", label: "Contents", html: "" });

    const firstChapterPageNumber = pages.length + 1; // 1-based
    pages[tocIndex].html = tocPageHtml(book, firstChapterPageNumber);

    const chapters = allChaptersFlat(book).filter(ch => ch.section === "body");
    chapters.forEach((ch, i) => {
        pages.push({ kind: "chapter", label: ch.title || `Chapter ${i + 1}`, html: chapterPageHtml(ch) });
    });

    return pages;
}

function updatePagerUi() {
    const prev = document.getElementById("nePrevPageBtn");
    const next = document.getElementById("neNextPageBtn");
    const status = document.getElementById("nePageStatus");
    if (!prev || !next || !status) return;
    const total = previewPages.length;
    const n = total ? previewIndex + 1 : 0;
    status.textContent = total ? `Page ${n} / ${total}` : "—";
    prev.disabled = previewIndex <= 0;
    next.disabled = total === 0 || previewIndex >= total - 1;
}

function renderCurrentPreviewPage() {
    const sc = document.getElementById("nePreviewScroll");
    if (!sc) return;

    if (!loadedBook) {
        setPreviewPlaceholder(true, bookId ? "Loading manuscript…" : "Open a book to preview.");
        previewPages = [];
        previewIndex = 0;
        updatePagerUi();
        return;
    }

    previewPages = buildPreviewPages(loadedBook);
    if (previewIndex < 0) previewIndex = 0;
    if (previewIndex >= previewPages.length) previewIndex = Math.max(0, previewPages.length - 1);

    const page = previewPages[previewIndex];
    sc.innerHTML = page ? page.html : "";
    setPreviewPlaceholder(false, "");
    updatePagerUi();
}

function fillTitleAndPenFromBook(book, authorLine) {
    const titleIn = document.getElementById("neBookTitleInput");
    const penIn = document.getElementById("neAuthorUsernameInput");
    if (titleIn && !titleIn.dataset.neTouched) {
        titleIn.value = book.title || "";
    }
    if (penIn && !penIn.dataset.neTouched) {
        const v = safeString(authorLine, "").trim();
        penIn.value = normalizeAtName(v);
    }
}

function updateExporterUsername(authorDisplay) {
    const el = document.getElementById("exporterUsername");
    if (!el) return;
    const raw = safeString(authorDisplay, "").trim();
    el.textContent = raw ? (raw.startsWith("@") ? raw : `@${raw}`) : "@reader";
}

async function fetchAuthorDisplay(uid) {
    try {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
            const u = userSnap.data();
            return (
                safeString(u.username, "").trim() ||
                safeString(u.displayName, "").trim() ||
                safeString(u.name, "").trim() ||
                safeString(u.penName, "").trim()
            );
        }
    } catch (_) {
        /* ignore */
    }
    if (auth.currentUser?.displayName) {
        return String(auth.currentUser.displayName).trim();
    }
    return "";
}

async function loadBookForPreview(uid) {
    const authorDisplay = await fetchAuthorDisplay(uid);
    updateExporterUsername(authorDisplay);

    if (!bookId) {
        setPreviewPlaceholder(true, "Add ?book=… or open Export from the editor to preview a manuscript here.");
        return;
    }

    setPreviewPlaceholder(true, "Loading manuscript…");
    loadedBook = null;
    renderCurrentPreviewPage();

    try {
        const snap = await getDoc(doc(db, "users", uid, "books", bookId));

        if (!snap.exists()) {
            setPreviewPlaceholder(true, "This book was not found, or you do not have access.");
            const titleIn = document.getElementById("neBookTitleInput");
            if (titleIn) titleIn.value = "";
            loadedBook = null;
            renderCurrentPreviewPage();
            return;
        }

        const book = normalizeBookData(snap.data());
        ensureStructure(book);
        fillTitleAndPenFromBook(book, authorDisplay);
        loadedBook = book;
        previewIndex = 0;
        renderCurrentPreviewPage();
    } catch (err) {
        console.error(err);
        const code = err && typeof err === "object" && "code" in err ? err.code : "";
        let msg = "Could not load this book.";
        if (code === "permission-denied") {
            msg = "No permission to read this book.";
        }
        setPreviewPlaceholder(true, msg);
        loadedBook = null;
        renderCurrentPreviewPage();
    }
}

function initLayoutControls() {
    const cb = document.getElementById("neCpOptionalInclude");
    const ta = document.getElementById("neCpOptional");
    if (cb && ta) {
        function syncOptionalAdvisory() {
            ta.disabled = !cb.checked;
        }
        cb.addEventListener("change", syncOptionalAdvisory);
        syncOptionalAdvisory();
    }

    const workspace = document.querySelector(".ne-workspace");
    const preview = document.getElementById("pdfPreviewMount");
    const radios = document.querySelectorAll('input[name="nePageFormat"]');
    const layoutAttrs = [
        "data-margin-top-in",
        "data-margin-bottom-in",
        "data-margin-outer-in",
        "data-margin-inner-in",
        "data-bleed-in"
    ];
    const toggleBtn = document.getElementById("neTogglePrintGuides");
    const handRadios = document.querySelectorAll('input[name="nePageHand"]');

    function clearLayoutMarginsBleed() {
        if (!preview) return;
        layoutAttrs.forEach(function (a) {
            preview.removeAttribute(a);
        });
    }

    function setGuideVars(pw, ph, opts) {
        if (!preview) return;
        var bleed = opts.bleed != null ? opts.bleed : 0;
        preview.style.setProperty("--guide-pgw", String(pw));
        preview.style.setProperty("--guide-pgh", String(ph));
        preview.style.setProperty("--guide-bleed", String(bleed));
        preview.style.setProperty("--guide-mt", String(opts.mt));
        preview.style.setProperty("--guide-mb", String(opts.mb));
        preview.style.setProperty("--guide-mi", String(opts.mi));
        preview.style.setProperty("--guide-mo", String(opts.mo));
        preview.classList.toggle("ne-print-guides-no-bleed", bleed <= 0);
    }

    function applyGuideMeasurements() {
        if (!preview) return;
        var fmt = preview.getAttribute("data-format");
        if (fmt === "6x9") {
            setGuideVars(6, 9, {
                bleed: 0.125,
                mt: 0.5,
                mb: 0.5,
                mi: 0.75,
                mo: 0.5
            });
        } else if (fmt === "5x8") {
            setGuideVars(5, 8, {
                bleed: 0.125,
                mt: 0.5,
                mb: 0.5,
                mi: 0.75,
                mo: 0.5
            });
        } else if (fmt === "letter") {
            setGuideVars(8.5, 11, {
                bleed: 0,
                mt: 0.5,
                mb: 0.5,
                mi: 0.5,
                mo: 0.5
            });
        } else {
            setGuideVars(5, 8, {
                bleed: 0.125,
                mt: 0.5,
                mb: 0.5,
                mi: 0.75,
                mo: 0.5
            });
        }
    }

    function applyPageFormat(value) {
        if (!preview) return;
        clearLayoutMarginsBleed();

        if (value === "letter") {
            preview.setAttribute("data-format", "letter");
            preview.setAttribute("data-page-width-in", "8.5");
            preview.setAttribute("data-page-height-in", "11");
        } else if (value === "6x9") {
            preview.setAttribute("data-format", "6x9");
            preview.setAttribute("data-page-width-in", "6");
            preview.setAttribute("data-page-height-in", "9");
            preview.setAttribute("data-margin-top-in", "0.5");
            preview.setAttribute("data-margin-bottom-in", "0.5");
            preview.setAttribute("data-margin-outer-in", "0.5");
            preview.setAttribute("data-margin-inner-in", "0.75");
            preview.setAttribute("data-bleed-in", "0.125");
        } else {
            preview.setAttribute("data-format", "5x8");
            preview.setAttribute("data-page-width-in", "5");
            preview.setAttribute("data-page-height-in", "8");
            preview.setAttribute("data-margin-top-in", "0.5");
            preview.setAttribute("data-margin-bottom-in", "0.5");
            preview.setAttribute("data-margin-outer-in", "0.5");
            preview.setAttribute("data-margin-inner-in", "0.75");
            preview.setAttribute("data-bleed-in", "0.125");
        }
        applyGuideMeasurements();
    }

    function applyPageHand(value) {
        if (!preview) return;
        var verso = value === "verso";
        preview.setAttribute("data-page-hand", verso ? "verso" : "recto");
        preview.classList.toggle("ne-preview-page--verso", verso);
    }

    if (preview && radios.length) {
        radios.forEach(function (el) {
            el.addEventListener("change", function () {
                if (el.checked) applyPageFormat(el.value);
            });
        });
        var picked = document.querySelector('input[name="nePageFormat"]:checked');
        if (picked) applyPageFormat(picked.value);
        else applyGuideMeasurements();
    }

    if (preview && handRadios.length) {
        handRadios.forEach(function (el) {
            el.addEventListener("change", function () {
                if (el.checked) applyPageHand(el.value);
            });
        });
        var handPicked = document.querySelector('input[name="nePageHand"]:checked');
        if (handPicked) applyPageHand(handPicked.value);
    }

    if (workspace && toggleBtn && preview) {
        var guidesLayer = preview.querySelector(".ne-preview-print-guides");

        function syncGuideOverlayVisibility() {
            var on = toggleBtn.getAttribute("aria-pressed") === "true";
            workspace.classList.toggle("ne-print-guides-on", on);
            if (guidesLayer) {
                guidesLayer.setAttribute("aria-hidden", on ? "false" : "true");
            }
        }

        toggleBtn.addEventListener("click", function () {
            var on = toggleBtn.getAttribute("aria-pressed") !== "true";
            toggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
            syncGuideOverlayVisibility();
        });
        syncGuideOverlayVisibility();
    }

    var newPageBtn = document.getElementById("neChapterNewPageEach");
    var dropCapBtn = document.getElementById("neChapterDropCap");

    function bindPreviewFlagToggle(btn, dataAttr) {
        if (!preview || !btn) return;
        function sync() {
            var on = btn.getAttribute("aria-pressed") === "true";
            preview.setAttribute(dataAttr, on ? "true" : "false");
        }
        btn.addEventListener("click", function () {
            var on = btn.getAttribute("aria-pressed") !== "true";
            btn.setAttribute("aria-pressed", on ? "true" : "false");
            sync();
        });
        sync();
    }

    bindPreviewFlagToggle(newPageBtn, "data-chapter-new-page");
    bindPreviewFlagToggle(dropCapBtn, "data-chapter-drop-cap");
}

function wireTitlePenGuards() {
    const titleIn = document.getElementById("neBookTitleInput");
    const penIn = document.getElementById("neAuthorUsernameInput");
    const mark = el => {
        if (el) el.dataset.neTouched = "1";
    };
    titleIn?.addEventListener("input", () => mark(titleIn));
    penIn?.addEventListener("input", () => mark(penIn));
}

function wirePreviewPager() {
    const prev = document.getElementById("nePrevPageBtn");
    const next = document.getElementById("neNextPageBtn");
    prev?.addEventListener("click", () => {
        previewIndex = Math.max(0, previewIndex - 1);
        renderCurrentPreviewPage();
    });
    next?.addEventListener("click", () => {
        previewIndex = Math.min(Math.max(0, previewPages.length - 1), previewIndex + 1);
        renderCurrentPreviewPage();
    });
    updatePagerUi();
}

function wirePreviewLiveInputs() {
    const ids = [
        "neBookTitleInput",
        "neAuthorUsernameInput",
        "neCpYear",
        "neCpHolderName",
        "neCpContact",
        "neCpEditionYear",
        "neCpImprint",
        "neCpPublisherLoc",
        "neCpIsbn",
        "neCpCoverDesign",
        "neCpEditingBy",
        "neCpPrintedIn",
        "neCpOptionalInclude",
        "neCpOptional"
    ];
    const handler = () => {
        if (!loadedBook) return;
        renderCurrentPreviewPage();
    };
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", handler);
        el.addEventListener("change", handler);
    });
}

function init() {
    wireBackLink();
    initLayoutControls();
    wireTitlePenGuards();
    wirePreviewPager();
    wirePreviewLiveInputs();

    if (!bookId) {
        setPreviewPlaceholder(true, "Add ?book=… or open Export from the editor to preview a manuscript here.");
        onAuthStateChanged(auth, async user => {
            if (user) {
                const ad = await fetchAuthorDisplay(user.uid);
                updateExporterUsername(ad);
            } else {
                updateExporterUsername("");
            }
        });
        loadedBook = null;
        previewPages = [];
        previewIndex = 0;
        updatePagerUi();
        return;
    }

    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.href = "/login.html";
            return;
        }
        loadBookForPreview(user.uid);
    });
}

init();
