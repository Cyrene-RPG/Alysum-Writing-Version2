/**
 * Pick wiki link target category when creating a new [[hyperlink]].
 */

/** @typedef {"character"|"place"|"object"} WikiLinkKind */

export const WIKI_LINK_KINDS = new Set(["character", "place", "object"]);

/**
 * @param {string} inner Raw text inside [[...]]
 * @returns {{ title: string, kind: WikiLinkKind|null, bookId: string|null }}
 */
export function parseWikiLinkInner(inner) {
    const raw = String(inner || "").trim();
    const parts = raw.split("|").map(p => p.trim());
    const title = parts[0] || "";
    const kindToken = (parts[1] || "").toLowerCase();
    const kind = WIKI_LINK_KINDS.has(kindToken) ? /** @type {WikiLinkKind} */ (kindToken) : null;
    const bookId = parts[2] || null;
    return { title, kind, bookId };
}

/**
 * @param {string} title
 * @param {WikiLinkKind|null|undefined} kind
 * @param {string|null|undefined} bookId
 */
export function formatWikiLinkMarker(title, kind, bookId = null) {
    const t = String(title || "").trim();
    if (!t) return "";
    if (bookId && kind && WIKI_LINK_KINDS.has(kind)) return `[[${t}|${kind}|${bookId}]]`;
    if (kind && WIKI_LINK_KINDS.has(kind)) return `[[${t}|${kind}]]`;
    return `[[${t}]]`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.nameEl
 * @param {(kind: WikiLinkKind) => void} opts.onPick
 * @param {() => WikiLinkKind} [opts.getDefaultKind]
 */
export function mountWikiLinkKindPicker(opts) {
    const { root, nameEl, onPick, getDefaultKind } = opts;
    if (!root) return { open() {}, close() {}, destroy() {} };

    /** @type {(() => void) | null} */
    let onOutside = null;

    function close() {
        root.classList.add("hidden");
        if (onOutside) {
            document.removeEventListener("mousedown", onOutside);
            onOutside = null;
        }
    }

    function open(title) {
        if (nameEl) nameEl.textContent = `"${title}"`;
        root.classList.remove("hidden");
        const defaultKind = getDefaultKind?.() || "character";
        root.querySelectorAll("[data-link-kind]").forEach(btn => {
            btn.classList.toggle("is-suggested", btn.getAttribute("data-link-kind") === defaultKind);
        });
        onOutside = e => {
            if (root.contains(/** @type {Node} */ (e.target))) return;
            close();
        };
        setTimeout(() => document.addEventListener("mousedown", onOutside), 0);
    }

    root.querySelectorAll("[data-link-kind]").forEach(btn => {
        btn.addEventListener("click", () => {
            const kind = btn.getAttribute("data-link-kind");
            if (!kind || !WIKI_LINK_KINDS.has(kind)) return;
            close();
            onPick(/** @type {WikiLinkKind} */ (kind));
        });
    });

    return { open, close, destroy: close };
}
