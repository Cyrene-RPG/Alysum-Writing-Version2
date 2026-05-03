/**
 * PDF formatter for Alysum — loads the same Firestore document as editor.html
 * (`users/{uid}/books/{bookId}`) using the `book` query parameter.
 */

import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const bookId = params.get("book");

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
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
    ? frontRaw.map((ch, index) => normalizeChapter(ch, index === 0 ? "Copyright" : "Table of Contents"))
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

function stripHtmlToText(html) {
  const text = safeString(html, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|h1|h2|h3|li|blockquote)>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function countWords(html) {
  const text = stripHtmlToText(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Barnes & Noble Press trim sizes (interior page size = final trim).
 * Source: https://help-press.barnesandnoble.com/hc/en-us/articles/5358034341275-Trim-Sizes-and-Paper-Stock
 */
const TRIM_ORDER = [
  "4x6",
  "4.25x7",
  "4.37x7",
  "5x8",
  "5.06x7.81",
  "5.25x8",
  "5.5x8.25",
  "5.5x8.5",
  "5.83x8.27",
  "6x9",
  "6.14x9.21",
  "7x10",
  "7.5x9.25",
  "8x8",
  "8x10",
  "8.25x11",
  "8.268x11.693",
  "8.5x8.5",
  "8.5x11",
  "11x8.5"
];

const TRIM_SIZES = {
  "4x6": { label: "B&N Press — 4 × 6 in", width: "4in", height: "6in" },
  "4.25x7": { label: "B&N Press — 4.25 × 7 in (mass market)", width: "4.25in", height: "7in" },
  "4.37x7": { label: "B&N Press — 4.37 × 7 in", width: "4.37in", height: "7in" },
  "5x8": { label: "B&N Press — 5 × 8 in", width: "5in", height: "8in" },
  "5.06x7.81": { label: "B&N Press — 5.06 × 7.81 in", width: "5.06in", height: "7.81in" },
  "5.25x8": { label: "B&N Press — 5.25 × 8 in", width: "5.25in", height: "8in" },
  "5.5x8.25": { label: "B&N Press — 5.5 × 8.25 in (trade)", width: "5.5in", height: "8.25in" },
  "5.5x8.5": { label: "B&N Press — 5.5 × 8.5 in", width: "5.5in", height: "8.5in" },
  "5.83x8.27": { label: "B&N Press — 5.83 × 8.27 in (UK)", width: "5.83in", height: "8.27in" },
  "6x9": { label: "B&N Press — 6 × 9 in (trade / hardcover)", width: "6in", height: "9in" },
  "6.14x9.21": { label: "B&N Press — 6.14 × 9.21 in", width: "6.14in", height: "9.21in" },
  "7x10": { label: "B&N Press — 7 × 10 in", width: "7in", height: "10in" },
  "7.5x9.25": { label: "B&N Press — 7.5 × 9.25 in", width: "7.5in", height: "9.25in" },
  "8x8": { label: "B&N Press — 8 × 8 in", width: "8in", height: "8in" },
  "8x10": { label: "B&N Press — 8 × 10 in", width: "8in", height: "10in" },
  "8.25x11": { label: "B&N Press — 8.25 × 11 in", width: "8.25in", height: "11in" },
  "8.268x11.693": { label: "B&N Press — 8.268 × 11.693 in (UK)", width: "8.268in", height: "11.693in" },
  "8.5x8.5": { label: "B&N Press — 8.5 × 8.5 in", width: "8.5in", height: "8.5in" },
  "8.5x11": { label: "B&N Press — 8.5 × 11 in", width: "8.5in", height: "11in" },
  "11x8.5": { label: "B&N Press — 11 × 8.5 in (landscape)", width: "11in", height: "8.5in" }
};

const BODY_FONTS = {
  "Crimson Pro": "'Crimson Pro', Georgia, serif",
  Lora: "'Lora', Georgia, serif",
  Merriweather: "'Merriweather', Georgia, serif",
  "Literata": "'Literata', Georgia, serif",
  "Source Serif 4": "'Source Serif 4', Georgia, serif",
  Georgia: "Georgia, serif"
};

const HEADING_FONTS = {
  match: "inherit",
  "Crimson Pro": "'Crimson Pro', Georgia, serif",
  Lora: "'Lora', Georgia, serif",
  "Source Sans 3": "'Source Sans 3', system-ui, sans-serif"
};

const SCENE_BREAKS = {
  asterism: '<p class="scene-break" aria-hidden="true">* &nbsp; * &nbsp; *</p>',
  hash: '<p class="scene-break" aria-hidden="true"># # #</p>',
  space: '<p class="scene-break scene-spacer" aria-hidden="true">&nbsp;</p>',
  rule: '<hr class="scene-rule" />'
};

/** @type {{ book: ReturnType<typeof normalizeBookData> | null, activeNav: string, zoom: number, trim: string, bodyFont: string, headingFont: string, bodySizePt: number, lineHeight: number, paragraphIndent: string, marginPreset: string, chapterNewPage: boolean, dropCap: boolean, headerFooter: string, sceneBreak: string, showPartLabels: boolean }} */
const state = {
  book: null,
  activeNav: "",
  zoom: 0.92,
  trim: "6x9",
  bodyFont: "Crimson Pro",
  headingFont: "match",
  bodySizePt: 11,
  lineHeight: 1.45,
  paragraphIndent: "0.25in",
  marginPreset: "bn",
  chapterNewPage: true,
  dropCap: false,
  headerFooter: "page",
  sceneBreak: "asterism",
  showPartLabels: true
};

function marginInches() {
  switch (state.marginPreset) {
    case "tight":
      return "0.55in";
    case "wide":
      return "1in";
    case "bn":
      /* Extra gutter for POD; B&N flags content in the trim zone */
      return "0.8in";
    default:
      return "0.75in";
  }
}

function googleFontHref() {
  const families = new Set([
    "Crimson Pro:ital,wght@0,400;0,600;0,700;1,400",
    "Lora:ital,wght@0,400;0,600;0,700;1,400",
    "Merriweather:ital,wght@0,400;0,700;1,400",
    "Literata:ital,wght@0,400;0,600;0,700;1,400",
    "Source Serif 4:ital,wght@0,400;0,600;0,700;1,400",
    "Source Sans 3:ital,wght@0,500;0,600;0,700;1,400"
  ]);
  const q = [...families].map(f => `family=${encodeURIComponent(f)}`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function navId(section, index) {
  return `ch-${section}-${index}`;
}

function allChaptersFlat(book) {
  if (!book) return [];
  return [
    ...book.sections.front.map((ch, i) => ({ section: "front", index: i, ...ch })),
    ...book.sections.body.map((ch, i) => ({ section: "body", index: i, ...ch })),
    ...book.sections.back.map((ch, i) => ({ section: "back", index: i, ...ch }))
  ];
}

function buildManuscriptBodyHtml(book) {
  const chunks = [];
  const brk = SCENE_BREAKS[state.sceneBreak] || SCENE_BREAKS.asterism;

  for (const section of ["front", "body", "back"]) {
    const list = book.sections[section] || [];
    list.forEach((ch, index) => {
      const id = navId(section, index);
      const partLabel =
        state.showPartLabels && (section === "front" || section === "back")
          ? `<div class="part-label">${section === "front" ? "Front matter" : "Back matter"}</div>`
          : "";

      const pageClass = state.chapterNewPage ? "chapter-start" : "";
      chunks.push(`
        <article class="pdf-chapter ${pageClass}" id="${id}" data-section="${section}">
          ${partLabel}
          <h1 class="pdf-h1">${escapeHtml(ch.title || "Untitled")}</h1>
          <div class="pdf-body ${state.dropCap ? "drop-cap" : ""}">${ch.content || "<p></p>"}</div>
          ${index < list.length - 1 ? brk : ""}
        </article>
      `);
    });
  }

  return chunks.join("\n");
}

function headingFontCss() {
  if (state.headingFont === "match") {
    return BODY_FONTS[state.bodyFont] || BODY_FONTS["Crimson Pro"];
  }
  return HEADING_FONTS[state.headingFont] || BODY_FONTS["Crimson Pro"];
}

function atPageCssBlock() {
  const trim = TRIM_SIZES[state.trim] || TRIM_SIZES["6x9"];
  const margin = marginInches();
  const bookTitle = escapeHtml(state.book?.title || "Manuscript");
  let running = "";
  if (state.headerFooter === "title") {
    running = `@top-center { content: "${bookTitle}"; font-size: 9pt; color: #64748b; font-family: system-ui, sans-serif; }`;
  } else if (state.headerFooter === "title-page") {
    running = `@top-center { content: "${bookTitle}"; font-size: 9pt; color: #64748b; font-family: system-ui, sans-serif; }
      @bottom-center { content: counter(page); font-size: 9pt; color: #64748b; font-family: system-ui, sans-serif; }`;
  } else if (state.headerFooter === "page") {
    running = `@bottom-center { content: counter(page); font-size: 9pt; color: #64748b; font-family: system-ui, sans-serif; }`;
  }
  return `@page { size: ${trim.width} ${trim.height}; margin: ${margin}; ${running} }`;
}

function buildPreviewDocumentHtml() {
  const book = state.book;
  if (!book) return "";

  const bodyFont = BODY_FONTS[state.bodyFont] || BODY_FONTS["Crimson Pro"];
  const hFont = headingFontCss();

  const inner = buildManuscriptBodyHtml(book);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="${googleFontHref()}" />
  <style>
    ${atPageCssBlock()}
    html { font-size: ${state.bodySizePt}pt; }
    body {
      margin: 0;
      font-family: ${bodyFont};
      line-height: ${state.lineHeight};
      color: #1e293b;
      background: #fff;
    }
    @media screen {
      html {
        margin: 0;
        padding: 0;
        height: auto;
        min-height: 100%;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: auto !important;
        background: #e8ecf0;
      }
      #manuscript-root {
        margin: 0;
        padding: 0;
      }
      .pagedjs_pages {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 14px !important;
        padding: 12px 8px 28px !important;
        margin: 0 auto !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      .pagedjs_page {
        margin: 0 auto !important;
        float: none !important;
        box-sizing: border-box !important;
        background: #fff !important;
      }
    }
    .part-label {
      font-family: "Source Sans 3", system-ui, sans-serif;
      font-size: 8pt;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 0.6rem;
    }
    .pdf-chapter { break-inside: avoid; }
    .pdf-chapter.chapter-start { break-before: page; }
    .pdf-chapter:first-of-type { break-before: auto; }
    .pdf-h1 {
      font-family: ${hFont};
      font-size: 1.35rem;
      font-weight: 700;
      margin: 0 0 1rem;
      line-height: 1.25;
    }
    /* Manuscript uses <div> blocks from contenteditable, not only <p> */
    .pdf-body p,
    .pdf-body div:not(.scene-break):not(.scene-spacer) {
      margin: 0 0 0.55em;
      text-align: justify;
      text-indent: ${state.paragraphIndent};
    }
    .pdf-body > p:first-child,
    .pdf-body > div:first-child {
      text-indent: 0;
    }
    .pdf-body p.scene-break,
    .pdf-body div.scene-break {
      text-indent: 0 !important;
      text-align: center !important;
    }
    .pdf-body ul,
    .pdf-body ol {
      margin: 0.5em 0 0.75em;
      padding-left: 1.35em;
    }
    .pdf-body li {
      margin: 0 0 0.2em;
      text-indent: 0;
      text-align: left;
    }
    .pdf-body li p,
    .pdf-body li div {
      text-indent: 0;
      margin: 0.15em 0;
    }
    .drop-cap .pdf-body > p:first-of-type::first-letter,
    .drop-cap .pdf-body > div:first-of-type::first-letter {
      float: left;
      font-size: 2.85rem;
      line-height: 0.85;
      font-weight: 700;
      padding-right: 0.08em;
    }
    .pdf-body h2, .pdf-body h3 { font-family: ${hFont}; margin: 1.2em 0 0.5em; }
    .pdf-body blockquote {
      margin: 1em 1.2em;
      font-style: italic;
      color: #475569;
    }
    .pdf-body blockquote p,
    .pdf-body blockquote div {
      text-indent: 0;
    }
    .scene-break {
      text-align: center;
      letter-spacing: 0.25em;
      margin: 1.4em 0;
      color: #64748b;
      font-size: 0.95rem;
      border: none;
      page-break-inside: avoid;
    }
    .scene-spacer { visibility: hidden; height: 2.5em; }
    .scene-rule {
      width: 28%;
      margin: 1.5em auto;
      border: none;
      border-top: 1px solid #cbd5e1;
    }
  </style>
</head>
<body>
  <div id="manuscript-root">${inner}</div>
  <script src="https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.polyfill.js"><\/script>
  <script>
    (function () {
      function done() {
        try {
          window.parent.postMessage({ type: "alysum-pdf-pages", count: document.querySelectorAll(".pagedjs_page").length }, "*");
        } catch (e) {}
      }
      function run() {
        try {
          if (window.PagedPolyfill && typeof window.PagedPolyfill.preview === "function") {
            window.PagedPolyfill.preview().then(done).catch(done);
          } else if (window.Paged && window.Paged.Previewer) {
            var p = new window.Paged.Previewer();
            p.preview().then(done).catch(done);
          } else {
            done();
          }
        } catch (e) {
          done();
        }
      }
      if (document.readyState === "complete") run();
      else window.addEventListener("load", run);
    })();
  <\/script>
</body>
</html>`;
}

function buildPrintableHtml() {
  return buildPreviewDocumentHtml();
}

let previewBlobUrl = null;

function resetPreviewScroll() {
  const outer = $("previewOuter");
  outer.scrollLeft = 0;
  outer.scrollTop = 0;
  const iframe = /** @type {HTMLIFrameElement} */ (document.getElementById("iframePreview"));
  if (!iframe) return;
  try {
    iframe.contentWindow?.scrollTo(0, 0);
    const d = iframe.contentDocument;
    if (d) {
      d.documentElement.scrollLeft = 0;
      d.documentElement.scrollTop = 0;
      if (d.body) {
        d.body.scrollLeft = 0;
        d.body.scrollTop = 0;
      }
    }
  } catch (_) {
    /* cross-origin */
  }
}

function refreshPreview() {
  const iframe = /** @type {HTMLIFrameElement} */ ($("iframePreview"));
  const placeholder = $("previewPlaceholder");

  if (!state.book) {
    iframe.classList.add("hidden");
    placeholder.classList.remove("hidden");
    return;
  }

  placeholder.classList.add("hidden");
  iframe.classList.remove("hidden");

  const html = buildPreviewDocumentHtml();
  if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
  previewBlobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));

  iframe.onload = () => {
    resetPreviewScroll();
    requestAnimationFrame(resetPreviewScroll);
  };
  iframe.src = previewBlobUrl;
}

function applyZoom() {
  const frame = $("previewFrameWrap");
  const z = state.zoom;
  frame.style.transform = "";
  frame.style.transformOrigin = "";
  frame.style.zoom = String(z);
  $("zoomPct").textContent = Math.round(z * 100) + "%";
}

function renderNav(book) {
  const mount = $("navScroll");
  mount.innerHTML = "";

  function renderGroup(section, title) {
    const list = book.sections[section] || [];
    const group = document.createElement("div");
    group.className = "rail-group";
    group.dataset.section = section;

    const head = document.createElement("div");
    head.className = "rail-group-header";
    head.innerHTML = `<span><span class="rail-caret">▼</span> ${escapeHtml(title)}</span><span style="opacity:.5">${list.length}</span>`;

    const body = document.createElement("div");
    body.className = "rail-group-body";

    head.addEventListener("click", () => {
      group.classList.toggle("collapsed");
      body.classList.toggle("collapsed");
    });

    list.forEach((ch, index) => {
      const id = navId(section, index);
      const row = document.createElement("div");
      row.className = "nav-item" + (state.activeNav === id ? " active" : "");
      const num = section === "body" ? String(index + 1) : "·";
      row.innerHTML = `<span class="nav-num">${escapeHtml(num)}</span><span class="nav-label">${escapeHtml(ch.title || "Untitled")}</span>`;
      row.addEventListener("click", e => {
        e.stopPropagation();
        state.activeNav = id;
        mount.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        row.classList.add("active");
        const iframe = /** @type {HTMLIFrameElement} */ ($("iframePreview"));
        try {
          const doc = iframe.contentDocument;
          const el = doc?.getElementById(id);
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (_) {}
      });
      body.appendChild(row);
    });

    group.appendChild(head);
    group.appendChild(body);
    mount.appendChild(group);
  }

  renderGroup("front", "Front matter");
  renderGroup("body", "Body");
  renderGroup("back", "Back matter");
}

function wirePanel() {
  const trim = $("optTrim");
  if (!TRIM_SIZES[state.trim]) state.trim = "6x9";
  trim.innerHTML = TRIM_ORDER.map(k => {
    const v = TRIM_SIZES[k];
    return `<option value="${escapeHtml(k)}">${escapeHtml(v.label)}</option>`;
  }).join("");
  trim.value = state.trim;
  trim.addEventListener("change", () => {
    state.trim = trim.value;
    refreshPreview();
  });

  const bodyFont = $("optBodyFont");
  bodyFont.innerHTML = Object.keys(BODY_FONTS)
    .map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`)
    .join("");
  bodyFont.value = state.bodyFont;
  bodyFont.addEventListener("change", () => {
    state.bodyFont = bodyFont.value;
    refreshPreview();
  });

  const headFont = $("optHeadingFont");
  headFont.innerHTML = `<option value="match">Match body</option>${Object.keys(HEADING_FONTS)
    .filter(k => k !== "match")
    .map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`)
    .join("")}`;
  headFont.value = state.headingFont;
  headFont.addEventListener("change", () => {
    state.headingFont = headFont.value;
    refreshPreview();
  });

  const size = $("optBodySize");
  size.value = String(state.bodySizePt);
  size.addEventListener("change", () => {
    state.bodySizePt = Number(size.value) || 11;
    refreshPreview();
  });

  const lh = $("optLineHeight");
  lh.value = String(state.lineHeight);
  lh.addEventListener("change", () => {
    state.lineHeight = Number(lh.value) || 1.45;
    refreshPreview();
  });

  const indent = $("optIndent");
  indent.value = state.paragraphIndent;
  indent.addEventListener("change", () => {
    state.paragraphIndent = indent.value;
    refreshPreview();
  });

  const margin = $("optMargin");
  margin.value = state.marginPreset;
  margin.addEventListener("change", () => {
    state.marginPreset = margin.value;
    refreshPreview();
  });

  const scene = $("optSceneBreak");
  scene.value = state.sceneBreak;
  scene.addEventListener("change", () => {
    state.sceneBreak = scene.value;
    refreshPreview();
  });

  const hf = $("optHeaderFooter");
  hf.value = state.headerFooter;
  hf.addEventListener("change", () => {
    state.headerFooter = hf.value;
    refreshPreview();
  });

  $("chkChapterPage").checked = state.chapterNewPage;
  $("chkChapterPage").addEventListener("change", () => {
    state.chapterNewPage = $("chkChapterPage").checked;
    refreshPreview();
  });

  $("chkDropCap").checked = state.dropCap;
  $("chkDropCap").addEventListener("change", () => {
    state.dropCap = $("chkDropCap").checked;
    refreshPreview();
  });

  $("chkPartLabels").checked = state.showPartLabels;
  $("chkPartLabels").addEventListener("change", () => {
    state.showPartLabels = $("chkPartLabels").checked;
    renderNav(state.book);
    refreshPreview();
  });

  const z = $("zoomSlider");
  z.value = String(state.zoom);
  z.addEventListener("input", () => {
    state.zoom = Number(z.value) || 0.9;
    applyZoom();
  });

  $("btnZoomOut").addEventListener("click", () => {
    state.zoom = Math.max(0.45, state.zoom - 0.06);
    z.value = String(state.zoom);
    applyZoom();
  });
  $("btnZoomIn").addEventListener("click", () => {
    state.zoom = Math.min(1.35, state.zoom + 0.06);
    z.value = String(state.zoom);
    applyZoom();
  });
  $("btnFitWidth").addEventListener("click", () => {
    const outer = $("previewOuter");
    const iw = outer.clientWidth - 32;
    const trim = TRIM_SIZES[state.trim] || TRIM_SIZES["6x9"];
    const inches = parseFloat(trim.width);
    const assumedPx = inches * 96;
    state.zoom = Math.min(1.35, Math.max(0.45, iw / assumedPx));
    z.value = String(state.zoom);
    applyZoom();
  });
}

function setStatus(text, isError = false) {
  const el = $("statusPill");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

async function loadBook(uid) {
  if (!bookId) {
    setStatus("No book in URL", true);
    $("topBookTitle").textContent = "No book selected";
    $("railWords").textContent = "—";
    return;
  }

  setStatus("Loading…");
  const snap = await getDoc(doc(db, "users", uid, "books", bookId));

  if (!snap.exists()) {
    setStatus("Book not found", true);
    $("topBookTitle").textContent = "Not found";
    $("railWords").textContent = "—";
    state.book = null;
    refreshPreview();
    return;
  }

  let book = normalizeBookData(snap.data());
  ensureStructure(book);
  state.book = book;

  $("topBookTitle").textContent = book.title || "Untitled";
  const tw = allChaptersFlat(book).reduce((s, ch) => s + countWords(ch.content || ""), 0);
  $("railWords").textContent = tw.toLocaleString();

  renderNav(book);
  refreshPreview();
  applyZoom();
  setStatus("Ready");
}

function openPrintWindow() {
  const html = buildPrintableHtml();
  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up blocked — allow pop-ups to print or save as PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.addEventListener("load", () => {
    setTimeout(() => {
      w.focus();
      w.print();
    }, 800);
  });
}

function init() {
  $("btnBack").addEventListener("click", () => {
    const q = bookId ? `?book=${encodeURIComponent(bookId)}` : "";
    window.location.href = "/editor.html" + q;
  });

  $("btnPrint").addEventListener("click", () => openPrintWindow());

  wirePanel();

  window.addEventListener("message", ev => {
    if (ev.data?.type === "alysum-pdf-pages") {
      const n = ev.data.count;
      $("pageInfo").textContent = n ? `${n} pages (preview)` : "Preview";
      resetPreviewScroll();
      requestAnimationFrame(resetPreviewScroll);
      setTimeout(resetPreviewScroll, 100);
    }
  });

  if (!bookId) {
    setStatus("Add ?book=… to the URL", true);
    $("topBookTitle").textContent = "No book selected";
    $("btnPrint").disabled = true;
    return;
  }

  onAuthStateChanged(auth, user => {
    if (!user) {
      window.location.href = "/login.html";
      return;
    }
    loadBook(user.uid).catch(err => {
      console.error(err);
      setStatus("Error loading", true);
    });
  });
}

init();
