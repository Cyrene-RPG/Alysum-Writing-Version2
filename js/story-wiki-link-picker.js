/**
 * Pick wiki link target category when creating a new [[hyperlink]].
 */

/** @typedef {"character"|"place"|"object"} WikiLinkKind */

export const WIKI_LINK_KINDS = new Set(["character", "place", "object"]);

/**
 * @param {string} inner Raw text inside [[...]]
 */
export function parseWikiLinkInner(inner) {
    const raw = String(inner || "").trim();
    const pipe = raw.indexOf("|");
    if (pipe === -1) return { title: raw, kind: null };
    const title = raw.slice(0, pipe).trim();
    const kind = raw.slice(pipe + 1).trim().toLowerCase();
    return { title, kind: WIKI_LINK_KINDS.has(kind) ? /** @type {WikiLinkKind} */ (kind) : null };
}

/**
 * @param {string} title
 * @param {WikiLinkKind|null|undefined} kind
 */
export function formatWikiLinkMarker(title, kind) {
    const t = String(title || "").trim();
    if (!t) return "";
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
