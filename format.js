/* =========================================================
   FORMAT.JS
   Publishing-grade Firebase-backed exporter
   Upgraded with:
   - Paged.js preview rendering
   - TOC page number backfill
   - recto chapter starts
   - rendered page count extraction
   - running header source tagging
========================================================= */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   CONFIG + STATE
========================================================= */

const CONFIG = window.FORMAT_CONFIG || {
  appName: "Format",
  route: { bookParam: "book", fallbackBookId: "" },
  data: { collectionRoot: "users", nestedCollection: "books" },
  defaults: {
    exportType: "print",
    template: "reedsy",
    trimSize: "5.5x8.5",
    bodyFont: "merriweather",
    headingFont: "lato",
    fontSize: 11.5,
    lineHeight: 1.45,
    paragraphSpacing: 0.35,
    paragraphIndent: 1.4,
    pageNumberStart: 1
  }
};

const state = {
  authReady: false,
  dbReady: false,
  currentUser: null,
  currentBookId: null,
  currentBook: null,
  currentPreviewScale: 1,
  lastSync: null,
  debugOpen: false,
  lastRenderSignature: "",
  pagedReady: typeof window.Paged !== "undefined",
  pagedPreviewer: null,
  renderToken: 0,
  rerenderTimer: null,
  renderedPageCount: 0,
  targetPageMap: {},

  controls: {
    exportType: CONFIG.defaults.exportType,
    template: CONFIG.defaults.template,
    language: "en",
    interiorType: "bw",

    trimSize: CONFIG.defaults.trimSize,
    marginPreset: "balanced",
    pageNumberStart: CONFIG.defaults.pageNumberStart,
    gutterMode: "auto",

    startChaptersRight: true,
    showPrintGuides: false,
    cropMarks: false,
    bleed: false,

    bodyFont: CONFIG.defaults.bodyFont,
    headingFont: CONFIG.defaults.headingFont,
    fontSize: CONFIG.defaults.fontSize,
    lineHeight: CONFIG.defaults.lineHeight,
    paragraphSpacing: CONFIG.defaults.paragraphSpacing,
    paragraphIndent: CONFIG.defaults.paragraphIndent,

    justifyText: true,
    hyphenation: true,
    ligatures: true,
    dropCaps: true,

    chapterSpacing: 4.5,
    chapterTitleScale: 1.9,
    showChapterNumbers: true,
    showChapterOrnaments: true,
    uppercaseChapterTitles: false,
    keepChapterFirstParagraphFlush: true,

    includeTitlePage: true,
    includeCoverPage: false,
    includeCopyright: true,
    includeDedication: false,
    includeEpigraph: false,
    includeToc: true,
    includeBackMatter: true,

    showRunningHeaders: true,
    showPageNumbers: true,
    skipFrontMatterPageNumbers: true,
    showAuthorOnLeftPages: true,
    showChapterOnRightPages: true
  }
};

/* =========================================================
   DOM CACHE
========================================================= */

