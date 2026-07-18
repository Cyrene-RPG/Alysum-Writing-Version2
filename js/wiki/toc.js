/**
 * Table of contents generator — mirrors Wikipedia TOC behavior.
 */

function slugify(text) {
    return String(text || "")
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "_");
}

/**
 * @param {HTMLElement} root
 * @returns {string}
 */
export function buildTocHtml(root) {
    const headings = [...root.querySelectorAll("h2, h3, h4")].filter(
        (h) => !h.closest(".infobox, #wiki-toc, .toc")
    );
    if (headings.length < 2) return "";

    const items = [];
    let idCounter = 0;

    for (const h of headings) {
        if (!h.id) {
            idCounter += 1;
            h.id = slugify(h.textContent) || `section_${idCounter}`;
        }
        const level = Number(h.tagName.slice(1));
        items.push({ level, id: h.id, text: h.textContent.trim() });
    }

    let html = '<div id="wiki-toc" class="toc"><div class="toctitle">Contents</div><ul>';
    for (const item of items) {
        const cls = `toclevel-${item.level - 1}`;
        html += `<li class="${cls}"><a href="#${item.id}"><span class="tocnumber"></span><span class="toctext">${escapeHtml(item.text)}</span></a></li>`;
    }
    html += "</ul></div>";
    return html;
}

/**
 * @param {HTMLElement} articleRoot
 */
export function injectToc(articleRoot) {
    const existing = articleRoot.querySelector("#wiki-toc");
    if (existing) existing.remove();

    const tocHtml = buildTocHtml(articleRoot);
    if (!tocHtml) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = tocHtml;
    const toc = wrapper.firstElementChild;
    const firstHeading = articleRoot.querySelector("h2");
    if (firstHeading) {
        firstHeading.parentNode.insertBefore(toc, firstHeading);
    } else {
        articleRoot.insertBefore(toc, articleRoot.firstChild);
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
