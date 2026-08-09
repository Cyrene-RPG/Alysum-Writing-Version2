/**
 * Screenplay / script editor — element types, keyboard flow, and HTML normalization.
 * Uses semantic <p class="script-*"> blocks stored in chapter HTML (same model as prose).
 */

export const SCRIPT_ELEMENTS = [
  { id: "scene", label: "Scene", className: "script-scene", shortcut: "1", uppercase: true },
  { id: "action", label: "Action", className: "script-action", shortcut: "2", uppercase: false },
  { id: "character", label: "Character", className: "script-character", shortcut: "3", uppercase: true },
  { id: "dialogue", label: "Dialogue", className: "script-dialogue", shortcut: "4", uppercase: false },
  { id: "parenthetical", label: "Paren", className: "script-parenthetical", shortcut: "5", uppercase: false },
  { id: "transition", label: "Trans", className: "script-transition", shortcut: "6", uppercase: true },
  { id: "shot", label: "Shot", className: "script-shot", shortcut: "7", uppercase: true },
];

export const SCRIPT_ELEMENT_BY_ID = Object.fromEntries(SCRIPT_ELEMENTS.map((el) => [el.id, el]));
export const SCRIPT_CLASS_TO_ID = Object.fromEntries(SCRIPT_ELEMENTS.map((el) => [el.className, el.id]));
export const SCRIPT_ELEMENT_CLASSES = new Set(SCRIPT_ELEMENTS.map((el) => el.className));
export const DEFAULT_SCRIPT_ELEMENT = "scene";

const ENTER_NEXT = {
  scene: "action",
  action: "action",
  character: "dialogue",
  dialogue: "dialogue",
  parenthetical: "dialogue",
  transition: "scene",
  shot: "action",
};

const EMPTY_ENTER_NEXT = {
  scene: "action",
  action: "action",
  character: "action",
  dialogue: "action",
  parenthetical: "action",
  transition: "scene",
  shot: "action",
};

const TAB_CYCLE = ["scene", "action", "character", "dialogue", "parenthetical", "transition", "shot"];

const SCENE_PREFIXES = ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "I/E."];

function stripTags(html) {
  return String(html || "").replace(/<[^>]+>/g, "");
}

export function getScriptElementType(paragraph) {
  if (!paragraph || paragraph.tagName !== "P") return DEFAULT_SCRIPT_ELEMENT;
  for (const cls of paragraph.classList) {
    if (SCRIPT_CLASS_TO_ID[cls]) return SCRIPT_CLASS_TO_ID[cls];
  }
  return DEFAULT_SCRIPT_ELEMENT;
}

export function setScriptElementType(paragraph, typeId) {
  const def = SCRIPT_ELEMENT_BY_ID[typeId] || SCRIPT_ELEMENT_BY_ID[DEFAULT_SCRIPT_ELEMENT];
  if (!paragraph || paragraph.tagName !== "P") return;
  paragraph.className = def.className;
  if (def.uppercase) {
    const text = paragraph.textContent || "";
    const upper = text.toUpperCase();
    if (text !== upper) paragraph.textContent = upper;
  }
  if (typeId === "parenthetical") {
    const text = (paragraph.textContent || "").trim();
    if (text && !text.startsWith("(")) {
      paragraph.textContent = `(${text.replace(/^\(|\)$/g, "")})`;
    }
  }
}

export function createScriptParagraph(typeId, text = "") {
  const def = SCRIPT_ELEMENT_BY_ID[typeId] || SCRIPT_ELEMENT_BY_ID[DEFAULT_SCRIPT_ELEMENT];
  const p = document.createElement("p");
  p.className = def.className;
  if (text) p.textContent = text;
  setScriptElementType(p, typeId);
  return p;
}

function getBlockParagraph(node, root) {
  let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== root) {
    if (el.tagName === "P") return el;
    el = el.parentElement;
  }
  return null;
}

function isEmptyParagraph(p) {
  return !stripTags(p?.innerHTML || "").replace(/\u00a0|\u200B/g, "").trim();
}

