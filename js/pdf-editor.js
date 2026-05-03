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
  "EB Garamond": "'EB Garamond', 'Times New Roman', Times, serif",
  "Libre Baskerville": "'Libre Baskerville', Georgia, serif",
  "Crimson Pro": "'Crimson Pro', Georgia, serif",
  Lora: "'Lora', Georgia, serif",
  Merriweather: "'Merriweather', Georgia, serif",
  Literata: "'Literata', Georgia, serif",
  "Source Serif 4": "'Source Serif 4', Georgia, serif",
  Georgia: "Georgia, serif"
};

const HEADING_FONTS = {
  match: "inherit",
  "EB Garamond": "'EB Garamond', 'Times New Roman', Times, serif",
  "Libre Baskerville": "'Libre Baskerville', Georgia, serif",
  "Crimson Pro": "'Crimson Pro', Georgia, serif",
  Lora: "'Lora', Georgia, serif",
  "Source Sans 3": "'Source Sans 3', system-ui, sans-serif"
};

/** @type {{ book: ReturnType<typeof normalizeBookData> | null, authorDisplay: string, printAuthorOverride: string, printCopyrightOverride: string, activeNav: string, zoom: number, trim: string, bodyFont: string, headingFont: string, bodySizePt: number, lineHeight: number, paragraphIndent: string, marginPreset: string, chapterNewPage: boolean, dropCap: boolean, headerFooter: string, showPartLabels: boolean }} */
const state = {
  book: null,
  authorDisplay: "",
  printAuthorOverride: "",
  printCopyrightOverride: "",
  activeNav: "",
  zoom: 1,
  trim: "6x9",
  bodyFont: "Literata",
  headingFont: "match",
  bodySizePt: 11,
  lineHeight: 1.52,
  paragraphIndent: "0.3in",
  marginPreset: "bn",
  chapterNewPage: true,
  dropCap: false,
  headerFooter: "title-page",
  showPartLabels: false
};

/** Outside (fore-edge) margin in inches — inner = this + gutter for mirror spreads. */
function marginOutsideInches() {
  switch (state.marginPreset) {
    case "tight":
      return 0.52;
    case "wide":
      return 0.92;
    case "bn":
      /* POD-safe outside; binding edge gets +gutter in @page:left / :right */
      return 0.7;
    default:
      return 0.68;
  }
}

function marginGutterInches() {
  return 0.16;
}

/** Uniform margin for @page :first (half-title / title spread) */
function marginFirstPageInches() {
  const o = marginOutsideInches();
  const g = marginGutterInches();
  return Math.max(0.78, o + g * 0.5);
}

/** CSS `content:` string for running heads — escape quotes and newlines */
function escapeCssContent(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
}

/**
 * Same-origin font faces for the Paged.js iframe / print document.
 * Do not load fonts.googleapis.com/css2 inside the blob — Paged.js re-fetches stylesheets via XHR,
 * which googleapis blocks (no Access-Control-Allow-Origin). gstatic font files are fine.
 */
function printFontStylesheetHref() {
  try {
    if (typeof location !== "undefined" && location.origin && location.protocol !== "file:") {
      return `${location.origin}/css/pdf-print-fontfaces.css`;
    }
  } catch (_) {
    /* ignore */
  }
  return "/css/pdf-print-fontfaces.css";
}

/** Fetched once; inlined into the blob/print HTML so Paged.js never XHRs fonts.googleapis.com (CORS). */
/** @type {string | undefined} */
let printFontFacesInlineCss = undefined;
/** @type {Promise<string> | null} */
let printFontFacesLoadPromise = null;

function ensurePrintFontFacesCss() {
  if (printFontFacesInlineCss !== undefined) {
    return Promise.resolve(printFontFacesInlineCss);
  }
  if (!printFontFacesLoadPromise) {
    const href = printFontStylesheetHref();
    printFontFacesLoadPromise = fetch(href, { credentials: "same-origin", cache: "force-cache" })
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(text => {
        printFontFacesInlineCss = text;
        return text;
      })
      .catch(err => {
        console.warn("alysum: could not load /css/pdf-print-fontfaces.css — using fallback fonts", err);
        printFontFacesInlineCss = "";
        return "";
      });
  }
  return printFontFacesLoadPromise;
}

