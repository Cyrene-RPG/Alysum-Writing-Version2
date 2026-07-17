/**
 * Pick destination category when moving a wiki article.
 */

/** @typedef {"character"|"place"|"object"} WikiMoveKind */

export const WIKI_MOVE_KINDS = new Set(["character", "place", "object"]);

export const WIKI_MOVE_LABELS = {
    character: "Characters",
    place: "Places",
    object: "Objects"
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} [opts.nameEl]
 * @param {() => WikiMoveKind|null} opts.getCurrentKind
 * @param {(kind: WikiMoveKind) => void} opts.onPick
 */
export function mountWikiMovePicker(opts) {
    const { root, nameEl, getCurrentKind, onPick } = opts;
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

    function open(articleName) {
        const current = getCurrentKind?.() || null;
        if (nameEl) nameEl.textContent = articleName ? `"${articleName}"` : "";
        root.querySelectorAll("[data-move-kind]").forEach(btn => {
            const kind = btn.getAttribute("data-move-kind");
            const isCurrent = kind === current;
            btn.disabled = isCurrent;
            btn.classList.toggle("is-current", isCurrent);
        });
        root.classList.remove("hidden");
        onOutside = e => {
            if (root.contains(/** @type {Node} */ (e.target))) return;
            close();
        };
        setTimeout(() => document.addEventListener("mousedown", onOutside), 0);
    }

    root.querySelectorAll("[data-move-kind]").forEach(btn => {
        btn.addEventListener("click", () => {
            if (btn.disabled) return;
            const kind = btn.getAttribute("data-move-kind");
            if (!kind || !WIKI_MOVE_KINDS.has(kind)) return;
            close();
            onPick(/** @type {WikiMoveKind} */ (kind));
        });
    });

    return { open, close, destroy: close };
}
