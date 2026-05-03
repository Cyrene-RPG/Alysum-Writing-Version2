/**
 * Reliable note body editor (Markdown source) — no CDN parser graph.
 * @param {HTMLElement} host
 * @param {{ initialDoc: string, onChange?: () => void }} opts
 */
export function createVaultTextarea(host, opts) {
  const ta = document.createElement("textarea");
  ta.className = "vault-md";
  ta.spellcheck = true;
  ta.setAttribute("aria-label", "Note body");
  ta.value = opts.initialDoc || "";
  host.innerHTML = "";
  host.appendChild(ta);

  const fire = () => opts.onChange?.();

  ta.addEventListener("input", fire);

  return {
    getText() {
      return ta.value;
    },
    /** @param {string} text */
    setText(text) {
      const next = text || "";
      if (ta.value === next) return;
      ta.value = next;
    },
    /** @param {string} text */
    insertSnippet(text) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const cur = ta.value;
      ta.value = cur.slice(0, start) + text + cur.slice(end);
      const pos = start + text.length;
      ta.selectionStart = ta.selectionEnd = pos;
      fire();
    },
    focus() {
      ta.focus();
    },
    destroy() {
      ta.removeEventListener("input", fire);
      ta.remove();
    }
  };
}
