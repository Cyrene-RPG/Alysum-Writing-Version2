/**
 * Screenplay / script editor — Celtx-compatible element types, keyboard flow, and HTML normalization.
 * Uses semantic <p class="script-*"> blocks stored in chapter HTML (same model as prose).
 */

export const SCRIPT_ELEMENTS = [
  { id: "act", label: "Act", menuLabel: "Act", className: "script-act", shortcut: "0", uppercase: true },
  { id: "scene", label: "Scene", menuLabel: "Scene Heading", className: "script-scene", shortcut: "1", uppercase: true },
  { id: "action", label: "Action", menuLabel: "Action", className: "script-action", shortcut: "2", uppercase: false },
  { id: "character", label: "Character", menuLabel: "Character", className: "script-character", shortcut: "3", uppercase: true },
  { id: "dialogue", label: "Dialogue", menuLabel: "Dialogue", className: "script-dialogue", shortcut: "4", uppercase: false },
  { id: "parenthetical", label: "Paren", menuLabel: "Parenthetical", className: "script-parenthetical", shortcut: "5", uppercase: false },
  { id: "transition", label: "Trans", menuLabel: "Transition", className: "script-transition", shortcut: "6", uppercase: true },
  { id: "shot", label: "Shot", menuLabel: "Shot", className: "script-shot", shortcut: "7", uppercase: true },
  { id: "text", label: "Text", menuLabel: "Text", className: "script-text", shortcut: "8", uppercase: false },
];

export const SCRIPT_ELEMENT_BY_ID = Object.fromEntries(SCRIPT_ELEMENTS.map((el) => [el.id, el]));
export const SCRIPT_CLASS_TO_ID = Object.fromEntries(SCRIPT_ELEMENTS.map((el) => [el.className, el.id]));
export const SCRIPT_ELEMENT_CLASSES = new Set(SCRIPT_ELEMENTS.map((el) => el.className));
export const DEFAULT_SCRIPT_ELEMENT = "scene";
export const DEFAULT_SCRIPT_OPENING = { typeId: "transition", text: "FADE IN:" };

/** Celtx Enter flow: after dialogue → next character; after transition → scene heading. */
const ENTER_NEXT = {
  act: "scene",
  scene: "action",
  action: "action",
  character: "dialogue",
  dialogue: "character",
  parenthetical: "dialogue",
  transition: "scene",
  shot: "action",
  text: "action",
};

/** Celtx empty-line Enter: empty action → scene heading; empty dialogue → action. */
const EMPTY_ENTER_NEXT = {
  act: "scene",
  scene: "action",
  action: "scene",
  character: "action",
  dialogue: "action",
  parenthetical: "action",
  transition: "scene",
  shot: "action",
  text: "action",
};

const TAB_CYCLE = ["act", "scene", "action", "character", "dialogue", "parenthetical", "transition", "shot", "text"];

const SCENE_PREFIXES = ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "I/E.", "EST."];

const SCENE_TIME_SUGGESTIONS = ["DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING", "LATER", "CONTINUOUS", "SAME"];

const CHARACTER_EXTENSIONS = ["(V.O.)", "(O.S.)", "(O.C.)", "(CONT'D)", "(PRE-LAP)"];

const TRANSITION_SUGGESTIONS = ["FADE IN:", "FADE OUT.", "CUT TO:", "DISSOLVE TO:", "SMASH CUT TO:", "MATCH CUT TO:"];

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
  const p = createScriptParagraph(typeId);
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
    setScriptElementType(paragraph, nextType);
    placeCaretIn(paragraph, false);
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

function collectCharacterNames(editor) {
  const names = new Set();
  editor?.querySelectorAll("p.script-character").forEach((p) => {
    const text = (p.textContent || "").trim().toUpperCase();
    const base = text.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (base) names.add(base);
  });
  return [...names];
}

