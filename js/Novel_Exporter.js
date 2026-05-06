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

function applyManuscriptToPreview(book) {
    const sc = document.getElementById("nePreviewScroll");
    if (!sc) return;
    sc.innerHTML = `<div class="ne-preview-manuscript">${buildManuscriptPreviewHtml(book)}</div>`;
    setPreviewPlaceholder(false, "");
}

function fillTitleAndPenFromBook(book, authorLine) {
    const titleIn = document.getElementById("neBookTitleInput");
    const penIn = document.getElementById("neAuthorUsernameInput");
    if (titleIn && !titleIn.dataset.neTouched) {
        titleIn.value = book.title || "";
    }
    if (penIn && !penIn.dataset.neTouched) {
        const v = safeString(authorLine, "").trim();
        penIn.value = v.startsWith("@") ? v : v ? `@${v}` : "";
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

    try {
        const snap = await getDoc(doc(db, "users", uid, "books", bookId));

        if (!snap.exists()) {
            setPreviewPlaceholder(true, "This book was not found, or you do not have access.");
            const titleIn = document.getElementById("neBookTitleInput");
            if (titleIn) titleIn.value = "";
            return;
        }

        const book = normalizeBookData(snap.data());
        ensureStructure(book);
        fillTitleAndPenFromBook(book, authorDisplay);
        applyManuscriptToPreview(book);
    } catch (err) {
        console.error(err);
        const code = err && typeof err === "object" && "code" in err ? err.code : "";
        let msg = "Could not load this book.";
        if (code === "permission-denied") {
            msg = "No permission to read this book.";
        }
        setPreviewPlaceholder(true, msg);
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

function init() {
    wireBackLink();
    initLayoutControls();
    wireTitlePenGuards();

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
