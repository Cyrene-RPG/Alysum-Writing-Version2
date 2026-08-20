/**
 * LanguageTool (free public API) for Layer 2 grammar.
 * Call only from the Word Wars seal job (finish, leave, or kick) — never while typing, never from the
 * solo editor. Public endpoint is rate-limited; do not use it from the browser
 * (CORS + quota). Self-host later if volume grows: https://languagetool.org
 */

export const LANGUAGE_TOOL_URL = "https://api.languagetool.org/v2/check";
export const LANGUAGE_TOOL_LANG = "en-US";

/** Categories that mean the sentence is not clean prose. */
const SEVERE = new Set([
    "GRAMMAR",
    "TYPOS",
    "CONFUSED_WORDS",
    "COLLOCATIONS",
    "SEMANTICS",
    "MISC"
]);

const SOFT = new Set([
    "CASING",
    "PUNCTUATION",
    "TYPOGRAPHY",
    "STYLE",
    "REDUNDANCY",
    "WHITESPACE"
]);

function categoryId(match) {
    const id = match?.rule?.category?.id || match?.rule?.issueType || "";
    return String(id).toUpperCase();
}

export function startsWithCapital(text) {
    const t = String(text || "").trim().replace(/^["'“‘]+/, "");
    const ch = t.charAt(0);
    return ch !== "" && ch === ch.toUpperCase() && /[A-Za-z]/.test(ch);
}

export function classifyMatches(matches) {
    const list = Array.isArray(matches) ? matches : [];
    const severe = [];
    const soft = [];
    for (const m of list) {
        const cat = categoryId(m);
        const row = {
            category: cat,
            message: String(m?.message || m?.shortMessage || ""),
            offset: Number(m?.offset) || 0,
            length: Number(m?.length) || 0
        };
        if (SEVERE.has(cat)) severe.push(row);
        else if (SOFT.has(cat) || cat) soft.push(row);
    }
    return { severe, soft, total: list.length };
}

/**
 * After LanguageTool returns. Dialogue ignores casing/punctuation.
 * Grammar/typos reject. Casing-only informal narration goes to Layer 3
 * (LT will not catch "hello cheese man how are you doing.").
 */
export function verdictFromLanguageTool(text, matches, { isDialogue = false } = {}) {
    const { severe, soft, total } = classifyMatches(matches);
    const extra = {
        grammarSevere: severe.length,
        grammarSoft: soft.length,
        grammarTotal: total
    };
    if (severe.length > 0) {
        return { verdict: "reject", reason: "languagetool_severe", ...extra };
    }
    if (isDialogue) {
        return { verdict: "pass", reason: "languagetool_dialogue", ...extra };
    }
    if (!startsWithCapital(text) || soft.length > 0) {
        return { verdict: "needs_ai", reason: "languagetool_informal", ...extra };
    }
    return { verdict: "pass", reason: "languagetool_clean", ...extra };
}

export function buildLanguageToolBody(text, language = LANGUAGE_TOOL_LANG) {
    const body = new URLSearchParams();
    body.set("text", String(text || ""));
    body.set("language", language);
    body.set("enabledOnly", "false");
    return body;
}

/** Join sentences so one HTTP call covers the whole sealed batch. */
export function packSentencesForLanguageTool(texts) {
    const parts = (texts || []).map((t) => String(t || ""));
    const sep = "\n\n";
    let cursor = 0;
    const spans = [];
    const chunks = [];
    for (const part of parts) {
        spans.push({ start: cursor, end: cursor + part.length });
        chunks.push(part);
        cursor += part.length + sep.length;
    }
    return { packed: chunks.join(sep), spans, sep };
}

export function matchesForSpan(matches, span) {
    const list = Array.isArray(matches) ? matches : [];
    const start = span.start;
    const end = span.end;
    return list.filter((m) => {
        const off = Number(m?.offset) || 0;
        return off >= start && off < end;
    }).map((m) => ({
        ...m,
        offset: (Number(m?.offset) || 0) - start
    }));
}

/**
 * Server-side fetch. Pass a fetch impl in tests. Throws on HTTP failure
 * so the job can fail closed (no XP) instead of auto-passing.
 */
export async function fetchLanguageToolCheck(text, { fetchFn, language = LANGUAGE_TOOL_LANG } = {}) {
    const fn = fetchFn || globalThis.fetch;
    if (typeof fn !== "function") throw new Error("languagetool_no_fetch");
    const res = await fn(LANGUAGE_TOOL_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json"
        },
        body: buildLanguageToolBody(text, language)
    });
    if (!res.ok) throw new Error(`languagetool_http_${res.status}`);
    return res.json();
}