function getAssistSuggestions(paragraph, editor) {
  if (!paragraph) return [];
  const typeId = getScriptElementType(paragraph);
  const text = paragraph.textContent || "";
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  if (typeId === "scene") {
    if (!trimmed) return [...SCENE_PREFIXES];
    const prefixMatch = SCENE_PREFIXES.find((p) => upper === p.slice(0, upper.length) && upper.length <= p.length);
    if (prefixMatch && upper.length < prefixMatch.length) {
      return SCENE_PREFIXES.filter((p) => p.startsWith(upper));
    }
    if (/ - ?$/.test(trimmed) || (trimmed.includes(" - ") && !/\s-\s\S+$/.test(trimmed))) {
      const base = trimmed.replace(/\s*-\s*$/, "").trim();
      return SCENE_TIME_SUGGESTIONS.map((time) => `${base} - ${time}`);
    }
  }

  if (typeId === "character") {
    if (trimmed.endsWith("(") || /\([^)]*$/.test(trimmed)) {
      const openIdx = trimmed.lastIndexOf("(");
      const partial = trimmed.slice(openIdx).toUpperCase();
      return CHARACTER_EXTENSIONS.filter((ext) => ext.startsWith(partial));
    }
    const basePartial = trimmed.toUpperCase();
    if (basePartial.length >= 1) {
      return collectCharacterNames(editor)
        .filter((name) => name.startsWith(basePartial) && name !== basePartial)
        .slice(0, 6);
    }
  }

  if (typeId === "transition") {
    if (!trimmed) return [...TRANSITION_SUGGESTIONS];
    return TRANSITION_SUGGESTIONS.filter((t) => t.startsWith(upper) && t !== upper);
  }

  if (typeId === "parenthetical" && trimmed === "(") {
    return ["(beat)", "(whispering)", "(to himself)", "(sarcastic)"];
  }

  return [];
}

function applyAssistSuggestion(paragraph, suggestion) {
  if (!paragraph || suggestion == null) return;
  const typeId = getScriptElementType(paragraph);
  const text = paragraph.textContent || "";

  if (typeId === "character" && /\([^)]*$/.test(text)) {
    const openIdx = text.lastIndexOf("(");
    paragraph.textContent = text.slice(0, openIdx) + suggestion;
  } else if (typeId === "scene" && SCENE_TIME_SUGGESTIONS.some((t) => suggestion.endsWith(` - ${t}`))) {
    paragraph.textContent = suggestion;
  } else {
    paragraph.textContent = suggestion;
  }

  setScriptElementType(paragraph, typeId);
  placeCaretIn(paragraph, true);
}

function createAssistController(editor, assistEl) {
  if (!assistEl) return { sync: () => {}, hide: () => {}, destroy: () => {} };

  let activeIndex = 0;
  let suggestions = [];

  const hide = () => {
    assistEl.classList.add("hidden");
    assistEl.replaceChildren();
    suggestions = [];
    activeIndex = 0;
  };

  const render = () => {
    assistEl.replaceChildren();
    suggestions.forEach((label, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "script-assist-item" + (index === activeIndex ? " is-active" : "");
      btn.textContent = label;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
        if (paragraph) applyAssistSuggestion(paragraph, label);
        hide();
      });
      assistEl.appendChild(btn);
    });
  };

  const positionNearSelection = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const host = editor.parentElement || editor;
    const hostRect = host.getBoundingClientRect();
    assistEl.style.left = `${Math.max(8, rect.left - hostRect.left)}px`;
    assistEl.style.top = `${Math.max(8, rect.bottom - hostRect.top + 6)}px`;
  };

  const sync = () => {
    const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
    if (!paragraph || !editor.contains(paragraph)) {
      hide();
      return;
    }
    suggestions = getAssistSuggestions(paragraph, editor);
    if (!suggestions.length) {
      hide();
      return;
    }
    activeIndex = Math.min(activeIndex, suggestions.length - 1);
    assistEl.classList.remove("hidden");
    positionNearSelection();
    render();
  };

  const onAssistKeyDown = (e) => {
    if (assistEl.classList.contains("hidden") || !suggestions.length) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % suggestions.length;
      render();
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
      render();
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
      if (paragraph) applyAssistSuggestion(paragraph, suggestions[activeIndex]);
      hide();
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
      return true;
    }
    return false;
  };

  return { sync, hide, onAssistKeyDown, destroy: hide };
}