function printFontHeadBlock() {
  if (printFontFacesInlineCss === undefined) {
    return `<link rel="stylesheet" href="${printFontStylesheetHref()}" />`;
  }
  if (!printFontFacesInlineCss) return "";
  const safe = printFontFacesInlineCss.replace(/<\/style/gi, "<\\/style");
  return `<style class="alysum-print-fontfaces">\n${safe}\n</style>`;
}

function navId(section, index) {
  return `ch-${section}-${index}`;
}

function printOverridesStorageKey() {
  return bookId ? `alysum-pdf-print-${bookId}` : "";
}

function loadPrintOverridesFromStorage() {
  state.printAuthorOverride = "";
  state.printCopyrightOverride = "";
  const key = printOverridesStorageKey();
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const o = JSON.parse(raw);
    state.printAuthorOverride = safeString(o.author, "");
    state.printCopyrightOverride = safeString(o.copyright, "");
  } catch (_) {
    /* ignore */
  }
}

function persistPrintOverrides() {
  const key = printOverridesStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        author: state.printAuthorOverride,
        copyright: state.printCopyrightOverride
      })
    );
  } catch (_) {
    /* quota / private mode */
  }
}

/** Plain-text copyright box → safe HTML paragraphs */
function plainCopyrightToHtml(text) {
  const raw = String(text).trim();
  if (!raw) return "";
  return raw
    .split(/\n\s*\n+/)
    .map(block => {
      const inner = escapeHtml(block.trim()).replace(/\n/g, "<br>");
      return `<p class="pdf-para">${inner}</p>`;
    })
    .join("");
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
 * Convert editor HTML (mostly div + br) into real paragraphs for print/PDF.
 */
function normalizeChapterBodyHtml(html) {
  const raw = String(html || "").trim();
  if (!raw) return '<p class="pdf-para"></p>';
  try {
    const doc = new DOMParser().parseFromString(`<div id="alysum-norm-root">${raw}</div>`, "text/html");
    const root = doc.getElementById("alysum-norm-root");
    if (!root) return `<p class="pdf-para">${raw}</p>`;
    normalizeDomBlocks(root, root.ownerDocument);
    return root.innerHTML;
  } catch (e) {
    console.warn("normalizeChapterBodyHtml", e);
    return `<p class="pdf-para">${raw}</p>`;
  }
}

function normalizeDomBlocks(container, doc) {
  const nodes = [...container.childNodes];
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = /** @type {Element} */ (node);
    const tag = el.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE") continue;
    if (["P", "UL", "OL", "BLOCKQUOTE", "TABLE", "H1", "H2", "H3", "H4", "HR", "PRE"].includes(tag)) {
      if (tag === "P" && !el.classList.contains("pdf-para")) el.classList.add("pdf-para");
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
        p.className = "pdf-para";
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
        p.className = "pdf-para";
        p.innerHTML = part.trim();
        frag.appendChild(p);
      }
      if (!frag.childNodes.length) {
        const p = doc.createElement("p");
        p.className = "pdf-para";
        el.replaceWith(p);
      } else {
        el.replaceWith(frag);
      }
    }
  }
}

function buildTitlePageSection(book) {
  const title = escapeHtml(book.title || "Untitled");
  const rawAuthor = (state.printAuthorOverride || "").trim() || safeString(state.authorDisplay, "").trim();
  const authorLine = rawAuthor
    ? `<p class="title-author">${escapeHtml(rawAuthor.toUpperCase())}</p>`
    : "";
  const rule = `<div class="title-page-rule" aria-hidden="true"></div>`;
  return `<article class="pdf-chapter pdf-title-page" id="pdf-title" data-section="title">
    <div class="title-page-inner">
      ${authorLine}
      ${rule}
      <h1 class="title-book">${title}</h1>
    </div>
  </article>`;
}

