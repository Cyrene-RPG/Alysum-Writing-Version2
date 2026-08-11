import { encode } from "./encode.js";
/**
 * Tags whose contents are NEVER encoded. Anything inside these is treated
 * as raw — code samples, scripts, styles, embedded SVG/MathML.
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
    // Drawn by the OS, not the page: a browser tab, a bookmark, a history entry
    // and a <select> popup are all painted in system UI where our ligature table
    // does not apply. Encode those and the human reads the decoy.
    "title",
    "option",
]);
/**
 * Match one HTML *token*: a comment, or a tag.
 *
 * Two failures in the old `/<([!/]?[a-zA-Z][^>]*?)>/gs` are worth naming, since
 * both were silent and both cost plain text:
 *
 *   - **Comments never matched.** After `<`, the pattern wanted `[!/]?` then a
 *     letter; `<!--` offers `-` and fails. So comment bodies were parsed as
 *     ordinary text — and a tag name written inside one drove the skip counter.
 *     `<!-- <pre> -->` incremented `inSkip` and never decremented it, so every
 *     text node from there to the end of the document shipped unencoded.
 *   - **`>` inside an attribute closed the tag.** `alt="sales > costs"` ended
 *     the tag early and the remainder of the attribute was encoded as text,
 *     against this package's own promise that attribute values are never
 *     touched. An `aria-label` rewritten this way voices a decoy.
 *
 * Comments are matched whole by the first alternative (group 1 stays
 * `undefined`, which is how the caller tells them apart). Tag bodies consume
 * quoted runs atomically so a `>` inside one cannot terminate the match.
 */
const TOKEN_RE = /<!--[\s\S]*?-->|<([!/]?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*)>/g;
/**
 * Elements whose content the HTML parser treats as raw text, where `<` starts
 * nothing. `<script>var t = "<textarea>";</script>` contains no textarea — but
 * a tokenizer that doesn't know this counts one, and since the matching close
 * never comes the skip depth never returns to zero and the entire rest of the
 * document ships unencoded. Consume these elements whole instead of counting.
 */
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);
/**
 * Encode all visible text in an HTML document. Skips:
 *   - Anything inside SKIP_TAGS (script/style/code/pre/textarea/svg/math/noscript).
 *   - HTML attribute values (preserved by virtue of only encoding text segments
 *     between tags, never the tag interior).
 *   - HTML comments (the `<!-- ... -->` syntax matches as a "tag" so its
 *     contents are not in a text segment).
 *
 * Tag structure is preserved exactly.
 */
export function encodeHtml(html, mapping) {
    // Checked here as well as in `encode`, because this function slices `html`
    // before it ever reaches the encoder — a null would have failed on `.slice`
    // with no indication of which argument was wrong.
    if (typeof html !== "string") {
        throw new TypeError(`ShieldFont: html must be a string, received ${html === null ? "null" : typeof html}.`);
    }
    const out = [];
    let inSkip = 0;
    let last = 0;
    // Reset regex state on each call (TOKEN_RE is a module-level RegExp with /g).
    TOKEN_RE.lastIndex = 0;
    let match;
    while ((match = TOKEN_RE.exec(html)) !== null) {
        const segment = html.slice(last, match.index);
        out.push(inSkip === 0 ? encode(segment, mapping) : segment);
        out.push(match[0]);
        last = match.index + match[0].length;
        // Group 1 is undefined for a comment, which was emitted whole above and
        // must never touch the skip counter.
        const tagBody = match[1];
        if (tagBody === undefined)
            continue;
        const tagMatch = /^(\/?)([a-zA-Z]+)/.exec(tagBody);
        if (tagMatch === null)
            continue;
        const closing = tagMatch[1] === "/";
        const name = tagMatch[2]?.toLowerCase() ?? "";
        const selfClosing = tagBody.trimEnd().endsWith("/");
        if (!SKIP_TAGS.has(name))
            continue;
        // Raw text: jump straight to the matching close tag rather than tokenising
        // the body, so markup-looking text inside it can't move the counter.
        if (RAW_TEXT_TAGS.has(name) && !closing && !selfClosing) {
            const rest = html.slice(last);
            const end = new RegExp(`</${name}\\s*>`, "i").exec(rest);
            if (end === null) {
                out.push(rest); // unterminated element: the remainder is all raw
                last = html.length;
            }
            else {
                out.push(rest.slice(0, end.index), end[0]);
                last += end.index + end[0].length;
            }
            TOKEN_RE.lastIndex = last;
            continue;
        }
        if (closing && inSkip > 0)
            inSkip--;
        else if (!closing && !selfClosing)
            inSkip++;
    }
    const tail = html.slice(last);
    out.push(inSkip === 0 ? encode(tail, mapping) : tail);
    return out.join("");
}
/**
 * Decode an HTML document. Same operation as encode (mapping is bidirectional)
 * but exposed separately for call-site clarity.
 */
export function decodeHtml(html, mapping) {
    return encodeHtml(html, mapping);
}
//# sourceMappingURL=html.js.map