const dom = {
  body: document.body,
  appShell: byId("appShell"),

  mobileOpenLeftBtn: byId("mobileOpenLeftBtn"),
  mobileOpenRightBtn: byId("mobileOpenRightBtn"),
  leftSidebar: byId("leftSidebar"),
  rightSidebar: byId("rightSidebar"),
  sidebarBackdrop: byId("sidebarBackdrop"),

  bookTitleDisplay: byId("bookTitleDisplay"),
  bookSubtitleDisplay: byId("bookSubtitleDisplay"),
  bookAuthorDisplay: byId("bookAuthorDisplay"),
  bookWordCount: byId("bookWordCount"),
  bookBodyCount: byId("bookBodyCount"),
  bookSectionCount: byId("bookSectionCount"),
  coverInitial: byId("coverInitial"),

  firebaseAuthStatus: byId("firebaseAuthStatus"),
  firebaseDbStatus: byId("firebaseDbStatus"),
  currentUserDisplay: byId("currentUserDisplay"),
  activeBookIdDisplay: byId("activeBookIdDisplay"),
  lastSyncDisplay: byId("lastSyncDisplay"),

  navFrontMatter: byId("navFrontMatter"),
  navBodyMatter: byId("navBodyMatter"),
  navBackMatter: byId("navBackMatter"),
  frontCountDisplay: byId("frontCountDisplay"),
  bodyCountDisplay: byId("bodyCountDisplay"),
  backCountDisplay: byId("backCountDisplay"),

  renderStatusText: byId("renderStatusText"),
  previewStage: byId("previewStage"),
  previewScaleFrame: byId("previewScaleFrame"),
  printFlow: byId("printFlow"),

  previewSeriesDisplay: byId("previewSeriesDisplay"),
  previewBookTitle: byId("previewBookTitle"),
  previewBookSubtitle: byId("previewBookSubtitle"),
  previewAuthorName: byId("previewAuthorName"),
  previewCoverImage: byId("previewCoverImage"),
  previewCopyrightContent: byId("previewCopyrightContent"),
  previewDedicationContent: byId("previewDedicationContent"),
  previewEpigraphContent: byId("previewEpigraphContent"),
  copyrightYearDisplay: byId("copyrightYearDisplay"),
  copyrightAuthorDisplay: byId("copyrightAuthorDisplay"),

  flowTitlePage: byId("flowTitlePage"),
  flowCoverPage: byId("flowCoverPage"),
  flowCopyright: byId("flowCopyright"),
  flowDedication: byId("flowDedication"),
  flowEpigraph: byId("flowEpigraph"),
  flowFrontCustom: byId("flowFrontCustom"),
  flowTableOfContents: byId("flowTableOfContents"),
  tocList: byId("tocList"),
  flowBodyMatter: byId("flowBodyMatter"),
  flowBackMatter: byId("flowBackMatter"),

  templateChip: byId("templateChip"),
  trimChip: byId("trimChip"),
  paperChip: byId("paperChip"),
  layoutChip: byId("layoutChip"),
  pageCountChip: byId("pageCountChip"),

  refreshBookBtn: byId("refreshBookBtn"),
  reloadBtn: byId("reloadBtn"),
  rebuildPreviewBtn: byId("rebuildPreviewBtn"),
  openPrintPreviewBtn: byId("openPrintPreviewBtn"),
  exportPdfBtn: byId("exportPdfBtn"),
  exportPdfSidebarBtn: byId("exportPdfSidebarBtn"),
  renderPagedBtn: byId("renderPagedBtn"),
  downloadLayoutJsonBtn: byId("downloadLayoutJsonBtn"),

  zoomOutBtn: byId("zoomOutBtn"),
  zoomInBtn: byId("zoomInBtn"),
  zoomSelect: byId("zoomSelect"),
  fitWidthBtn: byId("fitWidthBtn"),
  fitPageBtn: byId("fitPageBtn"),

  exportTypeSelect: byId("exportTypeSelect"),
  templateSelect: byId("templateSelect"),
  languageSelect: byId("languageSelect"),
  interiorTypeSelect: byId("interiorTypeSelect"),

  trimSizeSelect: byId("trimSizeSelect"),
  marginPresetSelect: byId("marginPresetSelect"),
  pageNumberStartInput: byId("pageNumberStartInput"),
  gutterModeSelect: byId("gutterModeSelect"),

  startChaptersRightToggle: byId("startChaptersRightToggle"),
  showPrintGuidesToggle: byId("showPrintGuidesToggle"),
  cropMarksToggle: byId("cropMarksToggle"),
  bleedToggle: byId("bleedToggle"),

  bodyFontSelect: byId("bodyFontSelect"),
  headingFontSelect: byId("headingFontSelect"),
  fontSizeRange: byId("fontSizeRange"),
  fontSizeValue: byId("fontSizeValue"),
  lineHeightRange: byId("lineHeightRange"),
  lineHeightValue: byId("lineHeightValue"),
  paragraphSpacingRange: byId("paragraphSpacingRange"),
  paragraphSpacingValue: byId("paragraphSpacingValue"),
  paragraphIndentRange: byId("paragraphIndentRange"),
  paragraphIndentValue: byId("paragraphIndentValue"),

  justifyTextToggle: byId("justifyTextToggle"),
  hyphenationToggle: byId("hyphenationToggle"),
  ligaturesToggle: byId("ligaturesToggle"),
  dropCapsToggle: byId("dropCapsToggle"),

  chapterSpacingRange: byId("chapterSpacingRange"),
  chapterSpacingValue: byId("chapterSpacingValue"),
  chapterTitleScaleRange: byId("chapterTitleScaleRange"),
  chapterTitleScaleValue: byId("chapterTitleScaleValue"),
  showChapterNumbersToggle: byId("showChapterNumbersToggle"),
  showChapterOrnamentsToggle: byId("showChapterOrnamentsToggle"),
  uppercaseChapterTitlesToggle: byId("uppercaseChapterTitlesToggle"),
  keepChapterFirstParagraphFlushToggle: byId("keepChapterFirstParagraphFlushToggle"),

  includeTitlePageToggle: byId("includeTitlePageToggle"),
  includeCoverPageToggle: byId("includeCoverPageToggle"),
  includeCopyrightToggle: byId("includeCopyrightToggle"),
  includeDedicationToggle: byId("includeDedicationToggle"),
  includeEpigraphToggle: byId("includeEpigraphToggle"),
  includeTocToggle: byId("includeTocToggle"),
  includeBackMatterToggle: byId("includeBackMatterToggle"),

  showRunningHeadersToggle: byId("showRunningHeadersToggle"),
  showPageNumbersToggle: byId("showPageNumbersToggle"),
  skipFrontMatterPageNumbersToggle: byId("skipFrontMatterPageNumbersToggle"),
  showAuthorOnLeftPagesToggle: byId("showAuthorOnLeftPagesToggle"),
  showChapterOnRightPagesToggle: byId("showChapterOnRightPagesToggle"),

  debugDrawer: byId("debugDrawer"),
  debugOutput: byId("debugOutput"),
  closeDebugBtn: byId("closeDebugBtn"),

  syncToast: byId("syncToast"),
  renderToast: byId("renderToast"),
  errorToast: byId("errorToast")
};

/* =========================================================
   INIT
========================================================= */

init();

function init() {
  state.currentBookId = resolveBookId();
  dom.activeBookIdDisplay.textContent = state.currentBookId || "—";

  hydrateControlInputs();
  bindAppEvents();
  applyControlStateToDocument();
  setRenderStatus("Waiting for auth…");

  onAuthStateChanged(auth, async (user) => {
    state.authReady = true;
    state.dbReady = true;
    updateFirebaseStatus();

    if (!user) {
      dom.currentUserDisplay.textContent = "Not signed in";
      setStatusPill(dom.firebaseAuthStatus, "error", "Not signed in");
      setRenderStatus("No authenticated user. Redirecting…");
      window.location.href = "/login.html";
      return;
    }

    state.currentUser = user;
    dom.currentUserDisplay.textContent = user.email || user.uid || "Authenticated";
    setStatusPill(dom.firebaseAuthStatus, "success", "Connected");
    setStatusPill(dom.firebaseDbStatus, "success", "Ready");
    updateFirebaseStatus();

    if (!state.currentBookId) {
      setRenderStatus("No book ID provided in the URL.");
      toast("error");
      return;
    }

    await loadBookAndRender();
  });
}

/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
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

function escapeHtml(value) {
  return safeString(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setRenderStatus(text) {
  if (dom.renderStatusText) dom.renderStatusText.textContent = text;
}

function setStatusPill(el, tone, text) {
  if (!el) return;
  el.classList.remove("pending", "success", "error");
  el.classList.add(tone);
  el.textContent = text;
}

function toast(type) {
  const map = {
    sync: dom.syncToast,
    render: dom.renderToast,
    error: dom.errorToast
  };
  const el = map[type];
  if (!el) return;

  el.classList.remove("is-hidden");
  clearTimeout(el.__hideTimer);
  el.__hideTimer = setTimeout(() => {
    el.classList.add("is-hidden");
  }, 2200);
}

function updateFirebaseStatus() {
  if (!state.authReady) setStatusPill(dom.firebaseAuthStatus, "pending", "Waiting");
  if (!state.dbReady) setStatusPill(dom.firebaseDbStatus, "pending", "Waiting");

  dom.activeBookIdDisplay.textContent = state.currentBookId || "—";
  dom.lastSyncDisplay.textContent = state.lastSync
    ? new Date(state.lastSync).toLocaleString()
    : "Never";
}

function resolveBookId() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get(CONFIG.route.bookParam || "book") ||
    CONFIG.route.fallbackBookId ||
    ""
  );
}

function debounceRerender(delay = 120) {
  clearTimeout(state.rerenderTimer);
  state.rerenderTimer = setTimeout(() => {
    rerenderFromControls();
  }, delay);
}

/* =========================================================
   DATA NORMALIZATION
========================================================= */

