/**
 * Allowlisted HTML for chapter comments. Browser-only (DOMParser).
 */
const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "BLOCKQUOTE", "SPAN", "IMG"]);

function isSafeSrc(src) {
    const value = String(src || "").trim();
    if (!value) return false;
    if (value.startsWith("https://") || value.startsWith("http://")) return true;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    return false;
}

function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
    }
    const tag = node.tagName;
    if (!ALLOWED.has(tag)) {
        const parent = node.parentNode;
        if (!parent) {
            node.remove();
            return;
        }
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        node.remove();
        return;
    }
    [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (tag === "IMG" && name === "src" && isSafeSrc(attr.value)) return;
        if (tag === "SPAN" && name === "class" && /\breader-spoiler\b/.test(attr.value)) {
            node.setAttribute("class", "reader-spoiler");
            return;
        }
        node.removeAttribute(attr.name);
    });
    if (tag === "IMG" && !isSafeSrc(node.getAttribute("src"))) {
        node.remove();
        return;
    }
    if (tag === "SPAN" && node.getAttribute("class") !== "reader-spoiler") {
        const parent = node.parentNode;
        if (!parent) return;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        node.remove();
        return;
    }
    [...node.childNodes].forEach(cleanNode);
}

export function sanitizeCommentHtml(raw) {
    const html = String(raw || "").trim();
    if (!html) return "";
    const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
    const root = doc.getElementById("root");
    if (!root) return "";
    [...root.childNodes].forEach(cleanNode);
    return root.innerHTML.trim();
}

export function commentHasText(html) {
    const text = String(html || "")
        .replace(/<img\b[^>]*>/gi, " img ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > 0;
}
