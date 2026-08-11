/**
 * ShieldFont encoder — the SINGLE canonical logic. Every shipped encoder (the
 * npm package, the CDN bundle, the site copy, the Python mirror) derives from
 * this file. See packages/core/README.md.
 *
 * Two edge cases are handled HERE, in the encoder, so the validated font never
 * has to change (the "resolve edge cases in the encoder, not the font" rule):
 *
 *   P1 — accented words. The tokenizer matches Unicode letters (\p{L}) and the
 *        input is NFC-normalised first, so "café"/"résumé" tokenise as whole
 *        words and pass through untouched instead of being split at the accent
 *        (the old ASCII `[a-zA-Z]+` split them and corrupted the fragments).
 *
 *   F1 — letter-flanked digits. The font renders a swap-eligible digit SWAPPED
 *        when it has 0 or 2 letter-neighbours, but AS-WRITTEN with exactly 1
 *        (its fire-then-revert chains double-revert the 2-neighbour case). So
 *        the encoder pre-swaps digits with 0/2 letter-neighbours and leaves the
 *        1-neighbour case — making "H3O", "C4H10", "a3b" round-trip correctly.
 *        Letter-neighbour context is invariant under encoding (words stay
 *        words), so it can be computed on the encoded string.
 */
// P1: Unicode letter runs (accented words stay whole once NFC-normalised).
const WORD_RE = /\p{L}+/gu;
const IS_DIGIT = /^\d$/;
const IS_LETTER = /\p{L}/u;
/**
 * E1 — HTML character references. `&#39;` `&#x2019;` `&copy;` are *markup*, not
 * prose: the browser resolves each one to a single character before the font
 * ever runs, so anything we change inside one is a change no ligature can undo.
 *
 * Left alone, the tokenizer shreds them. `&copy;` splits into `&` + the word
 * `copy` + `;`, and `copy` is a dictionary key — so a footer's © turned into
 * `&avoid;`. The digit rule was worse: it rewrote the code point itself, so
 * `don&#39;t` became `don&#84;t` ("donTt"), `&#169;` became ®, and `&#75;b&#72;`
 * became `&#60;b&#62;` — plain text that the parser then reads as a live `<b>`
 * tag. `checkHtml()` passed on every one of these, because the *string* round
 * trips faithfully; only the rendered character was wrong.
 *
 * So: find the spans first, and treat everything inside one as untouchable.
 * The `{1,31}` floor on named entities keeps prose like "R&D" and "AT&T" out.
 */
const ENTITY_RE = /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;
/** Byte ranges of every character reference in `s`, ascending and disjoint. */
function entitySpans(s) {
    const spans = [];
    ENTITY_RE.lastIndex = 0;
    let m;
    while ((m = ENTITY_RE.exec(s)) !== null)
        spans.push([m.index, m.index + m[0].length]);
    return spans;
}
/** True when offset `i` falls inside a character reference. Binary search. */
function inEntity(spans, i) {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const [a, b] = spans[mid];
        if (i < a)
            hi = mid - 1;
        else if (i >= b)
            lo = mid + 1;
        else
            return true;
    }
    return false;
}
/**
 * Dictionary lookup that cannot reach `Object.prototype`.
 *
 * A plain object answers to the names it was born with, and one of them is
 * ordinary English: `encode("constructor")` returned the source text of
 * `function Object() { [native code] }`, and `"Constructor"` at the head of a
 * sentence threw outright inside `preserveCase`. `toString`, `valueOf` and
 * `hasOwnProperty` are reachable the same way. Own-properties only, and the
 * value still has to be a string.
 */
function lookup(mapping, key) {
    if (!Object.prototype.hasOwnProperty.call(mapping, key))
        return undefined;
    const value = mapping[key];
    return typeof value === "string" ? value : undefined;
}
/**
 * Apply the casing of `src` to `target`:
 *   - `src` all uppercase and length > 1 → target uppercased,
 *   - `src` starts uppercase             → target first-char uppercased,
 *   - otherwise                          → target as-is.
 */
function preserveCase(src, target) {
    if (src.length > 1 && src === src.toUpperCase())
        return target.toUpperCase();
    if (src[0] === src[0]?.toUpperCase()) {
        return (target[0] ?? "").toUpperCase() + target.slice(1);
    }
    return target;
}
/** True when `s` is a single letter. Tolerates `""` (a missing neighbour). */
function isLetterChar(s) {
    return s !== undefined && s !== "" && IS_LETTER.test(s);
}
/**
 * Encode plain text and report it piece by piece: which words the dictionary
 * replaced, which digits the context rule permuted, and what each piece was
 * before. Joining every `encoded` gives exactly `encode(text, mapping)` —
 * `encode` is defined in terms of this function, so the two cannot drift.
 *
 * Reach for this whenever something needs to *show* the encoding rather than
 * just apply it: a live encoder that boxes the swapped tokens, a
 * "n of m tokens swapped" readout, an x-ray overlay with the originals on
 * hover. Every one of those is a mis-tokenising bug waiting to happen if it
 * re-derives the token boundaries itself; the site's own encoders each shipped
 * a `[A-Za-z]+` loop that silently skipped every digit.
 */