function tocLinkEntries(book) {
  const out = [];
  const front = book.sections.front || [];
  for (let i = 2; i < front.length; i++) {
    out.push({ id: navId("front", i), label: front[i].title || "Untitled" });
  }
  (book.sections.body || []).forEach((ch, i) => {
    out.push({ id: navId("body", i), label: ch.title || `Chapter ${i + 1}` });
  });
  (book.sections.back || []).forEach((ch, i) => {
    out.push({ id: navId("back", i), label: ch.title || "Untitled" });
  });
  return out;
}

function buildAutoTocSection(book) {
  const links = tocLinkEntries(book)
    .map(e => `<li><a href="#${e.id}">${escapeHtml(e.label)}</a></li>`)
    .join("");
  const tocBody = links
    ? `<nav class="pdf-toc" aria-label="Table of contents"><ol>${links}</ol></nav>`
    : `<p class="pdf-toc-empty">Chapters will appear here.</p>`;
  return `<article class="pdf-chapter pdf-toc-article" id="${navId(
    "front",
    1
  )}" data-section="front">
    <h1 class="pdf-h1">Contents</h1>
    ${tocBody}
  </article>`;
}

function buildChapterArticle(section, index, ch, opts = {}) {
  const { isCopyright } = opts;
  const id = navId(section, index);
  const partLabel =
    state.showPartLabels && (section === "front" || section === "back")
      ? `<div class="part-label">${section === "front" ? "Front matter" : "Back matter"}</div>`
      : "";
  const pageClass = state.chapterNewPage ? "chapter-start" : "";
  const extra = isCopyright ? " pdf-copyright-page" : "";
  const norm = normalizeChapterBodyHtml(ch.content);
  const proseClass = isCopyright ? "" : " pdf-chapter-prose";

  if (isCopyright) {
    const copyOverride = (state.printCopyrightOverride || "").trim();
    const copyHtml = copyOverride ? plainCopyrightToHtml(copyOverride) : norm;
    return `<article class="pdf-chapter ${pageClass}${extra}" id="${id}" data-section="${section}">
    ${partLabel}
    <div class="copyright-sheet">
      <div class="pdf-body copyright-body">${copyHtml}</div>
    </div>
  </article>`;
  }

  const h1Class = "pdf-h1";
  return `<article class="pdf-chapter ${pageClass}${extra}${proseClass}" id="${id}" data-section="${section}">
    ${partLabel}
    <h1 class="${h1Class}">${escapeHtml(ch.title || "Untitled")}</h1>
    <div class="pdf-body ${state.dropCap ? "drop-cap" : ""}">${norm}</div>
  </article>`;
}

function buildManuscriptBodyHtml(book) {
  const parts = [];

  parts.push(buildTitlePageSection(book));

  const front = book.sections.front || [];
  if (front[0]) {
    parts.push(buildChapterArticle("front", 0, front[0], { isCopyright: true }));
  }
  parts.push(buildAutoTocSection(book));
  for (let i = 2; i < front.length; i++) {
    parts.push(buildChapterArticle("front", i, front[i], {}));
  }

  const bodyList = book.sections.body || [];
  bodyList.forEach((ch, index) => {
    parts.push(buildChapterArticle("body", index, ch, {}));
  });

  const backList = book.sections.back || [];
  backList.forEach((ch, index) => {
    parts.push(buildChapterArticle("back", index, ch, {}));
  });

  /* No auto * * * between chapters — page breaks already separate them; ornaments belong in the manuscript. */
  return parts.join("\n");
}

function headingFontCss() {
  if (state.headingFont === "match") {
    return BODY_FONTS[state.bodyFont] || BODY_FONTS["Literata"];
  }
  return HEADING_FONTS[state.headingFont] || BODY_FONTS["Literata"];
}

