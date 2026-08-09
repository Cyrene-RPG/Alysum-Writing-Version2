/**
 * Book creation modal with title + media format picker, or import from Word/Google Docs.
 */
import {
  MEDIA_FORMAT_NOVEL,
  MEDIA_FORMAT_OPTIONS,
  isComicFormat,
} from "./book-media-format.js?v=3";
import {
  importManuscriptFile,
  isAcceptedImportFile,
  acceptedImportAcceptAttr,
} from "./book-import.js?v=1";

let styleInjected = false;

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = `
    .book-create-root {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2, 8, 20, 0.72);
      backdrop-filter: blur(6px);
    }
    .book-create-box {
      width: min(100%, 520px);
      max-height: min(92vh, 720px);
      overflow: auto;
      padding: 24px 24px 20px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: linear-gradient(165deg, #1a2744 0%, #111827 100%);
      color: #f1f5f9;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .book-create-title {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 800;
    }
    .book-create-sub {
      margin: 0 0 18px;
      font-size: 14px;
      line-height: 1.45;
      color: #94a3b8;
    }
    .book-create-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 18px;
    }
    .book-create-tab {
      flex: 1;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: border-color 0.12s ease, background 0.12s ease;
    }
    .book-create-tab.is-active {
      border-color: rgba(167, 139, 250, 0.65);
      background: rgba(109, 40, 217, 0.22);
      color: #fff;
    }
    .book-create-panel { display: none; }
    .book-create-panel.is-active { display: block; }
    .book-create-label {
      display: block;
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #cbd5e1;
    }
    .book-create-input {
      width: 100%;
      box-sizing: border-box;
      padding: 11px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(0, 0, 0, 0.28);
      color: #fff;
      font-size: 15px;
      outline: none;
      margin-bottom: 18px;
    }
    .book-create-input:focus {
      border-color: rgba(124, 58, 237, 0.65);
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.22);
    }
    .book-create-format-grid {
      display: grid;
      gap: 10px;
      margin-bottom: 14px;
    }
    .book-create-format-opt {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      text-align: left;
      color: inherit;
      transition: border-color 0.12s ease, background 0.12s ease;
    }
    .book-create-format-opt:hover {
      background: rgba(255, 255, 255, 0.07);
    }
    .book-create-format-opt.is-selected {
      border-color: rgba(167, 139, 250, 0.65);
      background: rgba(109, 40, 217, 0.18);
    }
    .book-create-format-opt input {
      margin-top: 3px;
      accent-color: #7c3aed;
    }
    .book-create-format-name {
      font-size: 15px;
      font-weight: 800;
      margin-bottom: 2px;
    }
    .book-create-format-desc {
      font-size: 13px;
      line-height: 1.4;
      color: #94a3b8;
    }
    .book-create-comic-note {
      display: none;
      margin: 0 0 16px;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(167, 139, 250, 0.28);
      background: rgba(109, 40, 217, 0.12);
      font-size: 13px;
      line-height: 1.45;
      color: #ddd6fe;
    }
    .book-create-comic-note.is-visible { display: block; }
    .book-create-drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 28px 16px;
      margin-bottom: 14px;
      border-radius: 12px;
      border: 2px dashed rgba(167, 139, 250, 0.35);
      background: rgba(109, 40, 217, 0.08);
      cursor: pointer;
      text-align: center;
      transition: border-color 0.12s ease, background 0.12s ease;
    }
    .book-create-drop:hover,
    .book-create-drop.is-dragover {
      border-color: rgba(167, 139, 250, 0.65);
      background: rgba(109, 40, 217, 0.14);
    }
    .book-create-drop-icon {
      font-size: 28px;
      line-height: 1;
    }
    .book-create-drop-title {
      font-size: 15px;
      font-weight: 800;
    }
    .book-create-drop-sub {
      font-size: 13px;
      line-height: 1.45;
      color: #94a3b8;
      max-width: 320px;
    }
    .book-create-file-name {
      margin: 0 0 12px;
      font-size: 13px;
      color: #c4b5fd;
      word-break: break-word;
    }
    .book-create-preview {
      margin: 0 0 14px;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.22);
      max-height: 180px;
      overflow: auto;
    }
    .book-create-preview-title {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .book-create-preview-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .book-create-preview-list li {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 13px;
    }
    .book-create-preview-list li:last-child { border-bottom: none; }
    .book-create-preview-list .is-front {
      color: #94a3b8;
      font-style: italic;
    }
    .book-create-preview-meta {
      flex-shrink: 0;
      color: #64748b;
      font-size: 12px;
    }
    .book-create-status {
      margin: 0 0 12px;
      font-size: 13px;
      line-height: 1.45;
      color: #94a3b8;
    }
    .book-create-status.is-error { color: #fca5a5; }
    .book-create-status.is-loading { color: #c4b5fd; }
    .book-create-tip {
      margin: 0 0 14px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      font-size: 12px;
      line-height: 1.5;
      color: #94a3b8;
    }
    .book-create-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }
    .book-create-btn {
      padding: 10px 18px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .book-create-btn:hover { background: rgba(255, 255, 255, 0.1); }
    .book-create-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .book-create-btn--primary {
      border-color: transparent;
      background: linear-gradient(135deg, #6d28d9, #7c3aed);
      color: #fff;
    }
    .book-create-btn--primary:hover:not(:disabled) { filter: brightness(1.06); }
    .book-create-hidden-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
  `;
  document.head.appendChild(el);
}

