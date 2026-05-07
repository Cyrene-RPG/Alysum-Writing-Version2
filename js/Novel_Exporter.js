/**
 * Novel exporter — loads the same Firestore document as editor.html (`users/{uid}/books/{bookId}`).
 */
import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const bookId = params.get("book");

/** Only stacks exposed in `Novel_Exporter.html` selects — used for preview `style` and coercion. */
const NE_FONT_WHITELIST = new Set([
    "Georgia, 'Times New Roman', Times, serif",
    "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
    "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
    "'Lora', Georgia, 'Times New Roman', serif",
    "'Cormorant Garamond', 'Palatino Linotype', Palatino, serif",
    "'Playfair Display', Georgia, 'Times New Roman', serif"
]);

function coerceFontStack(value) {
    const s = safeString(value, "");
    return NE_FONT_WHITELIST.has(s) ? s : "Georgia, 'Times New Roman', Times, serif";
}

/** Typography panel — body (preview chapter “match body”). */
const NE_TYPO_BODY_WHITELIST = new Set([
    "Georgia, 'Times New Roman', Times, serif",
    "'Palatino Linotype', Palatino Linotype, Palatino, 'Book Antiqua', serif",
    "'Times New Roman', Times, serif",
    "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
    "Baskerville, 'Baskerville Old Face', Garamond, serif",
    "system-ui, -apple-system, 'Segoe UI', sans-serif"
]);

const NE_TYPO_CHAPTER_WHITELIST = new Set([
    "'Playfair Display', Georgia, 'Times New Roman', serif",
    "Georgia, 'Times New Roman', Times, serif",
    "'Palatino Linotype', Palatino, serif",
    "'Times New Roman', Times, serif",
    "match-body"
]);

function getPreviewBodyFontStack() {
    const v = safeString(document.getElementById("neTypoBodyFace")?.value, "");
    return NE_TYPO_BODY_WHITELIST.has(v) ? v : "Georgia, 'Times New Roman', Times, serif";
}

/** Chapter title face in preview — follows Typography → Chapter titles (or body when “Match body”). */
function getPreviewChapterTitleFontStack() {
    const ch = safeString(document.getElementById("neTypoChapterFace")?.value, "'Playfair Display', Georgia, 'Times New Roman', serif");
    if (ch === "match-body") {
        return getPreviewBodyFontStack();
    }
    return NE_TYPO_CHAPTER_WHITELIST.has(ch) ? ch : "'Playfair Display', Georgia, 'Times New Roman', serif";
}