function atPageCssBlock() {
  const trim = TRIM_SIZES[state.trim] || TRIM_SIZES["6x9"];
  const out = marginOutsideInches();
  const g = marginGutterInches();
  const inner = out + g;
  const firstM = marginFirstPageInches();
  const tout = `${out.toFixed(2)}in`;
  /** Same left & right so the type column sits on the page center (mirror gutters shift verso/recto off-center in preview). */
  const hSym = `${((out + inner) / 2).toFixed(3)}in`;
  const tfirst = `${firstM.toFixed(2)}in`;
  const bookTitleEsc = escapeCssContent(state.book?.title || "Manuscript");
  const runStack = BODY_FONTS[state.bodyFont] || BODY_FONTS["Literata"];
  let marginBoxes = "";
  if (state.headerFooter === "title") {
    marginBoxes = `@top-center { content: "${bookTitleEsc}"; font-size: 8pt; font-weight: 500; color: #6b6967; font-family: ${runStack}; font-variant: all-small-caps; letter-spacing: 0.14em; }`;
  } else if (state.headerFooter === "title-page") {
    marginBoxes = `@top-center { content: "${bookTitleEsc}"; font-size: 8pt; font-weight: 500; color: #6b6967; font-family: ${runStack}; font-variant: all-small-caps; letter-spacing: 0.14em; }
      @bottom-center { content: counter(page); font-size: 8.75pt; font-weight: 500; color: #5c5a58; font-family: ${runStack}; font-variant-numeric: oldstyle-nums; letter-spacing: 0.02em; }`;
  } else if (state.headerFooter === "page") {
    marginBoxes = `@bottom-center { content: counter(page); font-size: 8.75pt; font-weight: 500; color: #5c5a58; font-family: ${runStack}; font-variant-numeric: oldstyle-nums; letter-spacing: 0.02em; }`;
  }
  /*
   * One @page rule (no :left/:right) so every sheet gets the same margin math.
   * Paged.js also sets --pagedjs-margin-left/right per page — force them to match,
   * otherwise the polyfill can keep asymmetric gutters and the type block sits off-center.
   */
  return `@page {
    size: ${trim.width} ${trim.height};
    margin: ${tout} ${hSym} ${tout} ${hSym};
    ${marginBoxes}
  }
  @page :first {
    margin: ${tfirst};
    ${marginBoxes}
  }
  .pagedjs_page {
    --pagedjs-margin-left: ${hSym} !important;
    --pagedjs-margin-right: ${hSym} !important;
  }
  .pagedjs_page.pagedjs_first_page {
    --pagedjs-margin-left: ${tfirst} !important;
    --pagedjs-margin-right: ${tfirst} !important;
  }`;
}

/**
 * @param {{ forPrint?: boolean }} [options]
 */