function generateId() {
  return "fmt_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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
    ? frontRaw.map((item, index) =>
        normalizeChapter(item, index === 0 ? "Copyright" : `Front Matter ${index + 1}`)
      )
    : [];

  const body = bodyRaw.length
    ? bodyRaw.map((item, index) => normalizeChapter(item, `Chapter ${index + 1}`))
    : [{ id: generateId(), title: "Chapter 1", content: "" }];

  const back = backRaw.length
    ? backRaw.map((item, index) => normalizeChapter(item, `Back Matter ${index + 1}`))
    : [];

  return { front, body, back };
}

function normalizeBook(rawData) {
  const data = safeObject(rawData, {});
  const normalizedSections = normalizeSections(data.sections);

  return {
    title: safeString(data.title, "Untitled Book"),
    subtitle: safeString(data.subtitle, ""),
    author: safeString(data.author, state.currentUser?.email || "Unknown Author"),
    series: safeString(data.series, "Alysum Export"),
    coverUrl: safeString(data.coverUrl, ""),
    dedication: safeString(data.dedication, ""),
    epigraph: safeString(data.epigraph, ""),
    copyright: safeString(data.copyright, ""),
    isbn: safeString(data.isbn, ""),
    words: safeNumber(data.words, 0),
    updated: safeNumber(data.updated, Date.now()),
    sections: normalizedSections
  };
}

function allSectionsFlat(book = state.currentBook) {
  if (!book) return [];
  return [
    ...book.sections.front.map((section, index) => ({ ...section, sectionType: "front", index })),
    ...book.sections.body.map((section, index) => ({ ...section, sectionType: "body", index })),
    ...book.sections.back.map((section, index) => ({ ...section, sectionType: "back", index }))
  ];
}