function placeCaretIn(paragraph, atEnd = true) {
  if (!paragraph) return;
  const range = document.createRange();
  const sel = window.getSelection();
  if (!sel) return;
  if (atEnd) {
    range.selectNodeContents(paragraph);
    range.collapse(false);
  } else {
    range.setStart(paragraph, 0);
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertParagraphAfter(reference, typeId, root) {
  const nextType = typeId;
  const p = createScriptParagraph(nextType);
  if (reference?.nextSibling) reference.parentNode.insertBefore(p, reference.nextSibling);
  else root.appendChild(p);
  placeCaretIn(p, false);
  return p;
}

function splitParagraphAtCaret(paragraph) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return { before: paragraph, after: null };
  const range = sel.getRangeAt(0);
  if (!paragraph.contains(range.startContainer)) return { before: paragraph, after: null };

  const afterRange = range.cloneRange();
  afterRange.selectNodeContents(paragraph);
  afterRange.setStart(range.startContainer, range.startOffset);

  const after = document.createElement("p");
  after.className = paragraph.className;
  after.appendChild(afterRange.extractContents());

  if (paragraph.nextSibling) paragraph.parentNode.insertBefore(after, paragraph.nextSibling);
  else paragraph.parentNode.appendChild(after);

  return { before: paragraph, after };
}

export function handleScriptEnterKey(event, editor) {
  if (!editor || event.key !== "Enter" || event.shiftKey) return false;

  const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
  if (!paragraph) return false;

  event.preventDefault();

  const currentType = getScriptElementType(paragraph);
  const isEmpty = isEmptyParagraph(paragraph);

  if (isEmpty) {
    const nextType = EMPTY_ENTER_NEXT[currentType] || "action";
    if (currentType === "dialogue" || currentType === "parenthetical") {
      setScriptElementType(paragraph, nextType);
      placeCaretIn(paragraph, false);
      return true;
    }
    insertParagraphAfter(paragraph, nextType, editor);
    return true;
  }

  const { before, after } = splitParagraphAtCaret(paragraph);
  const nextType = ENTER_NEXT[currentType] || "action";

  if (after) {
    setScriptElementType(after, nextType);
    placeCaretIn(after, false);
  } else {
    insertParagraphAfter(before, nextType, editor);
  }

  return true;
}

export function handleScriptTabKey(event, editor) {
  if (!editor || event.key !== "Tab") return false;

  const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
  if (!paragraph) return false;

  event.preventDefault();

  const currentType = getScriptElementType(paragraph);
  const idx = TAB_CYCLE.indexOf(currentType);
  const nextIdx = event.shiftKey
    ? (idx <= 0 ? TAB_CYCLE.length - 1 : idx - 1)
    : (idx + 1) % TAB_CYCLE.length;
  const nextType = TAB_CYCLE[nextIdx];

  if (currentType === "scene" && !event.shiftKey && isEmptyParagraph(paragraph)) {
    paragraph.textContent = SCENE_PREFIXES[0] + " ";
    setScriptElementType(paragraph, "scene");
    placeCaretIn(paragraph, true);
    return true;
  }

  setScriptElementType(paragraph, nextType);
  placeCaretIn(paragraph, true);
  return true;
}

export function applyScriptElementToSelection(editor, typeId) {
  if (!editor) return;
  const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
  if (paragraph && editor.contains(paragraph)) {
    setScriptElementType(paragraph, typeId);
    editor.focus();
    placeCaretIn(paragraph, true);
    return;
  }
  const p = createScriptParagraph(typeId);
  editor.appendChild(p);
  editor.focus();
  placeCaretIn(p, false);
}

export function normalizeScriptParagraphAttributes(el) {
  if (el.tagName !== "P") return false;
  const typeId = getScriptElementType(el);
  const def = SCRIPT_ELEMENT_BY_ID[typeId] || SCRIPT_ELEMENT_BY_ID[DEFAULT_SCRIPT_ELEMENT];
  [...el.attributes].forEach((attr) => {
    if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
  });
  el.className = def.className;
  return true;
}

export function isScriptParagraph(el) {
  if (!el || el.tagName !== "P") return false;
  return SCRIPT_ELEMENTS.some(({ className }) => el.classList.contains(className));
}

/** Ensure every paragraph in script HTML has a script element class. */
export function normalizeScriptHtml(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html || "").trim();

  const paragraphs = holder.querySelectorAll("p");
  if (!paragraphs.length) {
    holder.appendChild(createScriptParagraph(DEFAULT_SCRIPT_ELEMENT));
    return holder.innerHTML;
  }

  paragraphs.forEach((p) => {
    if (!isScriptParagraph(p)) {
      const text = (p.textContent || "").trim();
      let inferred = DEFAULT_SCRIPT_ELEMENT;
      const upper = text.toUpperCase();
      if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.|EST\.)/.test(upper)) inferred = "scene";
      else if (/^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT)/.test(upper)) inferred = "transition";
      else if (/^\(.+\)$/.test(text)) inferred = "parenthetical";
      else if (text === upper && text.length > 0 && text.length < 40 && !text.includes(".")) inferred = "character";
      setScriptElementType(p, inferred);
    } else {
      normalizeScriptParagraphAttributes(p);
    }
  });

  return holder.innerHTML;
}

