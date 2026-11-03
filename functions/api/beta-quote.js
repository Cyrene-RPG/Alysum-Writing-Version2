/** Reconstruct the reader's visible text from a stored chapter snapshot. */
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

export function snapshotPlainText(html) {
    return String(html || "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, "")
        .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
            if (code[0] !== "#") return NAMED[code.toLowerCase()] || entity;
            const number = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isInteger(number) && number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
                ? String.fromCodePoint(number)
                : entity;
        });
}

export function matchSelectedQuote(plain, start, end, quote) {
    const selectedQuote = String(quote || "");
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end - start > 2000 || !selectedQuote || selectedQuote.length !== end - start) {
        return null;
    }
    let anchorStart = plain.slice(start, end) === selectedQuote ? start : -1;
    if (anchorStart < 0) {
        let match = plain.indexOf(selectedQuote), nearest = Infinity;
        while (match !== -1) {
            const distance = Math.abs(match - start);
            if (distance < nearest) { nearest = distance; anchorStart = match; }
            match = plain.indexOf(selectedQuote, match + 1);
        }
    }
    if (anchorStart < 0) return null;
    return { quote: selectedQuote, startOffset: anchorStart, endOffset: anchorStart + selectedQuote.length };
}

export function isMissingSuggestionsTable(error) {
    return /HTTP 404|PGRST205|42P01/i.test(String(error?.message || ""));
}
