/**
 * ShieldFont protection for Alysum Library chapter HTML.
 *
 * Encode ONLY when writing the public `library` snapshot (publish / reprotect).
 * Manuscripts in `books` stay plaintext (owner RLS). Readers apply the Optik
 * alpha font so humans see the original words while scrapers get decoys.
 *
 * Vendored from @shieldfont/font + @shieldfont/core (AGPL-3.0-or-later).
 * See vendor/shieldfont/NOTICE.
 */

import { encode, alpha } from "../vendor/shieldfont/shieldfont-encoder.js";

export const SHIELD_MAPPING_ID = "alpha";
export const SHIELD_VERSION = "0.3.2";
export const SHIELD_FONT_FAMILY = "Optik";
/** Camouflaged class — avoid advertising the protection tool in HTML. */
export const SHIELD_CLASS = "aly-sf";
export const SHIELD_FAILED_CLASS = "aly-sf-failed";

/**
 * Tags whose contents are NEVER encoded (mirrors @shieldfont/core encodeHtml).
 */
const SKIP_TAGS = new Set([
    "script",
    "style",
    "code",
    "pre",
    "textarea",
    "svg",
    "math",
    "noscript",
    "title",
    "option",
]);

const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

/** Comment OR tag; quoted attribute runs are atomic so `>` inside attrs is safe. */
const TOKEN_RE = /<!--[\s\S]*?-->|<([!/]?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/**
 * Encode visible text in chapter HTML (or plain text). Preserves tags;
 * skips code/script/style/etc. Safe in browser and Node (no DOMParser).
 * @param {string} html
 * @returns {string}
 */
export function encodeChapterHtml(html) {
    if (html == null) return "";
    if (typeof html !== "string") {
        throw new TypeError(`encodeChapterHtml: expected string, got ${typeof html}`);
    }
    if (!html) return "";
    if (!/<[a-zA-Z!/]/.test(html)) {
        return encode(html, alpha);
    }

    const out = [];
    let inSkip = 0;
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let match;
    while ((match = TOKEN_RE.exec(html)) !== null) {
        const segment = html.slice(last, match.index);
        out.push(inSkip === 0 ? encode(segment, alpha) : segment);
        out.push(match[0]);
        last = match.index + match[0].length;
        const tagBody = match[1];
        if (tagBody === undefined) continue;
        const tagMatch = /^(\/?)([a-zA-Z]+)/.exec(tagBody);
        if (tagMatch === null) continue;
        const closing = tagMatch[1] === "/";
        const name = (tagMatch[2] || "").toLowerCase();
        const selfClosing = tagBody.trimEnd().endsWith("/");
        if (!SKIP_TAGS.has(name)) continue;
        if (RAW_TEXT_TAGS.has(name) && !closing && !selfClosing) {
            const rest = html.slice(last);
            const end = new RegExp(`</${name}\\s*>`, "i").exec(rest);
            if (end === null) {
                out.push(rest);
                last = html.length;
            } else {
                out.push(rest.slice(0, end.index), end[0]);
                last += end.index + end[0].length;
            }
            TOKEN_RE.lastIndex = last;
            continue;
        }
        if (closing && inSkip > 0) inSkip--;
        else if (!closing && !selfClosing) inSkip++;
    }
    const tail = html.slice(last);
    out.push(inSkip === 0 ? encode(tail, alpha) : tail);
    return out.join("");
}

/**
 * ShieldFont mappings are involutions: encode(encode(x)) === x for mapped tokens.
 * Use this to recover human text from a DOM selection over shielded HTML.
 * @param {string} text
 * @returns {string}
 */
export function decodeShieldedPlainText(text) {
    if (text == null) return "";
    return encode(String(text), alpha);
}

/**
 * @param {Array<object>} chapters
 * @returns {Array<object>}
 */
export function shieldLibraryChapters(chapters) {
    return (Array.isArray(chapters) ? chapters : []).map((ch) => {
        const item = ch && typeof ch === "object" ? { ...ch } : {};
        item.content = encodeChapterHtml(item.content || "");
        if (item.authorNotes != null && String(item.authorNotes).trim()) {
            item.authorNotes = encodeChapterHtml(String(item.authorNotes));
        }
        return item;
    });
}

/** Metadata stamped onto library.data when chapter bodies are shielded. */
export function libraryShieldMeta() {
    return {
        shielded: true,
        shieldMapping: SHIELD_MAPPING_ID,
        shieldVersion: SHIELD_VERSION,
    };
}

/**
 * @param {object | null | undefined} data library.data blob
 * @returns {boolean}
 */
export function isLibraryShielded(data) {
    if (!data || typeof data !== "object") return false;
    return data.shielded === true || data.shieldMapping === SHIELD_MAPPING_ID;
}

/**
 * Apply ShieldFont rendering to a chapter body element.
 * Overrides per-chapter typography font-family (required for decoy→glyph restore).
 * @param {HTMLElement | null} contentEl
 * @param {{ shielded?: boolean, notesEl?: HTMLElement | null }} [options]
 */
export async function applyShieldedChapterView(contentEl, options = {}) {
    const shielded = !!options.shielded;
    const notesEl = options.notesEl || null;

    const applyOne = async (el) => {
        if (!el) return;
        el.classList.toggle(SHIELD_CLASS, shielded);
        el.classList.remove(SHIELD_FAILED_CLASS);
        if (!shielded) {
            el.removeAttribute("aria-hidden");
            return;
        }
        // Decoy text must not be read aloud as fluent wrong English.
        el.setAttribute("aria-hidden", "true");
        el.style.fontFamily = `"${SHIELD_FONT_FAMILY}", Georgia, "Times New Roman", serif`;
        await ensureShieldFontLoaded(el);
    };

    await applyOne(contentEl);
    if (notesEl && shielded) {
        await applyOne(notesEl);
    } else if (notesEl) {
        notesEl.classList.remove(SHIELD_CLASS, SHIELD_FAILED_CLASS);
        notesEl.removeAttribute("aria-hidden");
    }
}

/**
 * Fail loud if Optik never loads — never leave readers staring at decoys.
 * @param {HTMLElement} rootEl
 */
export async function ensureShieldFontLoaded(rootEl) {
    if (!rootEl || typeof document === "undefined") return;
    if (!document.fonts || typeof document.fonts.load !== "function") return;

    try {
        await Promise.race([
            document.fonts.load(`400 16px "${SHIELD_FONT_FAMILY}"`),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error("ShieldFont load timeout")), 4000);
            }),
        ]);
        const ok = document.fonts.check(`16px "${SHIELD_FONT_FAMILY}"`);
        if (!ok) throw new Error("ShieldFont not available");
    } catch (err) {
        console.error("[Alysum] ShieldFont failed to load — hiding decoy text.", err);
        rootEl.classList.add(SHIELD_FAILED_CLASS);
        rootEl.innerHTML =
            '<p class="aly-sf-failed-msg">Content unavailable — the protected reading font failed to load. Refresh the page or try again later.</p>';
    }
}