export function ensureScriptEditorTail(editor) {
  if (!editor) return;
  const last = editor.querySelector("p:last-of-type");
  if (!last) {
    editor.appendChild(createScriptParagraph(DEFAULT_SCRIPT_ELEMENT));
    return;
  }
  if (!isScriptParagraph(last)) {
    setScriptElementType(last, DEFAULT_SCRIPT_ELEMENT);
  }
}

export function ensureScriptEditorContent(editor) {
  if (!editor) return;
  if (!editor.querySelector("p")) {
    editor.appendChild(createScriptParagraph(DEFAULT_SCRIPT_ELEMENT));
  } else {
    editor.querySelectorAll("p").forEach((p) => {
      if (!isScriptParagraph(p)) setScriptElementType(p, "action");
    });
  }
  ensureScriptEditorTail(editor);
}

/**
 * Wire script toolbar buttons and keyboard handlers.
 * @param {{ editor: HTMLElement, toolbar: HTMLElement|null, onChange?: () => void, hintEl?: HTMLElement|null }} options
 */
export function initScriptEditor({ editor, toolbar, onChange, hintEl }) {
  if (!editor) return () => {};

  const notify = () => { onChange?.(); };

  const syncToolbarState = () => {
    if (!toolbar && !hintEl) return;
    const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
    const currentType = paragraph && editor.contains(paragraph)
      ? getScriptElementType(paragraph)
      : null;

    toolbar?.querySelectorAll("[data-script-element]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.scriptElement === currentType);
    });

    if (hintEl && currentType) {
      hintEl.textContent = scriptElementHint(currentType);
    }
  };

  const onKeyDown = (e) => {
    if (handleScriptTabKey(e, editor)) {
      notify();
      syncToolbarState();
    } else if (handleScriptEnterKey(e, editor)) {
      notify();
      syncToolbarState();
    }
  };

  const onInput = () => {
    notify();
    syncToolbarState();
  };

  const onSelectionChange = () => {
    if (!editor.contains(document.activeElement) && document.activeElement !== editor) return;
    syncToolbarState();
  };

  editor.addEventListener("keydown", onKeyDown);
  editor.addEventListener("input", onInput);
  editor.addEventListener("keyup", onSelectionChange);
  editor.addEventListener("click", onSelectionChange);
  document.addEventListener("selectionchange", onSelectionChange);

  const toolbarClick = (e) => {
    const btn = e.target.closest("[data-script-element]");
    if (!btn || !toolbar?.contains(btn)) return;
    e.preventDefault();
    applyScriptElementToSelection(editor, btn.dataset.scriptElement);
    notify();
    syncToolbarState();
  };

  toolbar?.addEventListener("click", toolbarClick);

  const onShortcut = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!editor.contains(document.activeElement) && document.activeElement !== editor) return;
    const match = SCRIPT_ELEMENTS.find((el) => el.shortcut === e.key);
    if (!match) return;
    e.preventDefault();
    applyScriptElementToSelection(editor, match.id);
    notify();
    syncToolbarState();
  };

  document.addEventListener("keydown", onShortcut);
  syncToolbarState();

  return () => {
    editor.removeEventListener("keydown", onKeyDown);
    editor.removeEventListener("input", onInput);
    editor.removeEventListener("keyup", onSelectionChange);
    editor.removeEventListener("click", onSelectionChange);
    document.removeEventListener("selectionchange", onSelectionChange);
    toolbar?.removeEventListener("click", toolbarClick);
    document.removeEventListener("keydown", onShortcut);
  };
}

export function scriptHtmlToPlainText(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html || "");
  const lines = [];
  holder.querySelectorAll("p").forEach((p) => {
    lines.push((p.textContent || "").replace(/\u00a0/g, " "));
  });
  return lines.join("\n").replace(/\n+$/, "");
}

export function scriptElementHint(typeId) {
  const def = SCRIPT_ELEMENT_BY_ID[typeId];
  if (!def) return "";
  const enterNext = ENTER_NEXT[typeId];
  const nextLabel = SCRIPT_ELEMENT_BY_ID[enterNext]?.label || "";
  return `Tab — cycle · Enter — ${nextLabel || "next line"} · empty line — exit block`;
}
