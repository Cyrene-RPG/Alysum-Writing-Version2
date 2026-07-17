/**
 * Pick destination when moving a wiki article (section or another book).
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
 * @param {HTMLElement} [opts.booksEl]
 * @param {HTMLElement} [opts.booksEmptyEl]
 * @param {() => WikiMoveKind|null} opts.getCurrentKind
 * @param {(kind: WikiMoveKind) => void} opts.onPick
 * @param {(book: { bookId: string, title: string }) => void} [opts.onPickBook]
 */
export function mountWikiMovePicker(opts) {
    const { root, nameEl, booksEl, booksEmptyEl, getCurrentKind, onPick, onPickBook } = opts;
    if (!root) return { open() {}, close() {}, destroy() {}, setBookOptions() {} };

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

    /**
     * @param {{ bookId: string, title: string }[]} books
     */
    function setBookOptions(books) {
        if (!booksEl) return;
        booksEl.innerHTML = "";
        if (!books.length) {
            booksEmptyEl?.classList.remove("hidden");
            return;
        }
        booksEmptyEl?.classList.add("hidden");
        for (const book of books) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sw-wiki-move-book-btn";
            btn.setAttribute("data-move-book", book.bookId);
            btn.textContent = book.title || "Untitled book";
            btn.addEventListener("click", () => {
                close();
                onPickBook?.({ bookId: book.bookId, title: book.title || "Untitled book" });
            });
            booksEl.appendChild(btn);
        }
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

    return { open, close, destroy: close, setBookOptions };
}