function buildPreviewDocumentHtml(options = {}) {
  const forPrint = Boolean(options.forPrint);
  const book = state.book;
  if (!book) return "";

  const trim = TRIM_SIZES[state.trim] || TRIM_SIZES["6x9"];
  const bodyFont = BODY_FONTS[state.bodyFont] || BODY_FONTS["Literata"];
  const hFont = headingFontCss();

  const inner = buildManuscriptBodyHtml(book);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  ${printFontHeadBlock()}
  <style>
    ${atPageCssBlock()}
    :root {
      --trim-w: ${trim.width};
      --trim-h: ${trim.height};
      --ink: #1c1b1a;
      --ink-soft: #3d3c3a;
      --rule: rgba(28, 27, 26, 0.14);
      --paper-print: #fffefc;
      --paper-screen: #faf8f5;
    }
    html { font-size: ${state.bodySizePt}pt; }
    body {
      margin: 0;
      font-family: ${bodyFont};
      line-height: ${state.lineHeight};
      color: var(--ink);
      background: var(--paper-screen);
      text-rendering: optimizeLegibility;
      font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
      font-variant-numeric: oldstyle-nums;
      -webkit-font-smoothing: antialiased;
      font-kerning: normal;
    }
    @media print {
      body { background: #fff !important; color: #000 !important; }
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
        background: #dfe5e8;
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
        gap: 20px !important;
        padding: 16px 10px 32px !important;
        margin: 0 auto !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      .pagedjs_page {
        margin: 0 auto !important;
        float: none !important;
        box-sizing: border-box !important;
        background: linear-gradient(180deg, #fffefc 0%, #faf8f4 100%) !important;
        border: 1px solid rgba(28, 27, 26, 0.06) !important;
        border-radius: 1px !important;
        box-shadow:
          0 1px 1px rgba(28, 27, 26, 0.04),
          0 8px 24px rgba(28, 27, 26, 0.07),
          0 24px 48px rgba(28, 27, 26, 0.06) !important;
      }
    }
    .part-label {
      font-family: ${bodyFont};
      font-size: 7.5pt;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      font-variant: all-small-caps;
      color: #7a7876;
      margin-bottom: 0.85rem;
    }
    /* Do not use break-inside:avoid on whole chapters — it glues title+TOC+text onto one sheet in print. */
    .pdf-title-page,
    .pdf-copyright-page,
    .pdf-toc-article {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .pdf-chapter.chapter-start {
      break-before: page;
      page-break-before: always;
    }
    .pdf-title-page {
      break-before: auto;
      page-break-before: auto;
    }
    .pdf-chapter:first-of-type {
      break-before: auto;
      page-break-before: auto;
    }
    .pdf-title-page {
      break-after: page;
      page-break-after: always;
    }
    .pdf-copyright-page {
      break-before: page;
      page-break-before: always;
      break-after: page;
      page-break-after: always;
    }
    .pdf-toc-article {
      break-before: page;
      page-break-before: always;
      break-after: page;
      page-break-after: always;
    }
    /* TOC already ends with a page break; drop duplicate break-before on the next chapter. */
    .pdf-toc-article + .pdf-chapter.chapter-start {
      break-before: auto;
      page-break-before: auto;
    }
    .pdf-h1 {
      font-family: ${hFont};
      font-size: 1.2rem;
      font-weight: 600;
      margin: 0 0 1rem;
      line-height: 1.28;
    }
    .pdf-title-page {
      min-height: var(--trim-h, 9in);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 0 11%;
      box-sizing: border-box;
    }
    .pdf-title-page .title-page-inner {
      width: 100%;
      max-width: 28rem;
      padding-top: 26%;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .pdf-title-page .title-author {
      font-family: ${bodyFont};
      font-size: 10.5pt;
      font-weight: 600;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      font-variant: normal;
      margin: 0 0 1.75rem;
      color: var(--ink-soft);
    }
    .pdf-title-page .title-page-rule {
      width: 3.25rem;
      height: 1px;
      background: var(--rule);
      margin: 0 0 1.75rem;
    }
    .pdf-title-page .title-book {
      font-family: ${hFont};
      font-size: 2.65rem;
      font-weight: 400;
      margin: 0;
      line-height: 1.05;
      letter-spacing: 0.008em;
      color: var(--ink);
    }
    .pdf-copyright-page {
      min-height: calc(0.88 * var(--trim-h, 9in));
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 0 12% 12vh;
      box-sizing: border-box;
    }
    .pdf-copyright-page .copyright-sheet {
      width: 100%;
    }
    .pdf-copyright-page .copyright-body {
      font-size: 9.25pt;
      line-height: 1.62;
      text-align: center;
      color: var(--ink-soft);
    }
    .pdf-copyright-page .copyright-body p,
    .pdf-copyright-page .copyright-body p.pdf-para {
      text-indent: 0 !important;
      text-align: center !important;
      margin: 0 0 0.85em;
    }
    .pdf-copyright-page .copyright-body p:first-of-type,
    .pdf-copyright-page .copyright-body p.pdf-para:first-of-type {
      font-style: italic;
      margin-bottom: 1.1em;
    }
    .pdf-chapter-prose .pdf-h1 {
      text-align: center;
      font-weight: 400;
      font-size: 1.72rem;
      letter-spacing: 0.06em;
      text-transform: none;
      margin: 20vh 0 0;
      line-height: 1.2;
      color: var(--ink);
      font-variant-numeric: lining-nums;
      font-feature-settings: "kern" 1, "liga" 1;
    }
    .pdf-chapter-prose .pdf-h1::after {
      content: "";
      display: block;
      width: 2.5rem;
      height: 1px;
      margin: 1.15rem auto 2.45rem;
      background: var(--rule);
    }
    .pdf-chapter-prose .pdf-body {
      hyphens: auto;
      -webkit-hyphens: auto;
      hyphenate-limit-chars: 10 4 3;
      hyphenate-limit-lines: 2;
      text-wrap: pretty;
    }
    .pdf-toc-article .pdf-h1 {
      text-align: center;
      font-weight: 600;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.28em;
      margin: 3.5rem 0 2rem;
      color: var(--ink-soft);
      font-variant: all-small-caps;
    }
    .pdf-toc {
      padding: 0 0.08in;
      max-width: 100%;
    }
    .pdf-toc ol {
      list-style: none;
      padding: 0;
      margin: 0;
      font-family: ${bodyFont};
    }
    .pdf-toc li {
      margin: 0.55rem 0;
      line-height: 1.55;
      font-size: 0.98rem;
      break-inside: avoid;
    }
    .pdf-toc a {
      color: inherit !important;
      text-decoration: none !important;
      -webkit-text-fill-color: inherit;
    }
    .pdf-toc a:link,
    .pdf-toc a:visited {
      color: inherit !important;
    }
    .pdf-toc a::after {
      content: leader('.') target-counter(attr(href url), page);
      font-variant-numeric: oldstyle-nums;
      color: #6e6c6a;
      font-size: 0.96em;
    }
    @media print {
      body,
      .pdf-chapter-prose {
        color: #000 !important;
      }
      .pdf-toc a,
      .pdf-toc a:link,
      .pdf-toc a:visited {
        color: #000 !important;
        text-decoration: none !important;
      }
      .pdf-body p,
      .pdf-body p.pdf-para {
        text-align: justify;
        text-indent: ${state.paragraphIndent};
      }
      .pdf-chapter-prose .pdf-body > p:first-child,
      .pdf-chapter-prose .pdf-body > p.pdf-para:first-child {
        text-indent: ${state.paragraphIndent};
      }
    }
    .pdf-toc-empty {
      font-style: italic;
      color: #94a3b8;
      margin-top: 0.5rem;
    }
    /* Normalized paragraphs + legacy div/p from editor */
    .pdf-body p,
    .pdf-body p.pdf-para,
    .pdf-body div:not(.scene-break):not(.scene-spacer) {
      margin: 0 0 0.32em;
      text-align: justify;
      text-indent: ${state.paragraphIndent};
      orphans: 2;
      widows: 3;
      hanging-punctuation: first last;
    }
    /* TOC placeholder only — prose chapters indent every paragraph including the first (trade fiction). */
    .pdf-toc-article .pdf-body > p:first-child,
    .pdf-toc-article .pdf-body > p.pdf-para:first-child {
      text-indent: 0;
    }
    .pdf-chapter-prose .pdf-body > p:first-child,
    .pdf-chapter-prose .pdf-body > p.pdf-para:first-child {
      text-indent: ${state.paragraphIndent};
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
    .pdf-body li div,
    .pdf-body li p.pdf-para {
      text-indent: 0;
      margin: 0.15em 0;
    }
    .drop-cap .pdf-body > p:first-of-type::first-letter,
    .drop-cap .pdf-body > p.pdf-para:first-of-type::first-letter,
    .drop-cap .pdf-body > div:first-of-type::first-letter {
      float: left;
      font-size: 3.1rem;
      line-height: 0.82;
      font-weight: 400;
      padding-right: 0.06em;
      margin-top: 0.06em;
      color: var(--ink);
    }
    .pdf-body h2, .pdf-body h3 { font-family: ${hFont}; margin: 1.2em 0 0.5em; }
    .pdf-body blockquote {
      margin: 1em 1.15em;
      font-style: italic;
      color: #4a4a4a;
    }
    .pdf-body blockquote p,
    .pdf-body blockquote div {
      text-indent: 0;
    }
    .scene-break {
      text-align: center;
      letter-spacing: 0.42em;
      margin: 1.65em 0;
      color: #8a8886;
      font-size: 0.88rem;
      font-weight: 300;
      border: none;
      page-break-inside: avoid;
    }
    .scene-spacer { visibility: hidden; height: 2.75em; }
    .scene-rule {
      width: 18%;
      margin: 1.65em auto;
      border: none;
      border-top: 1px solid rgba(28, 27, 26, 0.12);
    }
  </style>
</head>
<body>
  <div id="manuscript-root">${inner}</div>
  <script src="https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.polyfill.js"><\/script>
  <script>
    (function () {
      var __ALYSUM_PRINT__ = ${forPrint ? "true" : "false"};
      var __alysumPrintScheduled = false;
      function done() {
        try {
          window.parent.postMessage({ type: "alysum-pdf-pages", count: document.querySelectorAll(".pagedjs_page").length }, "*");
        } catch (e) {}
        if (typeof __ALYSUM_PRINT__ !== "undefined" && __ALYSUM_PRINT__ && !__alysumPrintScheduled) {
          __alysumPrintScheduled = true;
          try {
            document.__alysumPrintFired = true;
          } catch (e2) {}
          setTimeout(function () {
            try {
              window.focus();
              window.print();
            } catch (err) {}
          }, 650);
        }
      }
      function runPaged() {
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
      /* Defer one frame so layout/DOM is stable; reduces Paged.js "item doesn't belong to list" races in iframes */
      function run() {
        requestAnimationFrame(function () {
          requestAnimationFrame(runPaged);
        });
      }
      if (document.readyState === "complete") run();
      else window.addEventListener("load", run);
    })();
  <\/script>
</body>
</html>`;
}

function buildPrintableHtml() {
  return buildPreviewDocumentHtml({ forPrint: true });
}

let previewBlobUrl = null;
/** After Paged.js lays out, fit page width to the preview column once. */
let fitPreviewAfterPaged = false;

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

  ensurePrintFontFacesCss().then(() => {
    const html = buildPreviewDocumentHtml();
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    previewBlobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));

    fitPreviewAfterPaged = true;
    iframe.onload = () => {
      resetPreviewScroll();
    };
    iframe.src = previewBlobUrl;
  });
}

function autoFitPreviewToColumn() {
  const outer = document.getElementById("previewOuter");
  const zSlider = document.getElementById("zoomSlider");
  if (!outer || !TRIM_SIZES[state.trim]) return;
  const iw = Math.max(240, outer.clientWidth - 20);
  const trim = TRIM_SIZES[state.trim];
  const pagePx = parseFloat(trim.width) * 96;
  if (!pagePx) return;
  state.zoom = Math.min(1.35, Math.max(0.45, iw / pagePx));
  if (zSlider) zSlider.value = String(state.zoom);
  applyZoom();
}

/** Zoom target: current layout uses #previewFrameWrap; older builds used #previewScaleWrap. */
function previewZoomTarget() {
  return document.getElementById("previewFrameWrap") || document.getElementById("previewScaleWrap");
}

function applyZoom() {
  const z = state.zoom;
  const frame = previewZoomTarget();
  if (frame) {
    try {
      frame.style.transform = "";
      frame.style.transformOrigin = "";
      frame.style.zoom = String(z);
    } catch (_) {
      frame.style.zoom = "";
    }
  }
  const pct = document.getElementById("zoomPct");
  if (pct) pct.textContent = Math.round(z * 100) + "%";
}

function scrollPreviewTo(elementId) {
  const iframe = /** @type {HTMLIFrameElement} */ (document.getElementById("iframePreview"));
  try {
    iframe?.contentDocument?.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (_) {}
}

function renderNav(book) {
  const mount = $("navScroll");
  mount.innerHTML = "";

  const openGroup = document.createElement("div");
  openGroup.className = "rail-group";
  const openHead = document.createElement("div");
  openHead.className = "rail-group-header";
  openHead.innerHTML = `<span><span class="rail-caret">▼</span> Opening</span><span> </span>`;
  const openBody = document.createElement("div");
  openBody.className = "rail-group-body";
  const titleRow = document.createElement("div");
  titleRow.className = "nav-item";
  titleRow.innerHTML = `<span class="nav-num"> </span><span class="nav-label">Title page</span>`;
  titleRow.addEventListener("click", e => {
    e.stopPropagation();
    scrollPreviewTo("pdf-title");
  });
  openBody.appendChild(titleRow);
  openHead.addEventListener("click", () => {
    openGroup.classList.toggle("collapsed");
    openBody.classList.toggle("collapsed");
  });
  openGroup.appendChild(openHead);
  openGroup.appendChild(openBody);
  mount.appendChild(openGroup);

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
        scrollPreviewTo(id);
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
  try {
    const snap = await getDoc(doc(db, "users", uid, "books", bookId));

    if (!snap.exists()) {
      setStatus("Book not found", true);
      $("topBookTitle").textContent = "Not found";
      $("railWords").textContent = "—";
      state.book = null;
      refreshPreview();
      return;
    }

    const book = normalizeBookData(snap.data());
    ensureStructure(book);
    state.book = book;

    state.authorDisplay = "";
    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const u = userSnap.data();
        state.authorDisplay =
          safeString(u.username, "").trim() ||
          safeString(u.displayName, "").trim() ||
          safeString(u.name, "").trim() ||
          safeString(u.penName, "").trim();
      }
    } catch (_) {
      state.authorDisplay = "";
    }
    if (!state.authorDisplay && auth.currentUser?.displayName) {
      state.authorDisplay = String(auth.currentUser.displayName).trim();
    }

    loadPrintOverridesFromStorage();
    const pa = document.getElementById("printAuthorInput");
    const pc = document.getElementById("printCopyrightInput");
    if (pa) pa.value = state.printAuthorOverride;
    if (pc) pc.value = state.printCopyrightOverride;

    $("topBookTitle").textContent = book.title || "Untitled";
    const tw = allChaptersFlat(book).reduce((s, ch) => s + countWords(ch.content || ""), 0);
    $("railWords").textContent = tw.toLocaleString();

    renderNav(book);
    refreshPreview();
    applyZoom();
    setStatus("Ready");
  } catch (err) {
    console.error(err);
    state.book = null;
    state.authorDisplay = "";
    refreshPreview();
    const code = err && typeof err === "object" && "code" in err ? err.code : "";
    let msg = "Could not load book.";
    if (code === "permission-denied") {
      msg = "No permission to read this book (check Firestore rules).";
    } else if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
      msg = err.message;
    }
    setStatus(msg.length > 140 ? msg.slice(0, 137) + "…" : msg, true);
    $("topBookTitle").textContent = "Error";
    $("railWords").textContent = "—";
  }
}

async function openPrintWindow() {
  await ensurePrintFontFacesCss();
  const html = buildPrintableHtml();
  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up blocked — allow pop-ups to print or save as PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  /* Print runs after Paged.js finishes (see __ALYSUM_PRINT__ in document). Fallback if script never fires. */
  setTimeout(function () {
    try {
      if (w.document.querySelector(".pagedjs_page") && !w.document.__alysumPrintFired) {
        w.document.__alysumPrintFired = true;
        w.focus();
        w.print();
      }
    } catch (e) {}
  }, 12000);
}

function wirePrintOverrideInputs() {
  const authorIn = document.getElementById("printAuthorInput");
  const copyIn = document.getElementById("printCopyrightInput");
  if (!authorIn || !copyIn) return;
  let debounce = null;
  const flush = () => {
    state.printAuthorOverride = authorIn.value;
    state.printCopyrightOverride = copyIn.value;
    persistPrintOverrides();
    if (state.book) refreshPreview();
  };
  const schedule = () => {
    clearTimeout(debounce);
    debounce = setTimeout(flush, 450);
  };
  authorIn.addEventListener("input", schedule);
  copyIn.addEventListener("input", schedule);
}

function init() {
  $("btnBack").addEventListener("click", () => {
    const q = bookId ? `?book=${encodeURIComponent(bookId)}` : "";
    window.location.href = "/editor.html" + q;
  });

  $("btnPrint").addEventListener("click", () => {
    openPrintWindow().catch(e => {
      console.error(e);
      alert("Could not prepare fonts for printing. Check your connection and try again.");
    });
  });

  try {
    wirePanel();
  } catch (e) {
    console.error(e);
    setStatus("Typesetting panel failed to init — hard refresh (Ctrl+F5)", true);
  }

  wirePrintOverrideInputs();
  ensurePrintFontFacesCss().catch(() => {});

  window.addEventListener("message", ev => {
    if (ev.data?.type === "alysum-pdf-pages") {
      const n = ev.data.count;
      $("pageInfo").textContent = n ? `${n} pages (preview)` : "Preview";
      if (fitPreviewAfterPaged) {
        fitPreviewAfterPaged = false;
        requestAnimationFrame(() => {
          autoFitPreviewToColumn();
          resetPreviewScroll();
        });
      }
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
    loadBook(user.uid);
  });
}

init();
