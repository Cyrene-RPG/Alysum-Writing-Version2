/**
 * Homepage hero background: blurbs of random published stories drifting sideways.
 * Uses only the public catalog summary (the same text shown on each book page).
 */

const ROWS = 6;
const MIN_BLURB = 40;
const MAX_SNIPPET = 150;
/** A row's loop has to be wider than the screen, or the seam shows. */
const MIN_HALF_CHARS = 110;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** First sentence or two of a blurb, cut at a word boundary. */
function snippet(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= MAX_SNIPPET) return clean;
    const sentences = clean.match(/[^.!?…]+[.!?…]+["”’)]*\s*/g) || [];
    let out = "";
    for (const sentence of sentences) {
        if ((out + sentence).length > MAX_SNIPPET) break;
        out += sentence;
    }
    if (out.trim().length >= MIN_BLURB) return out.trim();
    return `${clean.slice(0, MAX_SNIPPET).replace(/\s+\S*$/, "")}…`;
}

function rowHtml(book, index) {
    const piece = `<span><em>${escapeHtml(book.title)}</em> — ${escapeHtml(snippet(book.summary))}</span>`;
    const pieceChars = book.title.length + snippet(book.summary).length + 3;
    const copies = Math.max(1, Math.ceil(MIN_HALF_CHARS / pieceChars));
    const half = piece.repeat(copies);
    const seconds = Math.round(Math.max(70, pieceChars * copies * 0.85) * (0.9 + Math.random() * 0.2));
    return `<div class="prose-row${index % 2 ? " rev" : ""}" style="--t:${seconds}s">${half}${half}</div>`;
}

/** Fill the hero rows; leaves them empty when no book has a usable blurb. */
export function renderHeroBlurbs(container, books) {
    if (!container) return;
    const withBlurbs = shuffle((books || []).filter((book) => String(book.summary || "").trim().length >= MIN_BLURB));
    if (!withBlurbs.length) return;
    const picks = Array.from({ length: ROWS }, (_, i) => withBlurbs[i % withBlurbs.length]);
    container.innerHTML = picks.map(rowHtml).join("");
    requestAnimationFrame(() => container.classList.add("ready"));
}