export function encodeSegments(text, mapping) {
    // Validate at the front door. These two are the lowest-level, most-called
    // functions in the package, and every higher-level helper funnels into them —
    // so a bad argument here surfaced as `Cannot read properties of null (reading
    // 'normalize')` from a stack frame the caller has no reason to recognise.
    // A CMS field that came back null, or a number where a string was meant, is
    // an ordinary mistake and deserves an ordinary message.
    if (typeof text !== "string") {
        throw new TypeError(`ShieldFont: text must be a string, received ${text === null ? "null" : typeof text}. ` +
            `If this came from a CMS or a database, guard the empty case before encoding.`);
    }
    if (mapping === null || typeof mapping !== "object") {
        throw new TypeError(`ShieldFont: mapping must be a mapping object, received ${mapping === null ? "null" : typeof mapping}. ` +
            `Import one from @shieldfont/core: \`import { alpha } from "@shieldfont/core"\`.`);
    }
    // P1: fold decomposed accents into precomposed letters so \p{L}+ matches whole words.
    const src = text.normalize("NFC");
    // E1: locate character references once; both passes below consult them.
    const spans = entitySpans(src);
    // 1) Encode words. Everything between two letter runs is set aside verbatim;
    //    by construction those gaps hold no letters at all, which is what makes
    //    the digit pass below able to reason about letter-neighbours locally.
    //    `offsets` tracks where each piece started, so the digit pass can ask the
    //    entity question about an absolute position.
    const coarse = [];
    const offsets = [];
    const other = (s) => ({ original: s, encoded: s, swapped: false, kind: "other" });
    let last = 0;
    for (const m of src.matchAll(WORD_RE)) {
        const at = m.index ?? 0;
        if (at > last) {
            coarse.push(other(src.slice(last, at)));
            offsets.push(last);
        }
        const word = m[0];
        // E1: a letter run inside a character reference is markup, never prose —
        // the `copy` of `&copy;`, the `x` and hex digits of `&#x2019;`.
        const t = inEntity(spans, at) ? undefined : lookup(mapping, word.toLowerCase());
        const enc = t ? preserveCase(word, t) : word;
        coarse.push({ original: word, encoded: enc, swapped: enc !== word, kind: "word" });
        offsets.push(at);
        last = at + word.length;
    }
    if (last < src.length) {
        coarse.push(other(src.slice(last)));
        offsets.push(last);
    }
    // 2) F1: context-aware digit permutation. A digit's letter-neighbour is
    //    either the character beside it inside its own gap — never a letter — or
    //    the encoded edge of the adjoining word, so the context the font will see
    //    is knowable here without re-scanning the whole encoded string.
    const out = [];
    for (let i = 0; i < coarse.length; i++) {
        const seg = coarse[i];
        if (seg.kind !== "other") {
            out.push(seg);
            continue;
        }
        const run = [...seg.original]; // codepoints: an astral neighbour must not read as half a surrogate
        const before = [...(coarse[i - 1]?.encoded ?? "")].pop();
        const after = [...(coarse[i + 1]?.encoded ?? "")][0];
        let buf = "";
        let at = offsets[i]; // absolute offset of run[j], for the entity check
        for (let j = 0; j < run.length; j++) {
            const c = run[j];
            if (!IS_DIGIT.test(c)) {
                buf += c;
                at += c.length;
                continue;
            }
            const swap = lookup(mapping, c);
            let enc = c;
            // E1: the digits of `&#39;` are the character's *identity*. Permuting one
            // rewrites what the browser resolves, and the font never gets a say.
            if (swap && IS_DIGIT.test(swap) && !inEntity(spans, at)) {
                const left = isLetterChar(j > 0 ? run[j - 1] : before);
                const right = isLetterChar(j < run.length - 1 ? run[j + 1] : after);
                // 0 or 2 letter-neighbours → pre-swap, so the font's chains land on the
                // original. Exactly 1 → leave it; the font renders that case as written.
                if (Number(left) + Number(right) !== 1)
                    enc = swap;
            }
            if (buf)
                out.push(other(buf));
            buf = "";
            out.push({ original: c, encoded: enc, swapped: enc !== c, kind: "digit" });
            at += c.length;
        }
        if (buf)
            out.push(other(buf));
    }
    return out;
}
/**
 * Encode plain text with the given mapping. Words (Unicode letter runs) are
 * substituted case-preservingly; swap-eligible digits are permuted per the
 * font's context rule (F1). Words not in the mapping pass through unchanged.
 */
export function encode(text, mapping) {
    let out = "";
    for (const seg of encodeSegments(text, mapping))
        out += seg.encoded;
    return out;
}
/**
 * Decode == encode: the word mapping is a bijection (m[m[x]] === x) and the
 * digit rule is an involution under fixed letter-context, so encoding twice is
 * the identity. Exposed separately for call-site clarity.
 */
export function decode(text, mapping) {
    return encode(text, mapping);
}
//# sourceMappingURL=encode.js.map