/** Keep uppercase elements capped while typing (Celtx auto-format). */
export function handleScriptUppercaseInput(editor) {
  const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
  if (!paragraph || !editor.contains(paragraph)) return;
  const def = SCRIPT_ELEMENT_BY_ID[getScriptElementType(paragraph)];
  if (!def?.uppercase) return;
  const text = paragraph.textContent || "";
  const upper = text.toUpperCase();
  if (text === upper) return;
  const sel = window.getSelection();
  const offset = sel?.anchorOffset ?? upper.length;
  paragraph.textContent = upper;
  placeCaretIn(paragraph, false);
  try {
    const range = document.createRange();
    const node = paragraph.firstChild;
    if (node) {
      range.setStart(node, Math.min(offset, upper.length));
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  } catch (_) { /* ignore caret restore */ }
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
    holder.appendChild(createScriptParagraph(DEFAULT_SCRIPT_OPENING.typeId, DEFAULT_SCRIPT_OPENING.text));
    return holder.innerHTML;
  }

  paragraphs.forEach((p) => {
    if (!isScriptParagraph(p)) {
      const text = (p.textContent || "").trim();
      let inferred = DEFAULT_SCRIPT_ELEMENT;
      const upper = text.toUpperCase();
      if (/^ACT\b/.test(upper)) inferred = "act";
      else if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.|EST\.)/.test(upper)) inferred = "scene";
      else if (/^(FADE IN|FADE OUT|FADE TO|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT)/.test(upper)) inferred = "transition";
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

/** Collect scene headings from all body chapters for scene navigation. */
export function collectScriptSceneHeadings(sections) {
  if (!sections || typeof sections !== "object") return [];
  const body = Array.isArray(sections.body) ? sections.body : [];
  const scenes = [];
  body.forEach((chapter, chapterIndex) => {
    const holder = document.createElement("div");
    holder.innerHTML = String(chapter?.content || "");
    let sceneInChapter = 0;
    holder.querySelectorAll("p").forEach((p) => {
      if (!p.classList.contains("script-scene")) return;
      sceneInChapter += 1;
      const label = (p.textContent || "").trim() || `Scene ${chapterIndex + 1}.${sceneInChapter}`;
      scenes.push({
        chapterIndex,
        sceneIndex: sceneInChapter - 1,
        label,
        chapterTitle: chapter?.title || `Scene ${chapterIndex + 1}`,
      });
    });
    if (!sceneInChapter) {
      scenes.push({
        chapterIndex,
        sceneIndex: 0,
        label: chapter?.title || `Scene ${chapterIndex + 1}`,
        chapterTitle: chapter?.title || `Scene ${chapterIndex + 1}`,
        isChapterFallback: true,
      });
    }
  });
  return scenes;
}

function renderScriptElementMenu(menu) {
  if (!menu || menu.dataset.rendered === "1") return;
  menu.dataset.rendered = "1";
  menu.replaceChildren();
  SCRIPT_ELEMENTS.forEach((el) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "script-element-menu-item";
    btn.dataset.scriptElement = el.id;
    btn.setAttribute("role", "option");
    btn.innerHTML = `<span class="script-element-menu-label">${el.menuLabel}</span><span class="script-element-menu-shortcut">Ctrl+${el.shortcut}</span>`;
    menu.appendChild(btn);
  });
}

function closeScriptElementMenu(menu, pickerBtn) {
  menu?.classList.add("hidden");
  pickerBtn?.setAttribute("aria-expanded", "false");
}

function openScriptElementMenu(menu, pickerBtn) {
  menu?.classList.remove("hidden");
  pickerBtn?.setAttribute("aria-expanded", "true");
}

/**
 * Wire script toolbar and keyboard handlers (Celtx-compatible).
 */
export function initScriptEditor({
  editor,
  toolbar,
  pickerBtn,
  pickerLabel,
  elementMenu,
  assistEl,
  onChange,
  hintEl,
  isActive,
}) {
  if (!editor) return () => {};

  const scriptModeActive = () => (isActive ? isActive() : document.body.classList.contains("script-mode"));
  const assist = createAssistController(editor, assistEl);

  renderScriptElementMenu(elementMenu);

  const notify = () => { onChange?.(); };

  const syncToolbarState = () => {
    const paragraph = getBlockParagraph(window.getSelection()?.anchorNode, editor);
    const currentType = paragraph && editor.contains(paragraph)
      ? getScriptElementType(paragraph)
      : null;

    toolbar?.querySelectorAll("[data-script-element]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.scriptElement === currentType);
    });

    if (pickerLabel) {
      const def = currentType ? SCRIPT_ELEMENT_BY_ID[currentType] : null;
      pickerLabel.textContent = def?.menuLabel || "Scene Heading";
    }

    if (elementMenu) {
      elementMenu.querySelectorAll("[data-script-element]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.scriptElement === currentType);
        btn.setAttribute("aria-selected", btn.dataset.scriptElement === currentType ? "true" : "false");
      });
    }

    if (hintEl && currentType) {
      hintEl.textContent = scriptElementHint(currentType);
    }

    assist.sync();
  };

  const onKeyDown = (e) => {
    if (!scriptModeActive()) return;
    if (assist.onAssistKeyDown(e)) {
      notify();
      syncToolbarState();
      return;
    }
    if (handleScriptTabKey(e, editor)) {
      notify();
      syncToolbarState();
    } else if (handleScriptEnterKey(e, editor)) {
      notify();
      syncToolbarState();
    }
  };

  const onInput = () => {
    handleScriptUppercaseInput(editor);
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
  editor.addEventListener("blur", () => assist.hide(), true);
  document.addEventListener("selectionchange", onSelectionChange);

  const toolbarClick = (e) => {
    const formatBtn = e.target.closest("[data-script-cmd]");
    if (formatBtn && toolbar?.contains(formatBtn)) {
      e.preventDefault();
      document.execCommand(formatBtn.dataset.scriptCmd, false, null);
      editor.focus();
      notify();
      return;
    }
    const btn = e.target.closest("[data-script-element]");
    if (!btn || !toolbar?.contains(btn)) return;
    e.preventDefault();
    applyScriptElementToSelection(editor, btn.dataset.scriptElement);
    notify();
    syncToolbarState();
    if (elementMenu && btn.closest(".script-element-menu")) {
      closeScriptElementMenu(elementMenu, pickerBtn);
    }
  };

  toolbar?.addEventListener("click", toolbarClick);

  const onPickerToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!elementMenu) return;
    if (elementMenu.classList.contains("hidden")) openScriptElementMenu(elementMenu, pickerBtn);
    else closeScriptElementMenu(elementMenu, pickerBtn);
  };

  pickerBtn?.addEventListener("click", onPickerToggle);

  const onDocumentClick = (e) => {
    if (!elementMenu || elementMenu.classList.contains("hidden")) return;
    if (pickerBtn?.contains(e.target) || elementMenu.contains(e.target)) return;
    closeScriptElementMenu(elementMenu, pickerBtn);
  };

  document.addEventListener("click", onDocumentClick);

  const onShortcut = (e) => {
    if (!scriptModeActive()) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
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
    editor.removeEventListener("blur", () => assist.hide(), true);
    document.removeEventListener("selectionchange", onSelectionChange);
    toolbar?.removeEventListener("click", toolbarClick);
    pickerBtn?.removeEventListener("click", onPickerToggle);
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onShortcut);
    assist.destroy();
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
  const nextLabel = SCRIPT_ELEMENT_BY_ID[enterNext]?.menuLabel || "";
  return `Tab — switch · Enter — ${nextLabel || "next"} · ↑↓ — suggestions`;
}

export { SCENE_PREFIXES, SCENE_TIME_SUGGESTIONS, CHARACTER_EXTENSIONS, TRANSITION_SUGGESTIONS };
