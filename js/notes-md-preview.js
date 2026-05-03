import { marked } from "https://cdn.jsdelivr.net/npm/marked@15.0.6/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm";

marked.use({ gfm: true, breaks: true });

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Markdown → HTML for reading view; [[wikilinks]] become clickable spans.
 * @param {string} markdownSource
 */
export function renderMarkdownPreview(markdownSource) {
  let html = marked.parse(markdownSource || "");
  html = String(html).replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
    const name = String(raw).trim();
    const enc = encodeURIComponent(name);
    return `<span class="ob-link ob-wl" data-jump="${escapeAttr(enc)}">[[${escapeAttr(name)}]]</span>`;
  });
  return DOMPurify.sanitize(html, { ADD_ATTR: ["data-jump"] });
}
