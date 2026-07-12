/**
 * Book creation modal with title + media format picker.
 */
import {
  MEDIA_FORMAT_NOVEL,
  MEDIA_FORMAT_OPTIONS,
  isComicFormat,
} from "./book-media-format.js?v=1";

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
      width: min(100%, 480px);
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
    .book-create-btn--primary {
      border-color: transparent;
      background: linear-gradient(135deg, #6d28d9, #7c3aed);
      color: #fff;
    }
    .book-create-btn--primary:hover { filter: brightness(1.06); }
  `;
  document.head.appendChild(el);
}

/**
 * @returns {Promise<{ title: string, mediaFormat: string } | null>}
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
    sub.textContent = "Choose a title and what kind of story you are making.";

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
      "After creating your book, you can upload page images in the editor — one page per chapter slot.";

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

    function submit() {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.focus();
        return;
      }
      finish({ title, mediaFormat: selectedFormat });
    }

    function onKey(e) {
      if (e.key === "Escape") finish(null);
      if (e.key === "Enter" && document.activeElement === titleInput) submit();
    }

    cancelBtn.addEventListener("click", () => finish(null));
    createBtn.addEventListener("click", submit);
    root.addEventListener("click", (e) => {
      if (e.target === root) finish(null);
    });

    actions.append(cancelBtn, createBtn);
    box.append(heading, sub, titleLabel, titleInput, formatLabel, formatGrid, comicNote, actions);
    root.append(box);
    document.body.append(root);
    document.addEventListener("keydown", onKey);
    titleInput.focus();
  });
}
