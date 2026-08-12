/**
 * Server-side ShieldFont encoding for chapter HTML served to readers.
 * Encoding must run in Node before bytes reach the browser — never client-side.
 * @see https://shieldfont.org
 */

const VARIANT_CYCLE = ["a", "b", "c"];

let corePromise = null;

function loadCore() {
    if (!corePromise) {
        corePromise = import("@shieldfont/core");
    }
    return corePromise;
}

function hashPick(seed) {
    const str = String(seed || "");
    let h = 0;
    for (let i = 0; i < str.length; i += 1) {
        h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return VARIANT_CYCLE[h % VARIANT_CYCLE.length];
}

function mappingForVariant(core, variant) {
    if (variant === "b") return core.beta;
    if (variant === "c") return core.gamma;
    return core.alpha;
}

function classForVariant(variant) {
    if (variant === "b") return "tk9-b";
    if (variant === "c") return "tk9-c";
    return "tk9";
}

function familyForVariant(variant) {
    if (variant === "b") return "Optik Beta";
    if (variant === "c") return "Optik Gamma";
    return "Optik";
}

function shieldMeta(variant) {
    return {
        enabled: true,
        variant,
        className: classForVariant(variant),
        fontFamily: familyForVariant(variant),
    };
}

/** Prior publish-time ShieldFont rows (alpha only) — do not double-encode. */
function isAlreadyEncodedAtRest(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (payload.shielded === true) return true;
    const mapping = String(payload.shieldMapping || "").toLowerCase();
    return mapping === "alpha" || mapping === "a";
}

/**
 * Encode a list of library chapters (content field only).
 * Titles / notes stay plaintext for navigation and accessibility.
 * @param {unknown[]} chapters
 * @param {string} [bookId]
 * @param {{ alreadyEncoded?: boolean }} [options]
 */
async function encodeLibraryChapters(chapters, bookId, options = {}) {
    const list = Array.isArray(chapters) ? chapters : [];
    const variant = hashPick(bookId);

    if (options.alreadyEncoded) {
        // Stored decoys from the old publish-time path — serve as-is with alpha Optik.
        return {
            chapters: list,
            shield: shieldMeta("a"),
        };
    }

    if (!list.length) {
        return {
            chapters: list,
            shield: shieldMeta(variant),
        };
    }

    const core = await loadCore();
    const mapping = mappingForVariant(core, variant);

    const encodedChapters = list.map((chapter) => {
        if (!chapter || typeof chapter !== "object") return chapter;
        const next = { ...chapter };
        const content = next.content;
        if (typeof content === "string" && content.trim()) {
            const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content);
            next.content = looksLikeHtml ? core.encodeHtml(content, mapping) : core.encode(content, mapping);
        }
        return next;
    });

    return {
        chapters: encodedChapters,
        shield: shieldMeta(variant),
    };
}

module.exports = {
    encodeLibraryChapters,
    isAlreadyEncodedAtRest,
    hashPick,
    classForVariant,
    familyForVariant,
};