/**
 * @returns {Promise<
 *   | { title: string, mediaFormat: string }
 *   | { title: string, mediaFormat: string, sections: object, words: number, imported: true }
 *   | null
 * >}
 */
export function showBookCreateModal() {
  injectStyles();
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "book-create-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");

    const box = document.createElement("div");
    box.className = "book-create-box";

    const heading = document.createElement("h2");
    heading.className = "book-create-title";
    heading.textContent = "Create a new book";

    const sub = document.createElement("p");
    sub.className = "book-create-sub";
    sub.textContent = "Start blank or import from Word, Google Docs, or HTML.";

    const tabs = document.createElement("div");
    tabs.className = "book-create-tabs";
    tabs.setAttribute("role", "tablist");

    const blankTab = document.createElement("button");
    blankTab.type = "button";
    blankTab.className = "book-create-tab is-active";
    blankTab.textContent = "Blank book";
    blankTab.setAttribute("role", "tab");
    blankTab.setAttribute("aria-selected", "true");

    const importTab = document.createElement("button");
    importTab.type = "button";
    importTab.className = "book-create-tab";
    importTab.textContent = "Import manuscript";
    importTab.setAttribute("role", "tab");
    importTab.setAttribute("aria-selected", "false");

    tabs.append(blankTab, importTab);

    const blankPanel = document.createElement("div");
    blankPanel.className = "book-create-panel is-active";
    blankPanel.setAttribute("role", "tabpanel");

    const importPanel = document.createElement("div");
    importPanel.className = "book-create-panel";
    importPanel.setAttribute("role", "tabpanel");

    const titleLabel = document.createElement("label");
    titleLabel.className = "book-create-label";
    titleLabel.textContent = "Title";
    titleLabel.setAttribute("for", "book-create-title-input");

    const titleInput = document.createElement("input");
    titleInput.id = "book-create-title-input";
    titleInput.type = "text";
    titleInput.className = "book-create-input";
    titleInput.placeholder = "Untitled Book";
    titleInput.autocomplete = "off";

    const formatLabel = document.createElement("div");
    formatLabel.className = "book-create-label";
    formatLabel.textContent = "Format";

    const formatGrid = document.createElement("div");
    formatGrid.className = "book-create-format-grid";
    formatGrid.setAttribute("role", "radiogroup");
    formatGrid.setAttribute("aria-label", "Book format");

    let selectedFormat = MEDIA_FORMAT_NOVEL;

    MEDIA_FORMAT_OPTIONS.forEach((opt) => {
      const btn = document.createElement("label");
      btn.className =
        "book-create-format-opt" + (opt.value === selectedFormat ? " is-selected" : "");
      btn.innerHTML = `
        <input type="radio" name="book-create-format" value="${opt.value}" ${
          opt.value === selectedFormat ? "checked" : ""
        } />
        <span>
          <div class="book-create-format-name">${opt.label}</div>
          <div class="book-create-format-desc">${opt.description}</div>
        </span>
      `;
      const radio = btn.querySelector("input");
      radio.addEventListener("change", () => {
        selectedFormat = opt.value;
        formatGrid.querySelectorAll(".book-create-format-opt").forEach((el) => {
          el.classList.toggle("is-selected", el.contains(radio) && radio.checked);
        });
        comicNote.classList.toggle("is-visible", isComicFormat(selectedFormat));
      });
      formatGrid.appendChild(btn);
    });

    const comicNote = document.createElement("p");
    comicNote.className = "book-create-comic-note";
    comicNote.textContent =
      "After creating, upload one or more strip images per chapter in the editor. Readers scroll them vertically like a webtoon.";

    blankPanel.append(titleLabel, titleInput, formatLabel, formatGrid, comicNote);

    const importTitleLabel = document.createElement("label");
    importTitleLabel.className = "book-create-label";
    importTitleLabel.textContent = "Title";
    importTitleLabel.setAttribute("for", "book-import-title-input");

    const importTitleInput = document.createElement("input");
    importTitleInput.id = "book-import-title-input";
    importTitleInput.type = "text";
    importTitleInput.className = "book-create-input";
    importTitleInput.placeholder = "Untitled Book";
    importTitleInput.autocomplete = "off";

    const importTip = document.createElement("p");
    importTip.className = "book-create-tip";
    importTip.innerHTML =
      "<strong>Word:</strong> upload a .docx file. Use <em>Heading 1</em> for each chapter.<br>" +
      "<strong>Google Docs:</strong> File → Download → Microsoft Word (.docx), or Web Page (.html).";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.className = "book-create-hidden-input";
    fileInput.accept = acceptedImportAcceptAttr();

    const dropZone = document.createElement("div");
    dropZone.className = "book-create-drop";
    dropZone.innerHTML = `
      <div class="book-create-drop-icon">📄</div>
      <div class="book-create-drop-title">Drop your manuscript here</div>
      <div class="book-create-drop-sub">.docx from Word or Google Docs, or .html export</div>
    `;

    const fileNameEl = document.createElement("p");
    fileNameEl.className = "book-create-file-name";
    fileNameEl.hidden = true;

    const importStatus = document.createElement("p");
    importStatus.className = "book-create-status";
    importStatus.hidden = true;

    const previewBox = document.createElement("div");
    previewBox.className = "book-create-preview";
    previewBox.hidden = true;

    importPanel.append(
      importTitleLabel,
      importTitleInput,
      importTip,
      dropZone,
      fileInput,
      fileNameEl,
      importStatus,
      previewBox
    );

    let activeMode = "blank";
    let importResult = null;
    let importBusy = false;

    function setMode(mode) {
      activeMode = mode;
      const isBlank = mode === "blank";
      blankTab.classList.toggle("is-active", isBlank);
      importTab.classList.toggle("is-active", !isBlank);
      blankTab.setAttribute("aria-selected", isBlank ? "true" : "false");
      importTab.setAttribute("aria-selected", !isBlank ? "true" : "false");
      blankPanel.classList.toggle("is-active", isBlank);
      importPanel.classList.toggle("is-active", !isBlank);
      createBtn.textContent = isBlank ? "Create book" : "Import book";
      if (!isBlank) importTitleInput.focus();
      else titleInput.focus();
    }

    function renderPreview(result) {
      if (!result?.preview?.length) {
        previewBox.hidden = true;
        return;
      }
      previewBox.hidden = false;
      previewBox.innerHTML = "";
      const title = document.createElement("div");
      title.className = "book-create-preview-title";
      title.textContent = `${result.chapterCount} chapter${result.chapterCount === 1 ? "" : "s"} detected · ${result.words.toLocaleString()} words`;
      const list = document.createElement("ul");
      list.className = "book-create-preview-list";
      for (const ch of result.preview) {
        const li = document.createElement("li");
        li.className = ch.isFrontMatter ? "is-front" : "";
        li.innerHTML = `<span>${escapeHtml(ch.title || "Untitled")}</span><span class="book-create-preview-meta">${ch.wordCount.toLocaleString()} w</span>`;
        list.appendChild(li);
      }
      previewBox.append(title, list);
    }

    function setImportStatus(text, kind = "") {
      importStatus.hidden = !text;
      importStatus.textContent = text || "";
      importStatus.classList.toggle("is-error", kind === "error");
      importStatus.classList.toggle("is-loading", kind === "loading");
    }

    async function handleImportFile(file) {
      if (!file || !isAcceptedImportFile(file)) {
        setImportStatus("Please choose a .docx or .html file.", "error");
        return;
      }
      importBusy = true;
      createBtn.disabled = true;
      importResult = null;
      fileNameEl.hidden = false;
      fileNameEl.textContent = file.name;
      setImportStatus("Reading and splitting chapters…", "loading");
      previewBox.hidden = true;

      try {
        const result = await importManuscriptFile(file);
        importResult = result;
        if (!importTitleInput.value.trim()) {
          importTitleInput.value = result.suggestedTitle || "";
        }
        renderPreview(result);
        const warnCount = result.warnings?.length || 0;
        setImportStatus(
          warnCount
            ? `Imported with ${warnCount} formatting note${warnCount === 1 ? "" : "s"}. Review in the editor.`
            : "Ready to import. Headings and formatting will be preserved.",
          ""
        );
      } catch (err) {
        importResult = null;
        setImportStatus(err.message || "Could not read that file.", "error");
      } finally {
        importBusy = false;
        createBtn.disabled = false;
      }
    }

    blankTab.addEventListener("click", () => setMode("blank"));
    importTab.addEventListener("click", () => setMode("import"));

    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleImportFile(file);
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("is-dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("is-dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImportFile(file);
    });

    const actions = document.createElement("div");
    actions.className = "book-create-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "book-create-btn";
    cancelBtn.textContent = "Cancel";

    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "book-create-btn book-create-btn--primary";
    createBtn.textContent = "Create book";

    function finish(value) {
      root.remove();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    }

    function submitBlank() {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.focus();
        return;
      }
      finish({ title, mediaFormat: selectedFormat });
    }

    function submitImport() {
      if (importBusy) return;
      const title = importTitleInput.value.trim();
      if (!title) {
        importTitleInput.focus();
        return;
      }
      if (!importResult?.sections) {
        setImportStatus("Upload a manuscript file first.", "error");
        return;
      }
      finish({
        title,
        mediaFormat: MEDIA_FORMAT_NOVEL,
        sections: importResult.sections,
        words: importResult.words,
        imported: true,
      });
    }

    function submit() {
      if (activeMode === "import") submitImport();
      else submitBlank();
    }

    function onKey(e) {
      if (e.key === "Escape") finish(null);
      if (e.key === "Enter" && (document.activeElement === titleInput || document.activeElement === importTitleInput)) {
        submit();
      }
    }

    cancelBtn.addEventListener("click", () => finish(null));
    createBtn.addEventListener("click", submit);
    root.addEventListener("click", (e) => {
      if (e.target === root) finish(null);
    });

    actions.append(cancelBtn, createBtn);
    box.append(heading, sub, tabs, blankPanel, importPanel, actions);
    root.append(box);
    document.body.append(root);
    document.addEventListener("keydown", onKey);
    titleInput.focus();
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
