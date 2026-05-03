/**
 * CodeMirror 6 markdown editor — same core model as Obsidian’s source editor.
 * All @codemirror/* versions aligned for jsdelivr ESM.
 */
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars
} from "https://cdn.jsdelivr.net/npm/@codemirror/view@6.36.1/+esm";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap
} from "https://cdn.jsdelivr.net/npm/@codemirror/language@6.10.8/+esm";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "https://cdn.jsdelivr.net/npm/@codemirror/commands@6.7.1/+esm";
import { highlightSelectionMatches, searchKeymap } from "https://cdn.jsdelivr.net/npm/@codemirror/search@6.5.9/+esm";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap
} from "https://cdn.jsdelivr.net/npm/@codemirror/autocomplete@6.18.4/+esm";
import { EditorState } from "https://cdn.jsdelivr.net/npm/@codemirror/state@6.5.0/+esm";
import { markdown } from "https://cdn.jsdelivr.net/npm/@codemirror/lang-markdown@6.3.2/+esm";

const obsidianEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--ob-bg1)",
      color: "var(--ob-text)"
    },
    ".cm-editor": { height: "100%" },
    ".cm-scroller": {
      fontFamily: "var(--ob-font-mono)",
      fontSize: "14px",
      lineHeight: "1.55"
    },
    ".cm-gutters": {
      backgroundColor: "var(--ob-bg1)",
      color: "var(--ob-faint)",
      borderRight: "1px solid var(--ob-border)"
    },
    ".cm-activeLineGutter": { backgroundColor: "var(--ob-bg2)" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.04)" },
    ".cm-selectionBackground": { background: "rgba(127,109,242,0.22) !important" },
    "&.cm-focused .cm-selectionBackground": { background: "rgba(127,109,242,0.35) !important" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ob-text)" }
  },
  { dark: true }
);

function baseExtensions(onDocChange) {
  const updateListener = EditorView.updateListener.of(u => {
    if (u.docChanged && onDocChange) onDocChange(u.state.doc.toString());
  });
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab
    ]),
    markdown(),
    EditorView.lineWrapping,
    obsidianEditorTheme,
    updateListener
  ];
}

/**
 * @param {HTMLElement} host
 * @param {{ initialDoc: string, onChange: (doc: string) => void }} opts
 */
export function createMarkdownEditor(host, opts) {
  const { initialDoc, onChange } = opts;
  const state = EditorState.create({
    doc: initialDoc || "",
    extensions: baseExtensions(onChange)
  });
  const view = new EditorView({ state, parent: host });
  return {
    getText() {
      return view.state.doc.toString();
    },
    /** @param {string} text */
    setText(text) {
      const cur = view.state.doc.toString();
      if (cur === (text || "")) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text || "" }
      });
    },
    /** @param {string} text */
    insertSnippet(text) {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length }
      });
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.destroy();
    }
  };
}