/**
 * Rebuild shielded library chapters from the owner's manuscript (books.sections).
 * Prefer book plaintext as source of truth so we never double-encode library decoys.
 *
 * @param {object} options
 * @param {object} options.libraryData existing library.data
 * @param {object} options.bookSections books.sections ({ front, body, back })
 * @returns {{ data: object, changed: boolean }}
 */
export function reprotectLibraryDataFromBook({ libraryData, bookSections }) {
    const data = libraryData && typeof libraryData === "object" ? { ...libraryData } : {};
    const bodyList = Array.isArray(bookSections?.body) ? bookSections.body : [];
    const byId = new Map(
        bodyList
            .filter((ch) => ch && typeof ch === "object" && ch.id)
            .map((ch) => [String(ch.id), ch])
    );

    const rawChapters = Array.isArray(data.chapters) ? data.chapters : [];
    if (!rawChapters.length) {
        return { data: { ...data, ...libraryShieldMeta() }, changed: !isLibraryShielded(data) };
    }

    const already = isLibraryShielded(data);

    const nextChapters = rawChapters.map((ch, index) => {
        const item = ch && typeof ch === "object" ? { ...ch } : {};
        const id = String(item.id || "");
        const source = id ? byId.get(id) : null;

        // Already shielded with no manuscript source — keep bytes (never double-encode).
        if (already && !source) return item;

        const plainContent =
            source && typeof source.content === "string"
                ? source.content
                : already
                  ? item.content || ""
                  : item.content || "";

        // Prefer manuscript notes; else encode existing library notes only when first shielding.
        let plainNotes = "";
        if (source && (source.authorNotes != null || source.author_notes != null)) {
            plainNotes = String(source.authorNotes ?? source.author_notes ?? "");
        } else if (!already) {
            plainNotes = String(item.authorNotes ?? item.author_notes ?? "");
        }

        const next = {
            ...item,
            id: item.id || `chapter-${index + 1}`,
            content: encodeChapterHtml(plainContent || ""),
        };
        if (plainNotes.trim()) {
            next.authorNotes = encodeChapterHtml(plainNotes);
        }
        return next;
    });

    const nextData = {
        ...data,
        chapters: nextChapters,
        ...libraryShieldMeta(),
        updated: Date.now(),
    };

    const changed =
        !isLibraryShielded(data) ||
        JSON.stringify(rawChapters.map((c) => c?.content)) !==
            JSON.stringify(nextChapters.map((c) => c?.content));

    return { data: nextData, changed: !!changed };
}
