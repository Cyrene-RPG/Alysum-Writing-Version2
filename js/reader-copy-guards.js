/**
 * Discourages copy/paste and context-menu grabs on reader chapter HTML.
 * Not a security boundary (DevTools, Firestore, disabling JS, etc. bypass this).
 */

const STYLE_ID = "alysum-reader-copy-guards-style";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
.reader-protected-root.reader-no-select,
.reader-protected-root.reader-no-select * {
  -webkit-user-select: none !important;
  user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  -webkit-touch-callout: none;
}
`;
  document.head.appendChild(el);
}

function isFormField(el) {
  if (!el) return false;
  let node = el.nodeType === 1 ? el : el.parentElement;
  if (!node) return false;
  const tag = node.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return true;
  if (node.isContentEditable) return true;
  return !!(node.closest && node.closest("textarea, input, select, [contenteditable='true']"));
}

function selectionTouchesRoot(sel, root) {
  if (!sel || !root || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const a = sel.anchorNode;
  const f = sel.focusNode;
  if (!a || !f) return false;
  const ae = a.nodeType === 1 ? a : a.parentElement;
  const fe = f.nodeType === 1 ? f : f.parentElement;
  if (!ae || !fe) return false;
  return root.contains(ae) || root.contains(fe);
}

/**
 * @param {HTMLElement | null} rootEl Chapter body root (e.g. #content, #betaContent).
 * @param {object} [options]
 * @param {() => boolean} [options.isActive] Return false to skip guards (e.g. book not loaded).
 * @param {boolean} [options.allowTextSelection] If true, do not disable CSS selection (e.g. beta reader highlight → quote).
 */
export function installReaderCopyGuards(rootEl, options = {}) {
  injectStyles();

  const isActive = typeof options.isActive === "function" ? options.isActive : () => true;
  const allowTextSelection = options.allowTextSelection === true;

  if (!rootEl) {
    return () => {};
  }

  rootEl.classList.add("reader-protected-root");
  if (!allowTextSelection) {
    rootEl.classList.add("reader-no-select");
  }

  const inside = (node) => node && rootEl.contains(node);

  const onDocCopyCut = (e) => {
    if (!isActive()) return;
    if (isFormField(e.target)) return;
    const sel = document.getSelection();
    if (selectionTouchesRoot(sel, rootEl)) {
      e.preventDefault();
    }
  };

  const onRootChord = (e) => {
    if (!isActive()) return;
    e.preventDefault();
  };

  rootEl.addEventListener("contextmenu", onRootChord);
  rootEl.addEventListener("dragstart", onRootChord);
  rootEl.addEventListener("paste", onRootChord);

  const onDocKey = (e) => {
    if (!isActive() || e.defaultPrevented) return;
    if (isFormField(e.target)) return;

    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const sel = document.getSelection();
    const touches = selectionTouchesRoot(sel, rootEl);
    const inTree = inside(e.target);

    if (!mod) return;

    if (k === "c" || k === "C" || k === "x" || k === "X") {
      if (inTree || touches) e.preventDefault();
      return;
    }

    if (allowTextSelection) return;

    if (k === "a" || k === "A" || k === "v" || k === "V" || k === "s" || k === "S") {
      if (inTree || touches) e.preventDefault();
    }
  };

  document.addEventListener("copy", onDocCopyCut, true);
  document.addEventListener("cut", onDocCopyCut, true);
  document.addEventListener("keydown", onDocKey, true);

  return () => {
    rootEl.classList.remove("reader-protected-root", "reader-no-select");
    rootEl.removeEventListener("contextmenu", onRootChord);
    rootEl.removeEventListener("dragstart", onRootChord);
    rootEl.removeEventListener("paste", onRootChord);
    document.removeEventListener("copy", onDocCopyCut, true);
    document.removeEventListener("cut", onDocCopyCut, true);
    document.removeEventListener("keydown", onDocKey, true);
  };
}