function countWordsFromHtml(html) {
  const text = stripHtmlToText(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function computeTotalWords(book = state.currentBook) {
  if (!book) return 0;
  return allSectionsFlat(book).reduce((sum, item) => sum + countWordsFromHtml(item.content), 0);
}

/* =========================================================
   HTML SANITIZE / TRANSFORM
========================================================= */

function stripHtmlToText(html) {
  return safeString(html, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|h1|h2|h3|blockquote|li)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEditorHtmlToPrint(html) {
  let value = safeString(html, "").trim();
  if (!value) return "<p></p>";

  value = value
    .replace(/<div><br\s*\/?><\/div>/gi, "")
    .replace(/<div>(.*?)<\/div>/gis, "<p>$1</p>")
    .replace(/<p>\s*<\/p>/gis, "")
    .replace(/<h2/gi, "<h3")
    .replace(/<\/h2>/gi, "</h3>");

  value = unwrapNestedParagraphs(value);
  return value;
}

function unwrapNestedParagraphs(html) {
  return html.replace(/<p>\s*(<(ul|ol|blockquote|h3)[\s\S]*?<\/\2>)\s*<\/p>/gi, "$1");
}

/* =========================================================
   LOAD BOOK
========================================================= */

async function loadBookAndRender() {
  if (!state.currentUser || !state.currentBookId) return;

  try {
    setRenderStatus("Loading manuscript from Firebase…");

    const bookRef = doc(
      db,
      CONFIG.data.collectionRoot,
      state.currentUser.uid,
      CONFIG.data.nestedCollection,
      state.currentBookId
    );

    const snap = await getDoc(bookRef);

    if (!snap.exists()) {
      setRenderStatus("Book not found.");
      toast("error");
      return;
    }

    state.currentBook = normalizeBook(snap.data());
    state.lastSync = Date.now();
    updateFirebaseStatus();

    await renderEverything();
    toast("sync");
  } catch (error) {
    console.error("FORMAT LOAD ERROR:", error);
    setRenderStatus("Failed to load book.");
    toast("error");
    renderDebug();
  }
}

/* =========================================================
   FULL RENDER PIPELINE
========================================================= */

async function renderEverything() {
  if (!state.currentBook) return;

  const renderToken = ++state.renderToken;
  setRenderStatus("Building export preview…");

  renderSummary();
  renderNav();
  renderFrontMatter();
  renderTOC();
  renderBodyMatter();
  renderBackMatter();
  applyControlStateToDocument();
  updateMetaChips();
  renderDebug();

  if (renderToken !== state.renderToken) return;

  await runPagedPreview(renderToken);

  if (renderToken !== state.renderToken) return;

  setRenderStatus("Preview ready.");
  toast("render");
}

/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {
  const book = state.currentBook;
  const totalWords = book.words || computeTotalWords(book);
  const totalSections = allSectionsFlat(book).length;
  const bodyCount = book.sections.body.length;
  const initial = safeString(book.title, "F").trim().charAt(0).toUpperCase() || "F";

  dom.bookTitleDisplay.textContent = book.title;
  dom.bookSubtitleDisplay.textContent = book.subtitle || "Ready for print export";
  dom.bookAuthorDisplay.textContent = book.author;
  dom.bookWordCount.textContent = totalWords.toLocaleString();
  dom.bookBodyCount.textContent = String(bodyCount);
  dom.bookSectionCount.textContent = String(totalSections);
  dom.coverInitial.textContent = initial;

  dom.previewSeriesDisplay.textContent = book.series || "Alysum Export";
  dom.previewBookTitle.textContent = book.title;
  dom.previewBookSubtitle.textContent = book.subtitle || "A professional print-ready export";
  dom.previewAuthorName.textContent = book.author;
  dom.copyrightYearDisplay.textContent = String(new Date().getFullYear());
  dom.copyrightAuthorDisplay.textContent = book.author;

  document.documentElement.style.setProperty("--book-author-string", `"${cssString(book.author)}"`);

  if (book.coverUrl) {
    dom.previewCoverImage.src = book.coverUrl;
    dom.previewCoverImage.hidden = false;
  } else {
    dom.previewCoverImage.removeAttribute("src");
    dom.previewCoverImage.hidden = true;
  }
}

/* =========================================================
   NAV TREE
========================================================= */

function renderNav() {
  const book = state.currentBook;
  renderNavGroup(dom.navFrontMatter, book.sections.front, "front");
  renderNavGroup(dom.navBodyMatter, book.sections.body, "body");
  renderNavGroup(dom.navBackMatter, book.sections.back, "back");

  dom.frontCountDisplay.textContent = String(book.sections.front.length);
  dom.bodyCountDisplay.textContent = String(book.sections.body.length);
  dom.backCountDisplay.textContent = String(book.sections.back.length);
}

function renderNavGroup(mount, items, sectionType) {
  if (!mount) return;
  mount.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "nav-empty";
    empty.textContent = "No sections";
    mount.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item";
    button.dataset.sectionType = sectionType;
    button.dataset.sectionIndex = String(index);
    button.textContent =
      sectionType === "body" ? `${index + 1}. ${item.title || "Untitled"}` : item.title || "Untitled";

    button.addEventListener("click", () => {
      const targetId = getSectionDomId(sectionType, index, item.id);
      const target = dom.previewScaleFrame.querySelector(`#${CSS.escape(targetId)}`) || document.getElementById(targetId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      closeMobileSidebars();
    });

    mount.appendChild(button);
  });
}

/* =========================================================
   FRONT MATTER
========================================================= */

function renderFrontMatter() {
  const book = state.currentBook;

  dom.flowTitlePage.hidden = !state.controls.includeTitlePage;
  dom.flowTitlePage.classList.toggle("skip-page-number", !!state.controls.skipFrontMatterPageNumbers);

  dom.flowCoverPage.hidden = !state.controls.includeCoverPage || !book.coverUrl;
  dom.flowCoverPage.classList.toggle("skip-page-number", !!state.controls.skipFrontMatterPageNumbers);

  dom.flowCopyright.hidden = !state.controls.includeCopyright;
  dom.flowCopyright.classList.toggle("skip-page-number", !!state.controls.skipFrontMatterPageNumbers);
  dom.previewCopyrightContent.innerHTML = buildCopyrightHtml(book);

  dom.flowDedication.hidden = !state.controls.includeDedication || !book.dedication;
  dom.flowDedication.classList.toggle("skip-page-number", !!state.controls.skipFrontMatterPageNumbers);
  dom.previewDedicationContent.innerHTML = book.dedication
    ? `<p>${escapeHtml(book.dedication)}</p>`
    : "";

  dom.flowEpigraph.hidden = !state.controls.includeEpigraph || !book.epigraph;
  dom.flowEpigraph.classList.toggle("skip-page-number", !!state.controls.skipFrontMatterPageNumbers);
  dom.previewEpigraphContent.innerHTML = book.epigraph
    ? `<blockquote>${escapeHtml(book.epigraph)}</blockquote>`
    : "";

  dom.flowFrontCustom.innerHTML = "";

  state.currentBook.sections.front.forEach((section, index) => {
    const title = safeString(section.title, `Front Matter ${index + 1}`);
    const lowered = title.toLowerCase();

    if (lowered.includes("copyright") && state.controls.includeCopyright) return;
    if (lowered.includes("dedication") && state.controls.includeDedication) return;
    if (lowered.includes("epigraph") && state.controls.includeEpigraph) return;
    if (lowered.includes("contents") || lowered.includes("table of contents")) return;

    const sectionEl = document.createElement("section");
    sectionEl.className = "flow-section flow-front-generic flow-custom-section skip-page-number";
    sectionEl.id = getSectionDomId("front", index, section.id);
    sectionEl.dataset.flowRole = "front-custom-item";
    sectionEl.dataset.sectionType = "front";
    sectionEl.dataset.sectionIndex = String(index);
    sectionEl.dataset.targetAnchor = sectionEl.id;

    sectionEl.innerHTML = `
      <header class="flow-section-header compact">
        <h2>${escapeHtml(title)}</h2>
      </header>
      <div class="flow-prose">
        ${normalizeEditorHtmlToPrint(section.content)}
      </div>
    `;

    dom.flowFrontCustom.appendChild(sectionEl);
  });
}

function buildCopyrightHtml(book) {
  if (book.copyright) return normalizeEditorHtmlToPrint(book.copyright);

  const isbnLine = book.isbn ? `<p>ISBN: ${escapeHtml(book.isbn)}</p>` : "";
  return `
    <p>Copyright © ${new Date().getFullYear()} ${escapeHtml(book.author)}</p>
    <p>All rights reserved.</p>
    <p>No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without prior written permission.</p>
    ${isbnLine}
  `;
}

/* =========================================================
   TOC
========================================================= */

function renderTOC() {
  dom.flowTableOfContents.hidden = !state.controls.includeToc;
  dom.flowTableOfContents.classList.toggle("skip-page-number", !!state.controls.skipFrontMatterPageNumbers);
  dom.tocList.innerHTML = "";

  if (!state.controls.includeToc) return;

  state.currentBook.sections.body.forEach((chapter, index) => {
    const item = document.createElement("li");
    item.className = "toc-item";

    const targetId = getSectionDomId("body", index, chapter.id);

    item.innerHTML = `
      <a class="toc-link" href="#${escapeHtml(targetId)}">
        <span class="toc-text">${escapeHtml(chapter.title || `Chapter ${index + 1}`)}</span>
        <span class="toc-dots" aria-hidden="true"></span>
        <span class="toc-page" data-toc-target="${escapeHtml(targetId)}">—</span>
      </a>
    `;

    dom.tocList.appendChild(item);
  });
}

/* =========================================================
   BODY CHAPTERS
========================================================= */

function renderBodyMatter() {
  dom.flowBodyMatter.innerHTML = "";

  state.currentBook.sections.body.forEach((chapter, index) => {
    const title = chapter.title || `Chapter ${index + 1}`;
    const sectionEl = document.createElement("section");
    sectionEl.className = "flow-section flow-chapter";
    sectionEl.id = getSectionDomId("body", index, chapter.id);
    sectionEl.dataset.flowRole = "chapter";
    sectionEl.dataset.sectionType = "body";
    sectionEl.dataset.sectionIndex = String(index);
    sectionEl.dataset.chapterTitle = title;
    sectionEl.dataset.targetAnchor = sectionEl.id;
    sectionEl.style.setProperty("string-set", `chapter-title "${cssString(title)}"`);

    if (state.controls.startChaptersRight) {
      sectionEl.classList.add("start-on-right");
    }

    const titleHtml = state.controls.uppercaseChapterTitles
      ? escapeHtml(title).toUpperCase()
      : escapeHtml(title);

    const chapterNumberHtml = state.controls.showChapterNumbers
      ? `<p class="flow-chapter-number">Chapter ${index + 1}</p>`
      : "";

    const ornamentHtml = state.controls.showChapterOrnaments
      ? `<div class="flow-chapter-ornament" aria-hidden="true"></div>`
      : "";

    sectionEl.innerHTML = `
      <header class="flow-chapter-header">
        ${chapterNumberHtml}
        <h2 class="flow-chapter-title" data-running-chapter="${escapeHtml(title)}">${titleHtml}</h2>
        ${ornamentHtml}
      </header>
      <div class="flow-prose flow-chapter-prose">
        ${normalizeEditorHtmlToPrint(chapter.content)}
      </div>
    `;

    dom.flowBodyMatter.appendChild(sectionEl);
  });

  postProcessChapterOpeners();
}

function postProcessChapterOpeners() {
  const chapterSections = dom.flowBodyMatter.querySelectorAll(".flow-chapter");

  chapterSections.forEach((chapterSection) => {
    const prose = chapterSection.querySelector(".flow-chapter-prose");
    if (!prose) return;

    const firstParagraph = prose.querySelector("p");
    if (!firstParagraph) return;

    firstParagraph.classList.toggle("is-flush", !!state.controls.keepChapterFirstParagraphFlush);
    firstParagraph.classList.toggle("has-dropcap", !!state.controls.dropCaps);
  });
}

/* =========================================================
   BACK MATTER
========================================================= */

function renderBackMatter() {
  dom.flowBackMatter.innerHTML = "";
  const include = state.controls.includeBackMatter;

  dom.flowBackMatter.hidden = !include;
  if (!include) return;

  state.currentBook.sections.back.forEach((section, index) => {
    const sectionEl = document.createElement("section");
    sectionEl.className = "flow-section flow-back-generic";
    sectionEl.id = getSectionDomId("back", index, section.id);
    sectionEl.dataset.flowRole = "back-item";
    sectionEl.dataset.sectionType = "back";
    sectionEl.dataset.sectionIndex = String(index);
    sectionEl.dataset.targetAnchor = sectionEl.id;

    sectionEl.innerHTML = `
      <header class="flow-section-header">
        <h2>${escapeHtml(section.title || `Back Matter ${index + 1}`)}</h2>
      </header>
      <div class="flow-prose">
        ${normalizeEditorHtmlToPrint(section.content)}
      </div>
    `;

    dom.flowBackMatter.appendChild(sectionEl);
  });
}

/* =========================================================
   PAGED.JS PREVIEW
========================================================= */

async function runPagedPreview(renderToken) {
  // clear previous paged render if any
  clearPagedArtifacts();

  // give DOM a moment so browser flushes layout before Paged.js runs
  await nextFrame();
  if (renderToken !== state.renderToken) return;

  if (!state.pagedReady || typeof window.Paged?.Previewer !== "function") {
    state.renderedPageCount = estimatePageCount();
    state.targetPageMap = {};
    updateMetaChips();
    fillTocPageNumbersFromEstimate();
    return;
  }

  try {
    setRenderStatus("Paginating preview…");

    const previewer = new window.Paged.Previewer();
    state.pagedPreviewer = previewer;

    await previewer.preview(dom.printFlow, [], dom.previewScaleFrame);
    if (renderToken !== state.renderToken) return;

    await nextFrame();

    state.renderedPageCount = getRenderedPageCount();
    state.targetPageMap = mapTargetsToRenderedPages();
    updateMetaChips();
    fillTocPageNumbersFromRenderedPages();
    annotateRenderedPages();
  } catch (error) {
    console.error("PAGED PREVIEW ERROR:", error);
    state.renderedPageCount = estimatePageCount();
    state.targetPageMap = {};
    updateMetaChips();
    fillTocPageNumbersFromEstimate();
    toast("error");
  }
}

function clearPagedArtifacts() {
  const oldPages = dom.previewScaleFrame.querySelectorAll(".pagedjs_pages");
  oldPages.forEach((node) => node.remove());

  // Paged.js may add generated margin box layers and page wrappers;
  // we only clear the rendered pages stack, not the source flow.
}

function getRenderedPageCount() {
  const pages = dom.previewScaleFrame.querySelectorAll(".pagedjs_page");
  return pages.length || estimatePageCount();
}

function mapTargetsToRenderedPages() {
  const map = {};
  const pages = [...dom.previewScaleFrame.querySelectorAll(".pagedjs_page")];

  pages.forEach((pageEl, pageIndex) => {
    const pageNumber = pageIndex + 1;

    // find anchors and semantic sections cloned into this rendered page
    const targets = pageEl.querySelectorAll("[id][data-target-anchor], .flow-section[id], .flow-chapter[id], .flow-back-generic[id], .flow-front-generic[id]");
    targets.forEach((target) => {
      const id = target.getAttribute("id");
      if (id && !map[id]) {
        map[id] = pageNumber;
      }
    });
  });

  return map;
}

function fillTocPageNumbersFromRenderedPages() {
  const tocPages = dom.tocList.querySelectorAll(".toc-page");
  tocPages.forEach((el) => {
    const target = el.dataset.tocTarget;
    const pageNumber = state.targetPageMap[target];
    el.textContent = pageNumber ? String(pageNumber) : "—";
  });
}

function fillTocPageNumbersFromEstimate() {
  const tocPages = dom.tocList.querySelectorAll(".toc-page");
  tocPages.forEach((el, index) => {
    const estimate = state.controls.pageNumberStart + (index * 12) + 1;
    el.textContent = String(estimate);
  });
}

function annotateRenderedPages() {
  const pages = [...dom.previewScaleFrame.querySelectorAll(".pagedjs_page")];
  pages.forEach((pageEl, index) => {
    pageEl.dataset.renderedPage = String(index + 1);
    pageEl.classList.toggle(
      "skip-visible-page-number",
      shouldSkipVisiblePageNumber(pageEl, index + 1)
    );
  });
}

function shouldSkipVisiblePageNumber(pageEl, pageNumber) {
  if (!state.controls.showPageNumbers) return true;
  if (!state.controls.skipFrontMatterPageNumbers) return false;

  const hasBodyChapter = pageEl.querySelector(".flow-chapter");
  if (hasBodyChapter) return false;

  // Until body starts, suppress page numbers
  return true;
}

/* =========================================================
   META CHIPS
========================================================= */

function updateMetaChips() {
  dom.templateChip.textContent = `Template: ${labelize(state.controls.template)}`;
  dom.trimChip.textContent = `Trim: ${labelizeTrim(state.controls.trimSize)}`;
  dom.paperChip.textContent = `Interior: ${labelize(state.controls.interiorType)}`;
  dom.layoutChip.textContent = `Mode: ${labelize(state.controls.exportType)}`;

  const pageCount = state.renderedPageCount || estimatePageCount();
  dom.pageCountChip.textContent = `Pages: ${pageCount}`;
}

function estimatePageCount() {
  const totalWords = state.currentBook?.words || computeTotalWords(state.currentBook);
  const perPage = state.controls.trimSize === "6x9" ? 340 : 280;
  return Math.max(1, Math.ceil(totalWords / perPage));
}

function labelize(value) {
  return safeString(value, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function labelizeTrim(trim) {
  const map = {
    "4.25x6.87": "4.25 × 6.87 in",
    "5x8": "5 × 8 in",
    "5.25x8": "5.25 × 8 in",
    "5.5x8.5": "5.5 × 8.5 in",
    "6x9": "6 × 9 in",
    "8.5x11": "8.5 × 11 in"
  };
  return map[trim] || trim;
}

/* =========================================================
   CONTROL STATE → DOCUMENT
========================================================= */

function hydrateControlInputs() {
  setInputValue(dom.exportTypeSelect, state.controls.exportType);
  setInputValue(dom.templateSelect, state.controls.template);
  setInputValue(dom.languageSelect, state.controls.language);
  setInputValue(dom.interiorTypeSelect, state.controls.interiorType);

  setInputValue(dom.trimSizeSelect, state.controls.trimSize);
  setInputValue(dom.marginPresetSelect, state.controls.marginPreset);
  setInputValue(dom.pageNumberStartInput, String(state.controls.pageNumberStart));
  setInputValue(dom.gutterModeSelect, state.controls.gutterMode);

  setChecked(dom.startChaptersRightToggle, state.controls.startChaptersRight);
  setChecked(dom.showPrintGuidesToggle, state.controls.showPrintGuides);
  setChecked(dom.cropMarksToggle, state.controls.cropMarks);
  setChecked(dom.bleedToggle, state.controls.bleed);

  setInputValue(dom.bodyFontSelect, state.controls.bodyFont);
  setInputValue(dom.headingFontSelect, state.controls.headingFont);
  setInputValue(dom.fontSizeRange, String(state.controls.fontSize));
  setInputValue(dom.lineHeightRange, String(state.controls.lineHeight));
  setInputValue(dom.paragraphSpacingRange, String(state.controls.paragraphSpacing));
  setInputValue(dom.paragraphIndentRange, String(state.controls.paragraphIndent));

  setChecked(dom.justifyTextToggle, state.controls.justifyText);
  setChecked(dom.hyphenationToggle, state.controls.hyphenation);
  setChecked(dom.ligaturesToggle, state.controls.ligatures);
  setChecked(dom.dropCapsToggle, state.controls.dropCaps);

  setInputValue(dom.chapterSpacingRange, String(state.controls.chapterSpacing));
  setInputValue(dom.chapterTitleScaleRange, String(state.controls.chapterTitleScale));
  setChecked(dom.showChapterNumbersToggle, state.controls.showChapterNumbers);
  setChecked(dom.showChapterOrnamentsToggle, state.controls.showChapterOrnaments);
  setChecked(dom.uppercaseChapterTitlesToggle, state.controls.uppercaseChapterTitles);
  setChecked(dom.keepChapterFirstParagraphFlushToggle, state.controls.keepChapterFirstParagraphFlush);

  setChecked(dom.includeTitlePageToggle, state.controls.includeTitlePage);
  setChecked(dom.includeCoverPageToggle, state.controls.includeCoverPage);
  setChecked(dom.includeCopyrightToggle, state.controls.includeCopyright);
  setChecked(dom.includeDedicationToggle, state.controls.includeDedication);
  setChecked(dom.includeEpigraphToggle, state.controls.includeEpigraph);
  setChecked(dom.includeTocToggle, state.controls.includeToc);
  setChecked(dom.includeBackMatterToggle, state.controls.includeBackMatter);

  setChecked(dom.showRunningHeadersToggle, state.controls.showRunningHeaders);
  setChecked(dom.showPageNumbersToggle, state.controls.showPageNumbers);
  setChecked(dom.skipFrontMatterPageNumbersToggle, state.controls.skipFrontMatterPageNumbers);
  setChecked(dom.showAuthorOnLeftPagesToggle, state.controls.showAuthorOnLeftPages);
  setChecked(dom.showChapterOnRightPagesToggle, state.controls.showChapterOnRightPages);

  updateRangeReadouts();
}

function setInputValue(input, value) {
  if (input) input.value = value;
}

function setChecked(input, value) {
  if (input) input.checked = !!value;
}

function updateRangeReadouts() {
  if (dom.fontSizeValue) dom.fontSizeValue.textContent = `${state.controls.fontSize} pt`;
  if (dom.lineHeightValue) dom.lineHeightValue.textContent = `${state.controls.lineHeight}`;
  if (dom.paragraphSpacingValue) dom.paragraphSpacingValue.textContent = `${state.controls.paragraphSpacing} em`;
  if (dom.paragraphIndentValue) dom.paragraphIndentValue.textContent = `${state.controls.paragraphIndent} em`;
  if (dom.chapterSpacingValue) dom.chapterSpacingValue.textContent = `${state.controls.chapterSpacing} rem`;
  if (dom.chapterTitleScaleValue) dom.chapterTitleScaleValue.textContent = `${state.controls.chapterTitleScale}×`;
}

function applyControlStateToDocument() {
  applyTrimSize();
  applyMarginPreset();
  applyTypographySettings();
  applyTemplateSettings();
  applyPreviewFlags();
  applyRunningMatterSettings();
  applyPreviewScale(state.currentPreviewScale);
  updateRangeReadouts();
}

function applyTrimSize() {
  const trimMap = {
    "4.25x6.87": { width: "4.25in", height: "6.87in" },
    "5x8": { width: "5in", height: "8in" },
    "5.25x8": { width: "5.25in", height: "8in" },
    "5.5x8.5": { width: "5.5in", height: "8.5in" },
    "6x9": { width: "6in", height: "9in" },
    "8.5x11": { width: "8.5in", height: "11in" }
  };

  const trim = trimMap[state.controls.trimSize] || trimMap["5.5x8.5"];
  document.documentElement.style.setProperty("--trim-width", trim.width);
  document.documentElement.style.setProperty("--trim-height", trim.height);
}

function applyMarginPreset() {
  let preset = {
    top: "0.9in",
    bottom: "0.9in",
    inner: "0.9in",
    outer: "0.7in"
  };

  if (state.controls.marginPreset === "compact") {
    preset = { top: "0.7in", bottom: "0.75in", inner: "0.75in", outer: "0.62in" };
  }

  if (state.controls.marginPreset === "wide") {
    preset = { top: "1in", bottom: "1.05in", inner: "1in", outer: "0.82in" };
  }

  document.documentElement.style.setProperty("--page-margin-top", preset.top);
  document.documentElement.style.setProperty("--page-margin-bottom", preset.bottom);
  document.documentElement.style.setProperty("--page-margin-inner", preset.inner);
  document.documentElement.style.setProperty("--page-margin-outer", preset.outer);
}

function applyTypographySettings() {
  const bodyFontMap = {
    merriweather: `"Merriweather", serif`,
    crimson: `"Crimson Text", serif`,
    lato: `"Lato", sans-serif`
  };

  const headingFontMap = {
    lato: `"Lato", sans-serif`,
    merriweather: `"Merriweather", serif`,
    crimson: `"Crimson Text", serif`
  };

  document.documentElement.style.setProperty("--book-font-body", bodyFontMap[state.controls.bodyFont] || bodyFontMap.merriweather);
  document.documentElement.style.setProperty("--book-font-heading", headingFontMap[state.controls.headingFont] || headingFontMap.lato);
  document.documentElement.style.setProperty("--book-font-size", `${state.controls.fontSize}pt`);
  document.documentElement.style.setProperty("--book-line-height", String(state.controls.lineHeight));
  document.documentElement.style.setProperty("--book-paragraph-spacing", `${state.controls.paragraphSpacing}em`);
  document.documentElement.style.setProperty("--book-paragraph-indent", `${state.controls.paragraphIndent}em`);
  document.documentElement.style.setProperty("--chapter-top-spacing", `${state.controls.chapterSpacing}rem`);
  document.documentElement.style.setProperty("--chapter-title-scale", String(state.controls.chapterTitleScale));
}

function applyTemplateSettings() {
  dom.body.dataset.template = state.controls.template;
  dom.body.classList.remove("theme-reedsy", "theme-classic", "theme-romance");
  dom.body.classList.add(`theme-${state.controls.template}`);
}

function applyPreviewFlags() {
  dom.body.classList.toggle("show-print-guides", !!state.controls.showPrintGuides);
  dom.body.classList.toggle("show-crop-marks", !!state.controls.cropMarks);
  dom.body.classList.toggle("enable-bleed", !!state.controls.bleed);
  dom.body.classList.toggle("hide-page-numbers", !state.controls.showPageNumbers);
  dom.body.classList.toggle("hide-running-headers", !state.controls.showRunningHeaders);
  dom.body.classList.toggle("flush-chapter-openers", !!state.controls.keepChapterFirstParagraphFlush);

  document.documentElement.style.setProperty(
    "--body-text-align",
    state.controls.justifyText ? "justify" : "left"
  );

  document.documentElement.style.setProperty(
    "--body-hyphens",
    state.controls.hyphenation ? "auto" : "manual"
  );

  document.documentElement.style.setProperty(
    "--body-font-variant-ligatures",
    state.controls.ligatures ? "common-ligatures discretionary-ligatures" : "none"
  );
}

function applyRunningMatterSettings() {
  document.documentElement.style.setProperty(
    "--left-running-content",
    state.controls.showAuthorOnLeftPages ? "string(book-author)" : '""'
  );

  document.documentElement.style.setProperty(
    "--right-running-content",
    state.controls.showChapterOnRightPages ? "string(chapter-title)" : '""'
  );
}

/* =========================================================
   EVENTS
========================================================= */

function bindAppEvents() {
  dom.refreshBookBtn?.addEventListener("click", loadBookAndRender);
  dom.reloadBtn?.addEventListener("click", loadBookAndRender);
  dom.rebuildPreviewBtn?.addEventListener("click", () => {
    renderEverything();
  });

  dom.openPrintPreviewBtn?.addEventListener("click", () => {
    window.print();
  });

  dom.exportPdfBtn?.addEventListener("click", exportPdf);
  dom.exportPdfSidebarBtn?.addEventListener("click", exportPdf);
  dom.renderPagedBtn?.addEventListener("click", rerenderPagination);
  dom.downloadLayoutJsonBtn?.addEventListener("click", downloadLayoutJson);

  dom.mobileOpenLeftBtn?.addEventListener("click", () => openSidebar("left"));
  dom.mobileOpenRightBtn?.addEventListener("click", () => openSidebar("right"));
  dom.sidebarBackdrop?.addEventListener("click", closeMobileSidebars);

  dom.zoomOutBtn?.addEventListener("click", () => bumpZoom(-0.1));
  dom.zoomInBtn?.addEventListener("click", () => bumpZoom(0.1));
  dom.zoomSelect?.addEventListener("change", () => {
    state.currentPreviewScale = parseFloat(dom.zoomSelect.value);
    applyPreviewScale(state.currentPreviewScale);
  });

  dom.fitWidthBtn?.addEventListener("click", () => {
    state.currentPreviewScale = window.innerWidth <= 900 ? 1 : 0.9;
    syncZoomUi();
    applyPreviewScale(state.currentPreviewScale);
  });

  dom.fitPageBtn?.addEventListener("click", () => {
    state.currentPreviewScale = window.innerWidth <= 900 ? 0.85 : 0.8;
    syncZoomUi();
    applyPreviewScale(state.currentPreviewScale);
  });

  bindControl(dom.exportTypeSelect, "exportType");
  bindControl(dom.templateSelect, "template");
  bindControl(dom.languageSelect, "language");
  bindControl(dom.interiorTypeSelect, "interiorType");

  bindControl(dom.trimSizeSelect, "trimSize");
  bindControl(dom.marginPresetSelect, "marginPreset");
  bindNumericControl(dom.pageNumberStartInput, "pageNumberStart");
  bindControl(dom.gutterModeSelect, "gutterMode");

  bindCheckedControl(dom.startChaptersRightToggle, "startChaptersRight");
  bindCheckedControl(dom.showPrintGuidesToggle, "showPrintGuides");
  bindCheckedControl(dom.cropMarksToggle, "cropMarks");
  bindCheckedControl(dom.bleedToggle, "bleed");

  bindControl(dom.bodyFontSelect, "bodyFont");
  bindControl(dom.headingFontSelect, "headingFont");
  bindFloatControl(dom.fontSizeRange, "fontSize");
  bindFloatControl(dom.lineHeightRange, "lineHeight");
  bindFloatControl(dom.paragraphSpacingRange, "paragraphSpacing");
  bindFloatControl(dom.paragraphIndentRange, "paragraphIndent");

  bindCheckedControl(dom.justifyTextToggle, "justifyText");
  bindCheckedControl(dom.hyphenationToggle, "hyphenation");
  bindCheckedControl(dom.ligaturesToggle, "ligatures");
  bindCheckedControl(dom.dropCapsToggle, "dropCaps");

  bindFloatControl(dom.chapterSpacingRange, "chapterSpacing");
  bindFloatControl(dom.chapterTitleScaleRange, "chapterTitleScale");
  bindCheckedControl(dom.showChapterNumbersToggle, "showChapterNumbers");
  bindCheckedControl(dom.showChapterOrnamentsToggle, "showChapterOrnaments");
  bindCheckedControl(dom.uppercaseChapterTitlesToggle, "uppercaseChapterTitles");
  bindCheckedControl(dom.keepChapterFirstParagraphFlushToggle, "keepChapterFirstParagraphFlush");

  bindCheckedControl(dom.includeTitlePageToggle, "includeTitlePage");
  bindCheckedControl(dom.includeCoverPageToggle, "includeCoverPage");
  bindCheckedControl(dom.includeCopyrightToggle, "includeCopyright");
  bindCheckedControl(dom.includeDedicationToggle, "includeDedication");
  bindCheckedControl(dom.includeEpigraphToggle, "includeEpigraph");
  bindCheckedControl(dom.includeTocToggle, "includeToc");
  bindCheckedControl(dom.includeBackMatterToggle, "includeBackMatter");

  bindCheckedControl(dom.showRunningHeadersToggle, "showRunningHeaders");
  bindCheckedControl(dom.showPageNumbersToggle, "showPageNumbers");
  bindCheckedControl(dom.skipFrontMatterPageNumbersToggle, "skipFrontMatterPageNumbers");
  bindCheckedControl(dom.showAuthorOnLeftPagesToggle, "showAuthorOnLeftPages");
  bindCheckedControl(dom.showChapterOnRightPagesToggle, "showChapterOnRightPages");

  dom.closeDebugBtn?.addEventListener("click", () => {
    state.debugOpen = false;
    dom.debugDrawer.hidden = true;
  });

  window.addEventListener("resize", handleResponsiveResize);
}

function bindControl(input, key) {
  if (!input) return;
  input.addEventListener("change", () => {
    state.controls[key] = input.value;
    debounceRerender();
  });
}

function bindNumericControl(input, key) {
  if (!input) return;
  input.addEventListener("input", () => {
    state.controls[key] = parseInt(input.value || "1", 10);
    debounceRerender();
  });
}

function bindFloatControl(input, key) {
  if (!input) return;
  input.addEventListener("input", () => {
    state.controls[key] = parseFloat(input.value);
    debounceRerender();
  });
}

function bindCheckedControl(input, key) {
  if (!input) return;
  input.addEventListener("change", () => {
    state.controls[key] = input.checked;
    debounceRerender();
  });
}

function rerenderFromControls() {
  applyControlStateToDocument();
  if (state.currentBook) {
    renderEverything();
  } else {
    updateMetaChips();
  }
}

function handleResponsiveResize() {
  if (window.innerWidth > 900) closeMobileSidebars(true);
}

/* =========================================================
   MOBILE SIDEBARS
========================================================= */

function openSidebar(side) {
  if (window.innerWidth > 900) return;

  if (side === "left") {
    dom.leftSidebar?.classList.add("is-open");
    dom.rightSidebar?.classList.remove("is-open");
  }

  if (side === "right") {
    dom.rightSidebar?.classList.add("is-open");
    dom.leftSidebar?.classList.remove("is-open");
  }

  if (dom.sidebarBackdrop) dom.sidebarBackdrop.hidden = false;
}

function closeMobileSidebars(force = false) {
  if (window.innerWidth > 900 && !force) return;

  dom.leftSidebar?.classList.remove("is-open");
  dom.rightSidebar?.classList.remove("is-open");
  if (dom.sidebarBackdrop) dom.sidebarBackdrop.hidden = true;
}

/* =========================================================
   ZOOM
========================================================= */

function bumpZoom(delta) {
  const allowed = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
  const current = state.currentPreviewScale;
  let closestIndex = 0;
  let closestDistance = Infinity;

  allowed.forEach((value, index) => {
    const distance = Math.abs(value - current);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  const nextIndex = Math.max(0, Math.min(allowed.length - 1, closestIndex + (delta > 0 ? 1 : -1)));
  state.currentPreviewScale = allowed[nextIndex];
  syncZoomUi();
  applyPreviewScale(state.currentPreviewScale);
}

function syncZoomUi() {
  if (dom.zoomSelect) dom.zoomSelect.value = String(state.currentPreviewScale);
}

function applyPreviewScale(scale) {
  if (!dom.previewScaleFrame) return;
  dom.previewScaleFrame.style.transform = `scale(${scale})`;
  dom.previewScaleFrame.style.transformOrigin = "top center";
}

/* =========================================================
   EXPORT / PAGED RENDER
========================================================= */

function exportPdf() {
  setRenderStatus("Opening print dialog…");
  window.print();
}

function rerenderPagination() {
  if (!state.currentBook) return;
  setRenderStatus("Re-rendering pagination…");
  renderEverything();
}

function downloadLayoutJson() {
  const payload = {
    bookId: state.currentBookId,
    user: state.currentUser?.uid || null,
    controls: state.controls,
    renderedPageCount: state.renderedPageCount,
    targetPageMap: state.targetPageMap,
    book: state.currentBook
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `format-layout-${state.currentBookId || "book"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   DEBUG
========================================================= */

function renderDebug() {
  if (!dom.debugOutput) return;

  const debug = {
    authReady: state.authReady,
    dbReady: state.dbReady,
    pagedReady: state.pagedReady,
    currentUser: state.currentUser
      ? { uid: state.currentUser.uid, email: state.currentUser.email || null }
      : null,
    currentBookId: state.currentBookId,
    renderedPageCount: state.renderedPageCount,
    targetPageMap: state.targetPageMap,
    controls: state.controls,
    counts: {
      front: state.currentBook?.sections.front.length || 0,
      body: state.currentBook?.sections.body.length || 0,
      back: state.currentBook?.sections.back.length || 0,
      totalWords: state.currentBook?.words || computeTotalWords(state.currentBook)
    }
  };

  dom.debugOutput.textContent = JSON.stringify(debug, null, 2);
}

/* =========================================================
   IDS / TARGETS
========================================================= */

function getSectionDomId(sectionType, index, itemId) {
  return `flow-${sectionType}-${index}-${safeString(itemId, generateId())}`;
}

/* =========================================================
   UTILITIES
========================================================= */

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function cssString(value) {
  return safeString(value).replace(/"/g, '\\"');
}