function getPreviewBodySizePt() {
    const raw = parseFloat(safeString(document.getElementById("neTypoBodySizePt")?.value, "11"));
    if (!Number.isFinite(raw)) return 11;
    return Math.min(16, Math.max(8, raw));
}

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
    const titleFont = coerceFontStack(document.getElementById("neTitleFontSelect")?.value);
    const penFont = coerceFontStack(document.getElementById("nePenFontSelect")?.value);
    const acknowledgements = safeString(document.getElementById("neAckText")?.value, "").trim();
    const ackFont = coerceFontStack(document.getElementById("neAckFontSelect")?.value);
    const includeToc = Boolean(document.getElementById("neIncludeToc")?.checked);
    const authorsNotes = safeString(document.getElementById("neAuthorNotesText")?.value, "").trim();
    const authorsNotesFont = coerceFontStack(document.getElementById("neAuthorNotesFont")?.value);
    const glossary = safeString(document.getElementById("neGlossaryText")?.value, "").trim();
    const glossaryFont = coerceFontStack(document.getElementById("neGlossaryFont")?.value);
    const aboutAuthor = safeString(document.getElementById("neAboutAuthorText")?.value, "").trim();
    const aboutAuthorFont = coerceFontStack(document.getElementById("neAboutAuthorFont")?.value);

    return {
        title,
        pen,
        titleFont,
        penFont,
        acknowledgements,
        ackFont,
        includeToc,
        authorsNotes,
        authorsNotesFont,
        glossary,
        glossaryFont,
        aboutAuthor,
        aboutAuthorFont,
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

function plainTextToBodyHtml(text) {
    const raw = safeString(text, "").trim();
    if (!raw) return "";
    return raw
        .split(/\n\s*\n+/)
        .map(block => {
            const inner = escapeHtml(block.trim()).replace(/\n/g, "<br>");
            return `<p class="ne-ms-para">${inner}</p>`;
        })
        .join("");
}

function titlePageHtml(title, pen, titleFont, penFont) {
    const tf = coerceFontStack(titleFont);
    const pf = coerceFontStack(penFont);
    const t = escapeHtml(title || "Untitled");
    const penClean = safeString(pen, "").replace(/^@/, "").trim();
    const authorLine = penClean
        ? `<p class="ne-preview-title-author" style="font-family:${pf}">${escapeHtml(penClean)}</p>`
        : `<p class="ne-preview-title-author" style="font-family:${pf}">&nbsp;</p>`;

    return (
        `<div class="ne-preview-page-frame ne-preview-page-title">` +
        `${authorLine}` +
        `<div class="ne-preview-title-rule" aria-hidden="true"></div>` +
        `<h1 class="ne-preview-title-work" style="font-family:${tf}">${t}</h1>` +
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

function acknowledgementsPageHtml(plain, fontStack) {
    const fs = coerceFontStack(fontStack);
    const inner = plainTextToBodyHtml(plain);
    return (
        `<div class="ne-preview-page-frame ne-preview-page-extra" style="font-family:${fs}">` +
        `<h2 class="ne-extra-h2">Acknowledgements</h2>` +
        `<div class="ne-extra-body">${inner}</div>` +
        `</div>`
    );
}

function optionalBackMatterPageHtml(heading, plain, fontStack) {
    const fs = coerceFontStack(fontStack);
    const inner = plainTextToBodyHtml(plain);
    return (
        `<div class="ne-preview-page-frame ne-preview-page-extra" style="font-family:${fs}">` +
        `<h2 class="ne-extra-h2">${escapeHtml(heading)}</h2>` +
        `<div class="ne-extra-body">${inner}</div>` +
        `</div>`
    );
}

function tocPageHtml(chapterLabels, chapterStartPages, backLabels, backStartPages) {
    const rows = [];

    chapterLabels.forEach((lab, i) => {
        const p = chapterStartPages[i] != null ? chapterStartPages[i] : "";
        rows.push(
            `<li class="ne-preview-toc-row">` +
                `<span>${escapeHtml(lab)}</span>` +
                `<span class="ne-preview-toc-dots" aria-hidden="true"></span>` +
                `<span>${escapeHtml(String(p))}</span>` +
                `</li>`
        );
    });

    backLabels.forEach((lab, j) => {
        const p = backStartPages[j] != null ? backStartPages[j] : "";
        rows.push(
            `<li class="ne-preview-toc-row">` +
                `<span>${escapeHtml(lab)}</span>` +
                `<span class="ne-preview-toc-dots" aria-hidden="true"></span>` +
                `<span>${escapeHtml(String(p))}</span>` +
                `</li>`
        );
    });

    const list = rows.length ? rows.join("") : "<li>—</li>";

    return (
        `<div class="ne-preview-page-frame ne-preview-page-toc">` +
        `<h2 class="ne-preview-toc-title">Contents</h2>` +
        `<ol class="ne-preview-toc-list">${list}</ol>` +
        `</div>`
    );
}

function chapterHeadFragmentHtml(ch, chapterNumber, titleFontStack) {
    const title = escapeHtml(ch.title || "Untitled");
    const tf = titleFontStack || getPreviewChapterTitleFontStack();
    const n = typeof chapterNumber === "number" && chapterNumber > 0 ? chapterNumber : 0;
    const numLine =
        n > 0
            ? `<p class="ne-chapter-num"><span class="ne-chapter-num-inner">Chapter ${n}</span></p>`
            : "";
    return (
        `<header class="ne-chapter-head">` +
        numLine +
        `<h2 class="ne-ms-ch-title" style="font-family:${tf}"><span class="ne-ms-ch-title-text">${title}</span></h2>` +
        `<div class="ne-chapter-rule" aria-hidden="true"></div>` +
        `</header>`
    );
}

function wrapChapterSliceHtml(sectionAttr, headFragmentHtml, bodyInnerHtml, bodyFont, bodyPt) {
    const head = headFragmentHtml || "";
    return (
        `<div class="ne-preview-page-frame ne-preview-manuscript" style="font-family:${bodyFont};font-size:${bodyPt}pt">` +
        `<section class="ne-ms-ch ne-ms-ch--book" data-section="${sectionAttr}">` +
        head +
        `<div class="ne-ms-ch-body">${bodyInnerHtml}</div>` +
        `</section>` +
        `</div>`
    );
}

/**
 * Single source of truth for preview trim + live (type) area in CSS pixels.
 * Pagination must mirror the on-screen DOM: chapter titles use `cqw` against `.ne-preview-page`
 * (trim width), not the scroll box — an off-screen measure shell without that ancestor mis-sized
 * the chapter head and broke pages early, leaving empty bands inside the margins.
 */
function getPreviewMountLayoutMetrics() {
    const mount = document.getElementById("pdfPreviewMount");
    const sc = document.getElementById("nePreviewScroll");
    if (!mount) {
        return {
            trimW: 400,
            trimH: 640,
            liveW: 320,
            liveH: 520,
            scrollLeftPx: 60,
            scrollTopPx: 40,
            pw: 5,
            ph: 8,
            mt: 0.5,
            mb: 0.5,
            mi: 0.75,
            mo: 0.5,
            verso: false
        };
    }
    /*
     * Use padding-box dimensions (clientWidth/Height), not getBoundingClientRect().
     * The preview page has a border; insets and .ne-preview-scroll use % of the padding box.
     * Border-box rect skewed gutter math and live-area height vs print guides + pagination.
     */
    const trimW = mount.clientWidth || mount.getBoundingClientRect().width || 400;
    const trimH = mount.clientHeight || mount.getBoundingClientRect().height || 640;
    const pw = parseFloat(mount.getAttribute("data-page-width-in")) || 5;
    const ph = parseFloat(mount.getAttribute("data-page-height-in")) || 8;
    const mt = parseFloat(mount.getAttribute("data-margin-top-in") ?? "0.5") || 0.5;
    const mb = parseFloat(mount.getAttribute("data-margin-bottom-in") ?? "0.5") || 0.5;
    const mi = parseFloat(mount.getAttribute("data-margin-inner-in") ?? "0.75") || 0.75;
    const mo = parseFloat(mount.getAttribute("data-margin-outer-in") ?? "0.5") || 0.5;
    const verso = mount.getAttribute("data-page-hand") === "verso" || mount.classList.contains("ne-preview-page--verso");
    const gutterIn = verso ? mo : mi;
    const innerWIn = Math.max(0.1, pw - mi - mo);
    const innerHIn = Math.max(0.1, ph - mt - mb);
    const scrollLeftPx = (trimW * gutterIn) / pw;
    const scrollTopPx = (trimH * mt) / ph;
    let liveW = Math.round((innerWIn * trimW) / pw);
    let liveH = Math.round((innerHIn * trimH) / ph);
    if (sc && !sc.hidden && sc.clientWidth > 24 && sc.clientHeight > 24) {
        liveW = sc.clientWidth;
        liveH = sc.clientHeight;
    }
    return {
        trimW,
        trimH,
        liveW: Math.max(64, liveW),
        liveH: Math.max(64, liveH),
        scrollLeftPx,
        scrollTopPx,
        pw,
        ph,
        mt,
        mb,
        mi,
        mo,
        verso
    };
}

function getLiveAreaDimensions() {
    const m = getPreviewMountLayoutMetrics();
    return { w: m.liveW, h: m.liveH };
}

function measureChapterSliceOverflow(includeHead, headFragmentHtml, bodyNodes, layout, bodyFont, bodyPt) {
    const mount = document.getElementById("pdfPreviewMount");
    const { liveW: w, liveH: h, trimW, trimH, scrollLeftPx, scrollTopPx } = layout;

    const shell = document.createElement("div");
    shell.setAttribute("data-ne-measure", "1");
    shell.style.cssText = [
        "position:fixed",
        "left:-14000px",
        "top:0",
        `width:${w}px`,
        `height:${h}px`,
        "overflow:hidden",
        "box-sizing:border-box",
        "visibility:hidden",
        "pointer-events:none",
        "margin:0",
        "padding:0"
    ].join(";");

    const fauxPage = document.createElement("div");
    if (mount) {
        fauxPage.className = mount.className;
        ["data-format", "data-page-hand", "data-chapter-new-page", "data-chapter-drop-cap"].forEach(attr => {
            if (mount.hasAttribute(attr)) {
                fauxPage.setAttribute(attr, mount.getAttribute(attr));
            }
        });
    } else {
        fauxPage.className = "ne-preview-page";
    }
    fauxPage.style.cssText = [
        "position:absolute",
        `left:${-scrollLeftPx}px`,
        `top:${-scrollTopPx}px`,
        `width:${trimW}px`,
        `height:${trimH}px`,
        "box-sizing:border-box",
        "margin:0",
        "padding:0",
        "overflow:visible"
    ].join(";");

    const fauxScroll = document.createElement("div");
    fauxScroll.className = "ne-preview-scroll";
    fauxScroll.style.cssText = [
        "position:absolute",
        `left:${scrollLeftPx}px`,
        `top:${scrollTopPx}px`,
        `width:${w}px`,
        `height:${h}px`,
        "overflow:hidden",
        "box-sizing:border-box",
        "margin:0",
        "padding:0"
    ].join(";");

    const ms = document.createElement("div");
    ms.className = "ne-preview-page-frame ne-preview-manuscript";
    ms.style.cssText = [
        `font-family:${bodyFont}`,
        `font-size:${bodyPt}pt`,
        "line-height:1.48",
        "color:#1e293b",
        "width:100%",
        "max-width:100%",
        "box-sizing:border-box",
        "margin:0",
        "padding:0"
    ].join(";");
    const section = document.createElement("section");
    section.className = "ne-ms-ch ne-ms-ch--book";
    section.setAttribute("data-section", "body");
    if (includeHead && headFragmentHtml) {
        const tpl = document.createElement("template");
        tpl.innerHTML = headFragmentHtml.trim();
        while (tpl.content.firstChild) {
            section.appendChild(tpl.content.firstChild);
        }
    }
    const bodyEl = document.createElement("div");
    bodyEl.className = "ne-ms-ch-body";
    bodyNodes.forEach(n => {
        bodyEl.appendChild(n.cloneNode(true));
    });
    section.appendChild(bodyEl);
    ms.appendChild(section);
    fauxScroll.appendChild(ms);
    fauxPage.appendChild(fauxScroll);
    shell.appendChild(fauxPage);
    document.body.appendChild(shell);
    let over = false;
    try {
        /* Match `.ne-preview-scroll { overflow: hidden }` — compare scroll height on the live box, not the trim shell. */
        /* Small slack: subpixel / flex rounding otherwise marks a “full” page as overflow and drops a whole line. */
        over = fauxScroll.scrollHeight > fauxScroll.clientHeight + 5;
    } finally {
        shell.remove();
    }
    return over;
}

/**
 * Largest index k (0 < k <= maxFit) where text[k] is whitespace (so text.slice(0, k) ends a whole word).
 * If none (single long token), returns `maxFit` so callers can fall back to a character break.
 * @param {string} text
 * @param {number} maxFit
 */
function snapCutIndexToWordBoundary(text, maxFit) {
    const n = text.length;
    const lim = Math.min(Math.max(0, maxFit), n);
    if (lim <= 0) return 0;
    if (lim >= n) return n;
    let k = lim;
    while (k > 0 && !(k === n || /\s/.test(text[k]))) {
        k -= 1;
    }
    return k > 0 ? k : lim;
}

/**
 * Split a text paragraph so `prefixBodyNodes` + first part fits the live area; remainder continues on the next page.
 * Breaks only at spaces between words (never mid-word) unless one word is longer than the page can hold.
 * @param {Element} pEl
 * @param {Element[]} prefixBodyNodes Nodes already placed on this page (same order as in body).
 * @param rest same as measureChapterSliceOverflow
 */
function splitTextParagraphToFit(pEl, prefixBodyNodes, includeHead, headFragmentHtml, layout, bodyFont, bodyPt) {
    const prefix = prefixBodyNodes && prefixBodyNodes.length ? prefixBodyNodes : [];
    const text = (pEl.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const cls = pEl.getAttribute("class") || "ne-ms-para";
    const trialWithMid = mid => {
        const nodes = prefix.map(n => n.cloneNode(true));
        const p = document.createElement("p");
        p.setAttribute("class", cls);
        p.textContent = text.slice(0, mid);
        nodes.push(p);
        return nodes;
    };
    let lo = 1;
    let hi = text.length;
    let maxFit = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (!measureChapterSliceOverflow(includeHead, headFragmentHtml, trialWithMid(mid), layout, bodyFont, bodyPt)) {
            maxFit = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (maxFit === 0) return null;
    const best = snapCutIndexToWordBoundary(text, maxFit);
    const first = document.createElement("p");
    first.setAttribute("class", cls);
    first.textContent = text.slice(0, best).replace(/\s+$/, "");
    const rest = document.createElement("p");
    rest.setAttribute("class", cls + " ne-ms-para--split-cont");
    rest.textContent = text.slice(best).trim();
    return { first, rest: rest.textContent ? rest : null };
}

function bodyNodesFromHtml(bodyHtml) {
    const tmp = document.createElement("div");
    tmp.innerHTML = bodyHtml || "";
    let nodes = Array.from(tmp.children);
    if (!nodes.length && (tmp.textContent || "").trim()) {
        const p = document.createElement("p");
        p.className = "ne-ms-para";
        p.textContent = tmp.textContent.trim();
        nodes = [p];
    }
    return nodes;
}

function serializeBodyNodes(nodes) {
    const d = document.createElement("div");
    nodes.forEach(n => d.appendChild(n));
    return d.innerHTML;
}

/**
 * Split one chapter into multiple preview pages using live-area height (no Paged.js).
 * First slice includes the chapter head; later slices are body-only continuations.
 */
function paginateChapterSlices(ch, chapterNumber, layout) {
    const bodyFont = getPreviewBodyFontStack();
    const bodyPt = getPreviewBodySizePt();
    const titleFont = getPreviewChapterTitleFontStack();
    const headHtml = chapterHeadFragmentHtml(ch, chapterNumber, titleFont);
    const bodyHtml = normalizeChapterBodyHtml(ch.content);
    const sectionAttr = escapeHtml(ch.section || "");

    let remaining = bodyNodesFromHtml(bodyHtml);
    const slices = [];
    let first = true;

    if (!remaining.length) {
        slices.push(wrapChapterSliceHtml(sectionAttr, first ? headHtml : "", "", bodyFont, bodyPt));
        return slices;
    }

    while (remaining.length) {
        const pageNodes = [];
        while (remaining.length) {
            const next = remaining[0];
            const trial = pageNodes.concat([next]);
            if (!measureChapterSliceOverflow(first, headHtml, trial, layout, bodyFont, bodyPt)) {
                pageNodes.push(remaining.shift());
            } else {
                if (pageNodes.length) {
                    if (next.tagName === "P") {
                        const sp = splitTextParagraphToFit(next, pageNodes, first, headHtml, layout, bodyFont, bodyPt);
                        if (sp && sp.first.textContent) {
                            pageNodes.push(sp.first);
                            if (sp.rest && sp.rest.textContent) {
                                remaining[0] = sp.rest;
                            } else {
                                remaining.shift();
                            }
                        }
                    }
                    break;
                }
                if (next.tagName === "P") {
                    const sp = splitTextParagraphToFit(next, [], first, headHtml, layout, bodyFont, bodyPt);
                    if (sp && sp.first.textContent) {
                        pageNodes.push(sp.first);
                        if (sp.rest && sp.rest.textContent) {
                            remaining[0] = sp.rest;
                        } else {
                            remaining.shift();
                        }
                    } else {
                        pageNodes.push(remaining.shift());
                    }
                } else {
                    pageNodes.push(remaining.shift());
                }
                break;
            }
        }
        if (!pageNodes.length && remaining.length) {
            pageNodes.push(remaining.shift());
        }
        const inner = serializeBodyNodes(pageNodes);
        slices.push(wrapChapterSliceHtml(sectionAttr, first ? headHtml : "", inner, bodyFont, bodyPt));
        first = false;
    }

    return slices;
}

/** Single-page chapter (fallback / tiny live area). */
function chapterPageHtml(ch, chapterNumber) {
    const body = normalizeChapterBodyHtml(ch.content);
    const head = chapterHeadFragmentHtml(ch, chapterNumber, getPreviewChapterTitleFontStack());
    return wrapChapterSliceHtml(escapeHtml(ch.section || ""), head, body, getPreviewBodyFontStack(), getPreviewBodySizePt());
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
let nePreviewResizeTimer = null;

function scheduleNePreviewReflow() {
    if (!loadedBook) return;
    if (nePreviewResizeTimer) clearTimeout(nePreviewResizeTimer);
    nePreviewResizeTimer = setTimeout(() => {
        nePreviewResizeTimer = null;
        renderCurrentPreviewPage();
    }, 160);
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

function buildPreviewPages(book) {
    const inputs = currentPreviewInputs();
    const title = inputs.title || safeString(book.title, "Untitled Book");
    const pen = inputs.pen;

    const pages = [];
    pages.push({
        kind: "title",
        label: "Title page",
        html: titlePageHtml(title, pen, inputs.titleFont, inputs.penFont)
    });
    pages.push({ kind: "copyright", label: "Copyright", html: copyrightPageHtml(inputs.cp) });

    if (inputs.acknowledgements) {
        pages.push({
            kind: "ack",
            label: "Acknowledgements",
            html: acknowledgementsPageHtml(inputs.acknowledgements, inputs.ackFont)
        });
    }

    const bodyChapters = allChaptersFlat(book).filter(ch => ch.section === "body");
    const chapterLabels = bodyChapters.map((ch, i) => safeString(ch.title, "").trim() || `Chapter ${i + 1}`);

    const backTocLabels = [];
    if (inputs.authorsNotes) backTocLabels.push("Author’s notes");
    if (inputs.glossary) backTocLabels.push("Glossary");
    if (inputs.aboutAuthor) backTocLabels.push("About the author");

    const layout = getPreviewMountLayoutMetrics();
    const chapterBundles = bodyChapters.map((ch, i) => paginateChapterSlices(ch, i + 1, layout));

    const chapterStartPages = [];
    let cursor = pages.length + (inputs.includeToc ? 2 : 1);
    chapterBundles.forEach(b => {
        chapterStartPages.push(cursor);
        cursor += b.length;
    });

    const backStartPages = [];
    backTocLabels.forEach(() => {
        backStartPages.push(cursor);
        cursor += 1;
    });

    if (inputs.includeToc) {
        pages.push({
            kind: "toc",
            label: "Contents",
            html: tocPageHtml(chapterLabels, chapterStartPages, backTocLabels, backStartPages)
        });
    }

    chapterBundles.forEach((slices, i) => {
        const ch = bodyChapters[i];
        const baseLabel = ch.title || `Chapter ${i + 1}`;
        slices.forEach((html, si) => {
            pages.push({
                kind: "chapter",
                label: si === 0 ? baseLabel : `${baseLabel} · ${si + 1}`,
                html
            });
        });
    });

    if (inputs.authorsNotes) {
        pages.push({
            kind: "authorNotes",
            label: "Author’s notes",
            html: optionalBackMatterPageHtml("Author’s notes", inputs.authorsNotes, inputs.authorsNotesFont)
        });
    }
    if (inputs.glossary) {
        pages.push({
            kind: "glossary",
            label: "Glossary",
            html: optionalBackMatterPageHtml("Glossary", inputs.glossary, inputs.glossaryFont)
        });
    }
    if (inputs.aboutAuthor) {
        pages.push({
            kind: "aboutAuthor",
            label: "About the author",
            html: optionalBackMatterPageHtml("About the author", inputs.aboutAuthor, inputs.aboutAuthorFont)
        });
    }

    return pages;
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

    const ph = document.getElementById("nePreviewPlaceholder");
    if (ph) ph.hidden = true;
    sc.hidden = false;
    void sc.offsetWidth;

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
                if (el.checked) {
                    applyPageFormat(el.value);
                    if (loadedBook) renderCurrentPreviewPage();
                }
            });
        });
        var picked = document.querySelector('input[name="nePageFormat"]:checked');
        if (picked) applyPageFormat(picked.value);
        else applyGuideMeasurements();
    }

    if (preview && handRadios.length) {
        handRadios.forEach(function (el) {
            el.addEventListener("change", function () {
                if (el.checked) {
                    applyPageHand(el.value);
                    if (loadedBook) renderCurrentPreviewPage();
                }
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

    // Changes to these flags should re-typeset the paged preview.
    if (newPageBtn) {
        newPageBtn.addEventListener("click", () => {
            if (!loadedBook) return;
            renderCurrentPreviewPage();
        });
    }
    if (dropCapBtn) {
        dropCapBtn.addEventListener("click", () => {
            if (!loadedBook) return;
            renderCurrentPreviewPage();
        });
    }
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
        previewIndex += 1;
        renderCurrentPreviewPage();
    });
    updatePagerUi();
}

function wirePreviewLiveInputs() {
    const ids = [
        "neBookTitleInput",
        "neTitleFontSelect",
        "neAuthorUsernameInput",
        "nePenFontSelect",
        "neAckFontSelect",
        "neAckText",
        "neIncludeToc",
        "neAuthorNotesFont",
        "neAuthorNotesText",
        "neGlossaryFont",
        "neGlossaryText",
        "neAboutAuthorFont",
        "neAboutAuthorText",
        "neTypoChapterFace",
        "neTypoBodyFace",
        "neTypoBodySizePt",
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

function preventPreviewScrollChaining() {
    const sc = document.getElementById("nePreviewScroll");
    if (!sc) return;

    // The preview is paged via Prev/Next; block wheel/touch scrolling inside the page box
    // so you can't accidentally reveal other pages or drift the content.
    const stop = ev => {
        ev.preventDefault();
        ev.stopPropagation();
    };
    sc.addEventListener("wheel", stop, { passive: false });
    sc.addEventListener("touchmove", stop, { passive: false });
}

function init() {
    wireBackLink();
    initLayoutControls();
    wireTitlePenGuards();
    wirePreviewPager();
    wirePreviewLiveInputs();
    preventPreviewScrollChaining();

    window.addEventListener("resize", scheduleNePreviewReflow);
    const pm = document.getElementById("pdfPreviewMount");
    if (pm && typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => scheduleNePreviewReflow()).observe(pm);
    }

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
