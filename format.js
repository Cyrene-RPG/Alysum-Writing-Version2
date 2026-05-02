import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const bookId = params.get("book");

let currentUser = null;
let currentBook = null;

const PRESETS = {
  /** Reedsy Studio trim names (sizes match their formatter). */
  reedsy_pocket: {
    trim: "mass_market",
    insideMargin: "0.7in",
    outsideMargin: "0.45in",
    topMargin: "0.6in",
    bottomMargin: "0.6in",
    font: "Georgia",
    fontSize: "9.75",
    lineHeight: "1.45",
    alignment: "justify",
    paragraphIndent: "1.25em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  reedsy_standard: {
    trim: "5x8",
    insideMargin: "0.88in",
    outsideMargin: "0.6in",
    topMargin: "0.75in",
    bottomMargin: "0.75in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.6",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  reedsy_digest: {
    trim: "5_5x8_5",
    insideMargin: "0.9in",
    outsideMargin: "0.62in",
    topMargin: "0.78in",
    bottomMargin: "0.78in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.58",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  reedsy_trade: {
    trim: "6x9",
    insideMargin: "0.95in",
    outsideMargin: "0.65in",
    topMargin: "0.8in",
    bottomMargin: "0.8in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.58",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  bn_5x8: {
    trim: "5x8",
    insideMargin: "0.95in",
    outsideMargin: "0.6in",
    topMargin: "0.75in",
    bottomMargin: "0.75in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.6",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  kdp_5x8: {
    trim: "5x8",
    insideMargin: "0.95in",
    outsideMargin: "0.6in",
    topMargin: "0.75in",
    bottomMargin: "0.75in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.6",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  kdp_5_25x8: {
    trim: "5_25x8",
    insideMargin: "0.95in",
    outsideMargin: "0.6in",
    topMargin: "0.75in",
    bottomMargin: "0.75in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.6",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  kdp_5_5x8_5: {
    trim: "5_5x8_5",
    insideMargin: "0.95in",
    outsideMargin: "0.6in",
    topMargin: "0.75in",
    bottomMargin: "0.75in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.6",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  kdp_6x9: {
    trim: "6x9",
    insideMargin: "0.95in",
    outsideMargin: "0.65in",
    topMargin: "0.8in",
    bottomMargin: "0.8in",
    font: "Georgia",
    fontSize: "11",
    lineHeight: "1.58",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  a5: {
    trim: "a5",
    insideMargin: "0.85in",
    outsideMargin: "0.55in",
    topMargin: "0.7in",
    bottomMargin: "0.7in",
    font: "Georgia",
    fontSize: "10.5",
    lineHeight: "1.55",
    alignment: "justify",
    paragraphIndent: "1.5em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  },
  mass_market: {
    trim: "mass_market",
    insideMargin: "0.7in",
    outsideMargin: "0.45in",
    topMargin: "0.6in",
    bottomMargin: "0.6in",
    font: "Georgia",
    fontSize: "9.75",
    lineHeight: "1.45",
    alignment: "justify",
    paragraphIndent: "1.25em",
    paragraphSpacing: "0",
    chapterStart: "new-page"
  }
};

const TRIM_MAP = {
  mass_market: { width: "4.25in", height: "6.87in", label: "Pocket — 4.25 × 6.87 in" },
  "5x8": { width: "5in", height: "8in", label: "Reedsy — 5 × 8 in" },
  "5_25x8": { width: "5.25in", height: "8in", label: "5.25 × 8 in" },
  "5_5x8_5": { width: "5.5in", height: "8.5in", label: "Digest — 5.5 × 8.5 in" },
  "6x9": { width: "6in", height: "9in", label: "Trade — 6 × 9 in" },
  a5: { width: "148mm", height: "210mm", label: "A5 — 148 × 210 mm" }
};

/** Same-origin `/api` when hosted (Firebase rewrite → Cloud Run); local file → dev server. */
function defaultExporterBase() {
  if (typeof window === "undefined" || !window.location) return "http://localhost:8787/api";
  if (window.location.protocol === "file:") return "http://localhost:8787/api";
  return new URL("/api", window.location.origin).href.replace(/\/+$/, "");
}

const state = {
  exporterUrl: "",
  theme: "classic",
  preset: "reedsy_standard",
  trim: "5x8",
  insideMargin: "0.88in",
  outsideMargin: "0.6in",
  topMargin: "0.75in",
  bottomMargin: "0.75in",
  font: "Georgia",
  fontSize: "11",
  lineHeight: "1.6",
  alignment: "justify",
  paragraphIndent: "1.5em",
  paragraphSpacing: "0",
  chapterStart: "new-page",
  includeFrontMatter: true,
  includeBackMatter: true,
  includeTOC: true,
  showHeaders: true,
  showPageNumbers: true,
  romanFrontMatter: true,
  zoom: 1
};

const el = {
  body: document.body,
  sidebar: document.getElementById("sidebar"),
  overlay: document.getElementById("overlay"),
  presetSelect: document.getElementById("presetSelect"),
  applyPresetBtn: document.getElementById("applyPresetBtn"),
  exporterUrlInput: document.getElementById("exporterUrlInput"),
  themeSelect: document.getElementById("themeSelect"),
  trimSize: document.getElementById("trimSize"),
  chapterStartSelect: document.getElementById("chapterStartSelect"),
  insideMarginInput: document.getElementById("insideMarginInput"),
  outsideMarginInput: document.getElementById("outsideMarginInput"),
  topMarginInput: document.getElementById("topMarginInput"),
  bottomMarginInput: document.getElementById("bottomMarginInput"),
  fontSelect: document.getElementById("fontSelect"),
  fontSizeSelect: document.getElementById("fontSizeSelect"),
  lineHeightSelect: document.getElementById("lineHeightSelect"),
  alignmentSelect: document.getElementById("alignmentSelect"),
  paragraphIndentInput: document.getElementById("paragraphIndentInput"),
  paragraphSpacingInput: document.getElementById("paragraphSpacingInput"),
  includeFrontMatterToggle: document.getElementById("includeFrontMatterToggle"),
  includeBackMatterToggle: document.getElementById("includeBackMatterToggle"),
  includeTOCToggle: document.getElementById("includeTOCToggle"),
  showHeadersToggle: document.getElementById("showHeadersToggle"),
  showPageNumbersToggle: document.getElementById("showPageNumbersToggle"),
  romanFrontMatterToggle: document.getElementById("romanFrontMatterToggle"),
  renderBtn: document.getElementById("renderBtn"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  exportHtmlBtn: document.getElementById("exportHtmlBtn"),
  statusText: document.getElementById("statusText"),
  pageCountValue: document.getElementById("pageCountValue"),
  wordCountValue: document.getElementById("wordCountValue"),
  trimLabelValue: document.getElementById("trimLabelValue"),
  bookTitle: document.getElementById("bookTitle"),
  bookSubtitle: document.getElementById("bookSubtitle"),
  topbarBookTitle: document.getElementById("topbarBookTitle"),
  zoomSelect: document.getElementById("zoomSelect"),
  previewViewport: document.getElementById("previewViewport"),
  preview: document.getElementById("preview"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  toggleSidebarBtn: document.getElementById("toggleSidebarBtn"),
  pageTemplate: document.getElementById("pageTemplate")
};

function setStatus(text) {
  el.statusText.textContent = text;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBook(raw = {}) {
  const normalizeChapter = (chapter, fallbackTitle) => ({
    id: typeof chapter?.id === "string" ? chapter.id : crypto.randomUUID(),
    title: typeof chapter?.title === "string" && chapter.title.trim() ? chapter.title.trim() : fallbackTitle,
    content: typeof chapter?.content === "string" ? chapter.content : ""
  });

  const sections = raw.sections && typeof raw.sections === "object" ? raw.sections : {};

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled Book",
    author: typeof raw.author === "string" && raw.author.trim() ? raw.author.trim() : "Author",
    sections: {
      front: Array.isArray(sections.front)
        ? sections.front.map((ch, i) => normalizeChapter(ch, i === 0 ? "Title Page" : `Front Matter ${i + 1}`))
        : [],
      body: Array.isArray(sections.body)
        ? sections.body.map((ch, i) => normalizeChapter(ch, `Chapter ${i + 1}`))
        : [],
      back: Array.isArray(sections.back)
        ? sections.back.map((ch, i) => normalizeChapter(ch, `Back Matter ${i + 1}`))
        : []
    }
  };
}

function htmlToPlainText(html = "") {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function countWordsInHtml(html = "") {
  const txt = htmlToPlainText(html);
  return txt ? txt.split(/\s+/).length : 0;
}

function getWordCount(book) {
  const all = [
    ...(book.sections.front || []),
    ...(book.sections.body || []),
    ...(book.sections.back || [])
  ];
  return all.reduce((sum, ch) => sum + countWordsInHtml(ch.content), 0);
}

function normalizeContentHtml(html = "") {
  return String(html)
    .replace(/<div(\s|>)/gi, "<p$1")
    .replace(/<\/div>/gi, "</p>")
    .replace(/\*\s*\*\s*\*/g, '<p class="scene-break">* * *</p>')
    .replace(/<p>\s*<\/p>/g, "");
}

function updateTrimLabel() {
  el.trimLabelValue.textContent = TRIM_MAP[state.trim]?.label || state.trim;
}

function updateZoom() {
  el.preview.style.setProperty("--preview-scale", String(state.zoom));
}

function syncControlsFromState() {
  el.exporterUrlInput.value = state.exporterUrl;
  el.themeSelect.value = state.theme;
  el.presetSelect.value = state.preset;
  el.trimSize.value = state.trim;
  el.chapterStartSelect.value = state.chapterStart;
  el.insideMarginInput.value = state.insideMargin;
  el.outsideMarginInput.value = state.outsideMargin;
  el.topMarginInput.value = state.topMargin;
  el.bottomMarginInput.value = state.bottomMargin;
  el.fontSelect.value = state.font;
  el.fontSizeSelect.value = state.fontSize;
  el.lineHeightSelect.value = state.lineHeight;
  el.alignmentSelect.value = state.alignment;
  el.paragraphIndentInput.value = state.paragraphIndent;
  el.paragraphSpacingInput.value = state.paragraphSpacing;
  el.includeFrontMatterToggle.checked = state.includeFrontMatter;
  el.includeBackMatterToggle.checked = state.includeBackMatter;
  el.includeTOCToggle.checked = state.includeTOC;
  el.showHeadersToggle.checked = state.showHeaders;
  el.showPageNumbersToggle.checked = state.showPageNumbers;
  el.romanFrontMatterToggle.checked = state.romanFrontMatter;
  el.zoomSelect.value = String(state.zoom);
  updateTrimLabel();
  updateZoom();
}

function syncStateFromControls() {
  state.exporterUrl = el.exporterUrlInput.value.trim();
  state.theme = el.themeSelect.value || "classic";
  state.preset = el.presetSelect.value;
  state.trim = el.trimSize.value;
  state.chapterStart = el.chapterStartSelect.value;
  state.insideMargin = el.insideMarginInput.value.trim() || "0.95in";
  state.outsideMargin = el.outsideMarginInput.value.trim() || "0.6in";
  state.topMargin = el.topMarginInput.value.trim() || "0.75in";
  state.bottomMargin = el.bottomMarginInput.value.trim() || "0.75in";
  state.font = el.fontSelect.value;
  state.fontSize = el.fontSizeSelect.value;
  state.lineHeight = el.lineHeightSelect.value;
  state.alignment = el.alignmentSelect.value;
  state.paragraphIndent = el.paragraphIndentInput.value.trim() || "1.5em";
  state.paragraphSpacing = el.paragraphSpacingInput.value.trim() || "0";
  state.includeFrontMatter = el.includeFrontMatterToggle.checked;
  state.includeBackMatter = el.includeBackMatterToggle.checked;
  state.includeTOC = el.includeTOCToggle.checked;
  state.showHeaders = el.showHeadersToggle.checked;
  state.showPageNumbers = el.showPageNumbersToggle.checked;
  state.romanFrontMatter = el.romanFrontMatterToggle.checked;
  state.zoom = Number(el.zoomSelect.value) || 1;
  updateTrimLabel();
  updateZoom();
}

function applyPreset(name) {
  state.preset = name;
  if (name === "custom") {
    syncControlsFromState();
    renderBook();
    return;
  }
  const preset = PRESETS[name];
  if (!preset) return;
  Object.assign(state, preset);
  syncControlsFromState();
  renderBook();
}

function buildPdfCss() {
  const trim = TRIM_MAP[state.trim] || TRIM_MAP["5x8"];
  const top = state.topMargin;
  const bottom = state.bottomMargin;
  const inside = state.insideMargin;
  const outside = state.outsideMargin;

  const themeVars = (() => {
    switch (state.theme) {
      case "modern":
        return `
          --heading-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
          --body-font: ${state.font}, "Times New Roman", serif;
          --chapter-title-size: 17pt;
          --title-size: 30pt;
        `;
      case "serif_minimal":
        return `
          --heading-font: ${state.font}, "Times New Roman", serif;
          --body-font: ${state.font}, "Times New Roman", serif;
          --chapter-title-size: 16pt;
          --title-size: 28pt;
        `;
      default:
        return `
          --heading-font: ${state.font}, "Times New Roman", serif;
          --body-font: ${state.font}, "Times New Roman", serif;
          --chapter-title-size: 18pt;
          --title-size: 28pt;
        `;
    }
  })();

  return `
@page {
  size: ${trim.width} ${trim.height};
  margin: 0;
}
@page :left {
}
@page :right {
}

html, body {
  background: white;
  color: #171717;
  margin: 0;
  padding: 0;
}

body {
  ${themeVars}
  font-family: var(--body-font);
  font-size: ${state.fontSize}pt;
  line-height: ${state.lineHeight};
  text-align: ${state.alignment};
  -webkit-font-smoothing: antialiased;
  hyphens: auto;
}

/* Paged.js uses these paged pages */
.pagedjs_page {
  background: white;
}

.pagedjs_sheet {
  padding: 0 !important;
}

.pagedjs_pagebox {
  padding: 0 !important;
}

/* Content frame inside each page */
.book {
  padding-top: ${top};
  padding-bottom: ${bottom};
  padding-left: ${outside};
  padding-right: ${outside};
}

/* Mirror margins: swap inside/outside per page */
.pagedjs_left_page .book {
  padding-left: ${inside};
  padding-right: ${outside};
}
.pagedjs_right_page .book {
  padding-left: ${outside};
  padding-right: ${inside};
}

p {
  margin: 0 0 ${state.paragraphSpacing};
  text-indent: ${state.paragraphIndent};
  orphans: 2;
  widows: 2;
}

.keep-with-next {
  break-after: avoid;
  page-break-after: avoid;
}

.title-page {
  break-before: page;
  page-break-before: always;
  text-align: center;
  padding-top: 18%;
}
.title-page-title { font-family: var(--heading-font); font-size: var(--title-size); margin: 0 0 14pt; line-height: 1.1; }
.title-page-author { font-size: 12pt; }

.toc {
  break-before: page;
  page-break-before: always;
}
.toc h2 {
  font-family: var(--heading-font);
  font-size: 16pt;
  text-align: center;
  margin: 12% 0 10%;
}
.toc a {
  color: inherit;
  text-decoration: none;
}
.toc-item {
  display: block;
  margin: 0 0 0.25em;
}
.toc-item a::after {
  content: leader('.') target-counter(attr(href), page);
}

.chapter {
  break-before: page;
  page-break-before: always;
}
.chapter-title {
  text-align: center;
  font-family: var(--heading-font);
  font-size: var(--chapter-title-size);
  margin: 0;
  padding: 22% 0 12%;
  line-height: 1.15;
  page-break-after: avoid;
  break-after: avoid;
  string-set: chapter content(text);
}
.chapter-body p:first-child,
.title-page p:first-child,
.scene-break { text-indent: 0; }
.scene-break { text-align: center; margin: 1.2em 0; }
blockquote { margin: 0 0 1em; padding-left: 16px; border-left: 3px solid #999; }

/* Running heads + page numbers in margin boxes (Paged.js) */
@page {
  @top-left {
    content: ${state.showHeaders ? "string(author)" : "none"};
    font-size: 9pt;
    color: #555;
  }
  @top-right {
    content: ${state.showHeaders ? "string(chapter)" : "none"};
    font-size: 9pt;
    color: #555;
  }
  @bottom-center {
    content: ${state.showPageNumbers ? "counter(page)" : "none"};
    font-size: 9pt;
    color: #555;
  }
}

@page title {
  @top-left { content: none; }
  @top-right { content: none; }
  @bottom-center { content: none; }
}

@page toc {
  @top-left { content: none; }
  @top-right { content: none; }
}

@page frontmatter {
  @bottom-center { content: ${state.showPageNumbers ? (state.romanFrontMatter ? "counter(page, lower-roman)" : "counter(page)") : "none"}; }
}
`;
}

function buildPdfHtml(book) {
  const titleSafe = escapeHtml(book.title || "Book");
  const authorSafe = escapeHtml(book.author || "Author");
  const lang = "en";

  const idFor = (prefix, idx) => `${prefix}-${idx + 1}`;

  const chapterHtml = (ch, idx, prefix = "ch") => `
    <section class="chapter" id="${idFor(prefix, idx)}">
      <h2 class="chapter-title keep-with-next">${escapeHtml(ch.title || "Chapter")}</h2>
      <div class="chapter-body">${normalizeContentHtml(ch.content || "")}</div>
    </section>
  `.trim();

  const tocHtml = (() => {
    if (!state.includeTOC) return "";
    const items = (book.sections.body || [])
      .map((ch, idx) => `<div class="toc-item"><a href="#${idFor("ch", idx)}">${escapeHtml(ch.title || `Chapter ${idx + 1}`)}</a></div>`)
      .join("\n");
    return `
      <section class="toc" style="page: toc;">
        <h2>Contents</h2>
        <div class="toc-list">
          ${items}
        </div>
      </section>
    `.trim();
  })();

  const front = state.includeFrontMatter
    ? (book.sections.front || []).map((ch, idx) => `<section class="chapter frontmatter" style="page: frontmatter;" id="${idFor("front", idx)}">
      <h2 class="chapter-title keep-with-next">${escapeHtml(ch.title || "Front matter")}</h2>
      <div class="chapter-body">${normalizeContentHtml(ch.content || "")}</div>
    </section>`.trim()).join("\n")
    : "";

  const body = (book.sections.body || [])
    .map((ch, idx) => chapterHtml(ch, idx, "ch"))
    .join("\n");

  const back = state.includeBackMatter
    ? (book.sections.back || []).map((ch, idx) => `<section class="chapter backmatter" id="${idFor("back", idx)}">
      <h2 class="chapter-title keep-with-next">${escapeHtml(ch.title || "Back matter")}</h2>
      <div class="chapter-body">${normalizeContentHtml(ch.content || "")}</div>
    </section>`.trim()).join("\n")
    : "";

  const chapterStartCss = state.chapterStart === "recto"
    ? `<style>.chapter { break-before: right; page-break-before: right; }</style>`
    : "";

  return `
<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titleSafe}</title>
    <style>${buildPdfCss()}</style>
    ${chapterStartCss}
  </head>
  <body style="string-set: author '${authorSafe}';">
    <section class="title-page" style="page: title;">
      <h1 class="title-page-title">${titleSafe}</h1>
      <div class="title-page-author">${authorSafe}</div>
    </section>
    ${tocHtml}
    <main class="book">
    ${front}
    ${body}
    ${back}
    </main>
  </body>
</html>
`.trim();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportPdf() {
  if (!currentBook) return;
  syncStateFromControls();

  const base = (state.exporterUrl || defaultExporterBase()).replace(/\/+$/, "");
  const endpoint = `${base}/pdf`;
  const pdfHtml = buildPdfHtml(currentBook);

  setStatus("Exporting PDF…");
  el.exportPdfBtn.disabled = true;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: pdfHtml,
        options: {
          usePagedJs: true,
          title: currentBook.title || "Book",
          author: currentBook.author || "Author"
        }
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Exporter failed (${res.status}). ${text}`.trim());
    }

    const blob = await res.blob();
    const name = `${(currentBook.title || "book").replace(/[^a-z0-9]+/gi, "_")}.pdf`;
    downloadBlob(blob, name);
    setStatus("PDF downloaded");
  } catch (err) {
    setStatus(`PDF export failed: ${err?.message || String(err)}`);
  } finally {
    el.exportPdfBtn.disabled = false;
  }
}

function getTrimConfig() {
  return TRIM_MAP[state.trim] || TRIM_MAP["5x8"];
}

function buildRunningHeader(pageNumber) {
  if (!currentBook) return "";
  return pageNumber % 2 === 0 ? currentBook.title : currentBook.author;
}

function createPage(pageNumber) {
  let node;
  if (el.pageTemplate?.content?.firstElementChild) {
    node = el.pageTemplate.content.firstElementChild.cloneNode(true);
  } else {
    node = document.createElement("article");
    node.className = "page";
    node.innerHTML =
      '<div class="running-header"></div><div class="page-content"></div><div class="page-number"></div>';
  }
  const trim = getTrimConfig();

  node.dataset.pageNumber = String(pageNumber);
  node.style.width = trim.width;
  node.style.minHeight = trim.height;

  const content = node.querySelector(".page-content");
  const runningHeader = node.querySelector(".running-header");
  const pageNumberEl = node.querySelector(".page-number");

  const isLeftPage = pageNumber % 2 === 0;
  const paddingLeft = isLeftPage ? state.insideMargin : state.outsideMargin;
  const paddingRight = isLeftPage ? state.outsideMargin : state.insideMargin;

  content.style.paddingTop = state.topMargin;
  content.style.paddingBottom = `calc(${state.bottomMargin} + 0.18in)`;
  content.style.paddingLeft = paddingLeft;
  content.style.paddingRight = paddingRight;
  content.style.fontFamily = state.font;
  content.style.fontSize = `${state.fontSize}pt`;
  content.style.lineHeight = state.lineHeight;
  content.style.textAlign = state.alignment;
  content.style.setProperty("--paragraph-indent", state.paragraphIndent);
  content.style.setProperty("--paragraph-spacing", state.paragraphSpacing);

  runningHeader.textContent = state.showHeaders ? buildRunningHeader(pageNumber) : "";
  runningHeader.classList.toggle("hidden", !state.showHeaders);

  pageNumberEl.textContent = state.showPageNumbers ? String(pageNumber) : "";
  pageNumberEl.classList.toggle("hidden", !state.showPageNumbers);

  return node;
}

function buildSectionBlock(title, html, type = "body") {
  const section = document.createElement("section");
  section.className = `book-section ${type}`;

  const titleEl = document.createElement("h1");
  titleEl.className = "chapter-title";
  titleEl.textContent = title || "Untitled";

  const body = document.createElement("div");
  body.className = "section-body";
  body.innerHTML = normalizeContentHtml(html);

  section.appendChild(titleEl);
  section.appendChild(body);
  return section;
}

function buildTitlePage(book) {
  const wrap = document.createElement("section");
  wrap.className = "title-page";

  const title = document.createElement("h1");
  title.className = "title-page-title";
  title.textContent = book.title || "Untitled Book";

  const author = document.createElement("div");
  author.className = "title-page-author";
  author.textContent = book.author || "Author";

  wrap.appendChild(title);
  wrap.appendChild(author);
  return wrap;
}

function collectContentBlocks(book) {
  const blocks = [];
  const tocRows = [];

  blocks.push({ kind: "title-page", node: buildTitlePage(book) });

  const front = state.includeFrontMatter ? book.sections.front : [];
  const body = book.sections.body || [];
  const back = state.includeBackMatter ? book.sections.back : [];

  for (const ch of front) {
    const node = buildSectionBlock(ch.title, ch.content, "front");
    blocks.push({ kind: "section", forceNewPage: true, node, title: ch.title });
  }

  for (const ch of body) {
    const node = buildSectionBlock(ch.title, ch.content, "body");
    blocks.push({
      kind: "section",
      forceNewPage: true,
      recto: state.chapterStart === "recto",
      node,
      title: ch.title
    });
  }

  for (const ch of back) {
    const node = buildSectionBlock(ch.title, ch.content, "back");
    blocks.push({ kind: "section", forceNewPage: true, node, title: ch.title });
  }

  return { blocks, tocRows };
}

	function fitsInPage(page, node) {
  const content = page.querySelector(".page-content");
  content.appendChild(node);

  // Add safety buffer (prevents PDF clipping)
  const BUFFER = 8; // pixels

  const fits = content.scrollHeight <= (content.clientHeight - BUFFER);

  content.removeChild(node);
  return fits;
}

function addRectoBlankIfNeeded(pages) {
  if (pages.length % 2 === 1) {
    const blankPage = createPage(pages.length + 1);
    blankPage.classList.add("blank-page");
    pages.push(blankPage);
  }
}

function layoutBlocks(blocks) {
  const pages = [];
  let currentPage = createPage(1);
  pages.push(currentPage);

  const pushNewPage = () => {
    const next = createPage(pages.length + 1);
    pages.push(next);
    currentPage = next;
  };

  for (const block of blocks) {
    if (block.forceNewPage) {
      if (block.recto) {
        addRectoBlankIfNeeded(pages);
      }
      pushNewPage();
    }

    const clone = block.node.cloneNode(true);

    if (fitsInPage(currentPage, clone)) {
      currentPage.querySelector(".page-content").appendChild(clone);
    } else {
      pushNewPage();

      if (fitsInPage(currentPage, clone)) {
        currentPage.querySelector(".page-content").appendChild(clone);
      } else {
        const content = clone.querySelector(".section-body");
        if (!content) {
          currentPage.querySelector(".page-content").appendChild(clone);
          continue;
        }

        const splitPages = splitSectionAcrossPages(clone, currentPage, pages.length);
        if (splitPages.length) {
          currentPage.querySelector(".page-content").appendChild(splitPages[0]);
          for (let i = 1; i < splitPages.length; i++) {
            pushNewPage();
            currentPage.querySelector(".page-content").appendChild(splitPages[i]);
          }
        }
      }
    }
  }

  return pages;
}

function splitSectionAcrossPages(sectionNode, page, startPageNumber) {
  const pieces = [];
  const title = sectionNode.querySelector(".chapter-title")?.cloneNode(true);
  const body = sectionNode.querySelector(".section-body");
  if (!body) return [sectionNode];

  const children = Array.from(body.childNodes);
  let currentSection = document.createElement("section");
  currentSection.className = sectionNode.className;

  if (title) currentSection.appendChild(title.cloneNode(true));

  const currentBody = document.createElement("div");
  currentBody.className = "section-body";
  currentSection.appendChild(currentBody);

  const tempPage = createPage(startPageNumber);
  tempPage.querySelector(".page-content").appendChild(currentSection);

  for (const child of children) {
    const clone = child.cloneNode(true);
    currentBody.appendChild(clone);

    if (tempPage.querySelector(".page-content").scrollHeight > tempPage.querySelector(".page-content").clientHeight) {
      currentBody.removeChild(clone);
      pieces.push(currentSection);

      currentSection = document.createElement("section");
      currentSection.className = `${sectionNode.className} continued`;
      const continuedBody = document.createElement("div");
      continuedBody.className = "section-body";
      currentSection.appendChild(continuedBody);

      tempPage.querySelector(".page-content").innerHTML = "";
      tempPage.querySelector(".page-content").appendChild(currentSection);
      continuedBody.appendChild(clone);

      if (tempPage.querySelector(".page-content").scrollHeight > tempPage.querySelector(".page-content").clientHeight) {
        const textNode = child.nodeType === Node.ELEMENT_NODE ? child.cloneNode(true) : null;
        if (textNode && /^P$/i.test(textNode.nodeName)) {
          const splitParagraphs = splitParagraphElement(textNode, tempPage.querySelector(".page-content"));
          tempPage.querySelector(".page-content").innerHTML = "";
          if (splitParagraphs.first) {
            const s1 = document.createElement("section");
            s1.className = `${sectionNode.className} continued`;
            const b1 = document.createElement("div");
            b1.className = "section-body";
            b1.appendChild(splitParagraphs.first);
            s1.appendChild(b1);
            pieces.push(s1);
          }

          currentSection = document.createElement("section");
          currentSection.className = `${sectionNode.className} continued`;
          const b2 = document.createElement("div");
          b2.className = "section-body";
          if (splitParagraphs.rest) b2.appendChild(splitParagraphs.rest);
          currentSection.appendChild(b2);
          tempPage.querySelector(".page-content").appendChild(currentSection);
        }
      }
    }
  }

  pieces.push(currentSection);
  return pieces.filter(Boolean);
}

function splitParagraphElement(pElement, pageContent) {
  const text = pElement.textContent || "";
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return { first: pElement.cloneNode(true), rest: null };

  const firstP = pElement.cloneNode(false);
  const restP = pElement.cloneNode(false);

  let accepted = "";
  let remainingStart = 0;

  for (let i = 0; i < words.length; i++) {
    const test = accepted ? `${accepted} ${words[i]}` : words[i];
    firstP.textContent = test;

    const probe = document.createElement("section");
    probe.className = "book-section body continued";
    const body = document.createElement("div");
    body.className = "section-body";
    body.appendChild(firstP.cloneNode(true));
    probe.appendChild(body);

    pageContent.appendChild(probe);
    const fits = pageContent.scrollHeight <= pageContent.clientHeight;
    pageContent.removeChild(probe);

    if (fits) {
      accepted = test;
      remainingStart = i + 1;
    } else {
      break;
    }
  }

  firstP.textContent = accepted || words[0];
  const restWords = words.slice(remainingStart);
  if (restWords.length) {
    restP.textContent = restWords.join(" ");
    return { first: firstP, rest: restP };
  }

  return { first: firstP, rest: null };
}

function buildTOCPage(rows) {
  const section = document.createElement("section");
  section.className = "toc-page";

  const title = document.createElement("h1");
  title.className = "chapter-title";
  title.textContent = "Contents";

  const list = document.createElement("div");
  list.className = "toc-list";

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "toc-item";
    item.innerHTML = `
      <span class="toc-item-title">${escapeHtml(row.title)}</span>
      <span class="toc-item-dots"></span>
      <span class="toc-item-page">${row.page}</span>
    `;
    list.appendChild(item);
  }

  section.appendChild(title);
  section.appendChild(list);
  return section;
}

function collectTOCRows(pages) {
  const rows = [];
  pages.forEach((page, index) => {
    const title = page.querySelector(".chapter-title");
    if (title) {
      const section = title.closest(".book-section, .toc-page, .title-page");
      if (section && !section.classList.contains("toc-page") && !section.classList.contains("title-page")) {
        rows.push({ title: title.textContent.trim(), page: index + 1 });
      }
    }
  });
  return rows;
}

function refreshPageMeta(pages) {
  pages.forEach((page, index) => {
    const number = index + 1;
    page.dataset.pageNumber = String(number);

    const runningHeader = page.querySelector(".running-header");
    const pageNumberEl = page.querySelector(".page-number");

    runningHeader.textContent = state.showHeaders ? buildRunningHeader(number) : "";
    runningHeader.classList.toggle("hidden", !state.showHeaders);

    pageNumberEl.textContent = state.showPageNumbers ? String(number) : "";
    pageNumberEl.classList.toggle("hidden", !state.showPageNumbers);
  });
}

function renderPages(pages) {
  el.preview.innerHTML = "";
  for (const page of pages) {
    el.preview.appendChild(page);
  }
  el.pageCountValue.textContent = String(pages.length);
}

function renderBook() {
  if (!currentBook) return;

  syncStateFromControls();
  setStatus("Rendering…");

  const { blocks } = collectContentBlocks(currentBook);
  let pages = layoutBlocks(blocks);

  if (state.includeTOC) {
    const rows = collectTOCRows(pages);
    const tocBlock = { kind: "toc", forceNewPage: true, node: buildTOCPage(rows) };
    const finalBlocks = [...blocks];
    finalBlocks.splice(1, 0, tocBlock);
    pages = layoutBlocks(finalBlocks);
  }

  refreshPageMeta(pages);
  renderPages(pages);

  el.wordCountValue.textContent = String(getWordCount(currentBook));
  setStatus("Rendered");
}

function exportHtmlSnapshot() {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(currentBook?.title || "Book Export")}</title>
<link rel="stylesheet" href="export.css" />
</head>
<body class="export-only">
<div class="export-preview">${el.preview.innerHTML}</div>
</body>
</html>
  `.trim();

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(currentBook?.title || "book").replace(/[^a-z0-9]+/gi, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Allow the download to start before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function loadBook(uid) {
  if (!bookId) {
    setStatus("Missing ?book= parameter");
    return;
  }

  setStatus("Loading book…");

  const ref = doc(db, "users", uid, "books", bookId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    setStatus("Book not found");
    return;
  }

  currentBook = normalizeBook(snap.data());
  el.bookTitle.textContent = currentBook.title;
  el.topbarBookTitle.textContent = currentBook.title;
  el.bookSubtitle.textContent = `${currentBook.author} • Ready for print`;
  el.wordCountValue.textContent = String(getWordCount(currentBook));

  renderBook();
}

function bindEvents() {
  el.applyPresetBtn.addEventListener("click", () => applyPreset(el.presetSelect.value));

  [
    el.exporterUrlInput,
    el.themeSelect,
    el.trimSize,
    el.chapterStartSelect,
    el.insideMarginInput,
    el.outsideMarginInput,
    el.topMarginInput,
    el.bottomMarginInput,
    el.fontSelect,
    el.fontSizeSelect,
    el.lineHeightSelect,
    el.alignmentSelect,
    el.paragraphIndentInput,
    el.paragraphSpacingInput,
    el.includeFrontMatterToggle,
    el.includeBackMatterToggle,
    el.includeTOCToggle,
    el.showHeadersToggle,
    el.showPageNumbersToggle,
    el.romanFrontMatterToggle
  ].forEach((control) => {
    control.addEventListener("change", () => {
      syncStateFromControls();
      renderBook();
    });
  });

  el.zoomSelect.addEventListener("change", () => {
    syncStateFromControls();
  });

  el.renderBtn.addEventListener("click", renderBook);
  el.exportPdfBtn.addEventListener("click", exportPdf);
  el.exportHtmlBtn.addEventListener("click", exportHtmlSnapshot);

  el.themeToggleBtn.addEventListener("click", () => {
    el.body.classList.toggle("light");
    el.body.classList.toggle("dark");
  });

  el.toggleSidebarBtn.addEventListener("click", () => {
    el.sidebar.classList.toggle("open");
    el.overlay.classList.toggle("hidden");
  });

  el.overlay.addEventListener("click", () => {
    el.sidebar.classList.remove("open");
    el.overlay.classList.add("hidden");
  });
}

bindEvents();
syncControlsFromState();
applyPreset("reedsy_standard");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setStatus("Not logged in");
    return;
  }

  currentUser = user;
  await loadBook(user.uid);
});
