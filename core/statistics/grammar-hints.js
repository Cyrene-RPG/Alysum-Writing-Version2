/**
 * Cheap Layer 2 hints. Not a real parser — enough to reject word lists
 * and pass obvious prose so most sentences never need Layer 3.
 */

export const STOP_WORDS = new Set([
    "a", "an", "the", "to", "of", "and", "or", "but", "in", "on", "at", "for",
    "with", "from", "by", "as", "if", "so", "than", "then", "that", "this",
    "these", "those", "i", "you", "he", "she", "it", "we", "they", "me", "him",
    "her", "us", "them", "my", "your", "his", "our", "their", "is", "am", "are",
    "was", "were", "be", "been", "being", "do", "did", "does", "have", "has",
    "had", "not", "no", "yes", "who", "what", "when", "where", "why", "how"
]);

const CORE_VERBS = new Set([
    "am", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did",
    "say", "said", "says", "go", "goes", "went", "gone", "get", "got", "make",
    "made", "know", "knew", "think", "thought", "take", "took", "taken", "see",
    "saw", "seen", "come", "came", "want", "look", "use", "find", "give", "gave",
    "tell", "told", "work", "seem", "feel", "felt", "try", "leave", "left",
    "call", "ask", "need", "become", "became", "keep", "kept", "let", "begin",
    "began", "help", "talk", "turn", "start", "show", "hear", "play", "run",
    "move", "like", "live", "believe", "hold", "bring", "happen", "write",
    "wrote", "written", "sit", "stand", "lose", "pay", "meet", "include",
    "continue", "set", "learn", "change", "lead", "understand", "watch", "follow",
    "stop", "create", "speak", "read", "allow", "add", "spend", "grow", "open",
    "walk", "win", "offer", "remember", "love", "consider", "appear", "buy",
    "wait", "serve", "die", "send", "expect", "build", "stay", "fall", "cut",
    "reach", "kill", "remain", "suggest", "raise", "pass", "sell", "require",
    "report", "decide", "pull", "put", "mean", "meant", "can", "could", "will",
    "would", "shall", "should", "may", "might", "must"
]);

export function tokenizeWords(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/['’]/g, "'")
        .split(/[^a-z0-9']+/)
        .filter(Boolean);
}

export function looksLikeVerb(token) {
    const w = String(token || "").toLowerCase();
    if (!w || w.length < 2) return false;
    if (CORE_VERBS.has(w)) return true;
    if (w.endsWith("'s")) return false;
    if (w.length >= 4 && (w.endsWith("ed") || w.endsWith("ing"))) return true;
    if (w.length >= 4 && w.endsWith("es")) return true;
    return false;
}

export function hasVerbHint(words) {
    return words.some(looksLikeVerb);
}

export function hasStopWord(words) {
    return words.some((w) => STOP_WORDS.has(w));
}

export function commaListRatio(text) {
    const commas = (String(text || "").match(/,/g) || []).length;
    const words = tokenizeWords(text);
    if (words.length < 2) return 0;
    return commas / words.length;
}

/** "One, two, tree, show, moo." — unique words, no glue, no verb. */
export function looksLikeWordList(text, words) {
    if (words.length < 3) return false;
    if (hasVerbHint(words) && hasStopWord(words)) return false;
    const commas = commaListRatio(text);
    if (commas >= 0.4 && !hasStopWord(words)) return true;
    if (!hasStopWord(words) && !hasVerbHint(words)) return true;
    return false;
}

export function looksLikeCharMash(words) {
    return words.some((w) => {
        if (w.length >= 4 && /(.)\1{3,}/.test(w)) return true;
        if (w.length >= 6) {
            const uniq = new Set(w).size;
            if (uniq <= 3) return true;
        }
        return false;
    });
}
