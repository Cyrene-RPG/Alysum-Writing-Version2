/**
 * Turn the sentences a writer just wrote into XP.
 *
 * Runs on save / chapter-switch / idle / pagehide (solo editor) and on seal
 * (Word Wars) — never per keystroke. Sentences already wrapped in
 * [data-xp-reviewed] are skipped; new ones go through the eligibility pipeline
 * (core/statistics/eligibility.js); passes grant `writing_sentence` XP as
 * provisional (12h) via the grant_sentence_xp RPC and get marked reviewed.
 *
 * LanguageTool (Layer 2b) runs server-side via POST /api/language-tool for
 * signed-in writers who are online: `needs_grammar` sentences are batched to the
 * proxy, which writes the sentence_grammar row grant_sentence_xp checks for. If
 * the proxy is unreachable (or the writer is local/offline) we fall back to a
 * lenient local check — clean capitalised prose with a real verb and ≥4 words —
 * and hold the rest for the next run.
 *
 * No DOM here. The caller passes chapter {id, content} objects and, for the
 * editor, a `markReviewed(texts)` callback that wraps the spans + persists.
 */

import { stripHtmlToText } from "../writing-engine/word-count.js";
import { extractSentencesFromText } from "./sentence-split.js";
import {
    unreviewedSentencesFromHtml,
    sentenceReviewKey,
    stripReviewMarks,
} from "./review-marks.js";
import {
    evaluateSentence,
    VERDICT_PASS,
    VERDICT_REJECT,
    VERDICT_NEEDS_GRAMMAR,
} from "./eligibility.js";
import { hasVerbHint, tokenizeWords } from "./grammar-hints.js";
import { startsWithCapital } from "./grammar-check.js";

const LOCAL_KEY_PREFIX = "alysum:sentence-xp:";
const PASTED_KEY_PREFIX = "alysum:pasted-sentences:";
const MIN_LOCAL_PASS_WORDS = 4;
const LANGUAGE_TOOL_ENDPOINT = "/api/language-tool";
const GRAMMAR_BATCH_MAX = 40;

function localKey(userId) {
    return LOCAL_KEY_PREFIX + String(userId || "");
}

function pastedKey(userId) {
    return PASTED_KEY_PREFIX + String(userId || "");
}

function readPastedSet(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(pastedKey(userId)) || "[]");
        return new Set(Array.isArray(raw) ? raw : []);
    } catch {
        return new Set();
    }
}

function writePastedSet(userId, set) {
    try {
        localStorage.setItem(pastedKey(userId), JSON.stringify([...set].slice(-2000)));
    } catch {
        /* ignore */
    }
}

/**
 * Called from the editor when an insertFromPaste / insertFromDrop happens.
 * The sentences that appear in `nextHtml` but not `prevHtml` are the pasted
 * ones — remember their hashes so they can never earn sentence XP. A sentence
 * that is later rewritten gets a new hash and becomes the writer's own words.
 */
export function recordPastedRegion(userId, prevHtml, nextHtml) {
    if (!userId) return;
    const before = allHashesInHtml(prevHtml);
    const set = readPastedSet(userId);
    let changed = false;
    for (const h of allHashesInHtml(nextHtml)) {
        if (!before.has(h) && !set.has(h)) { set.add(h); changed = true; }
    }
    if (changed) writePastedSet(userId, set);
}

function readLocalGrants(userId) {
    try {
        const raw = JSON.parse(localStorage.getItem(localKey(userId)) || "{}");
        return raw && typeof raw.hashes === "object" ? raw.hashes : {};
    } catch {
        return {};
    }
}

function writeLocalGrants(userId, hashes) {
    try {
        localStorage.setItem(localKey(userId), JSON.stringify({ hashes }));
    } catch {
        /* ignore */
    }
}

/** LanguageTool stand-in: accept obvious clean prose, hold the rest. */
function localGrammarPass(text) {
    const words = tokenizeWords(text);
    return startsWithCapital(text) && hasVerbHint(words) && words.length >= MIN_LOCAL_PASS_WORDS;
}

async function accessToken(supabase) {
    try {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token || "";
    } catch {
        return "";
    }
}

/**
 * Batch the `needs_grammar` sentences to the server-side LanguageTool proxy.
 * Returns a Map<hash, "pass"|"reject"|"needs_ai">. Empty map = proxy unreachable
 * (caller falls back to the lenient local check).
 */
async function runGrammarProxy(supabase, items) {
    const out = new Map();
    if (!supabase || !items.length || typeof fetch !== "function") return out;
    const token = await accessToken(supabase);
    if (!token) return out;
    for (let i = 0; i < items.length; i += GRAMMAR_BATCH_MAX) {
        const batch = items.slice(i, i + GRAMMAR_BATCH_MAX);
        try {
            const res = await fetch(LANGUAGE_TOOL_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    sentences: batch.map((it) => ({
                        hash: it.hash,
                        text: it.text,
                        isDialogue: it.isDialogue,
                    })),
                }),
            });
            if (!res.ok) return out;
            const data = await res.json().catch(() => null);
            const verdicts = data && typeof data.verdicts === "object" ? data.verdicts : null;
            if (!verdicts) return out;
            for (const [hash, verdict] of Object.entries(verdicts)) out.set(hash, verdict);
        } catch {
            return out;
        }
    }
    return out;
}

/** Every sentence hash currently present in a chapter, reviewed or not. */
function allHashesInHtml(html) {
    const plain = stripHtmlToText(stripReviewMarks(html));
    return new Set(extractSentencesFromText(plain).map((s) => sentenceReviewKey(s.text)));
}

/**
 * @param {object} opts
 * @param {{id:string, content:string}[]} opts.chapters
 * @param {'solo'|'word_wars'} [opts.source]
 * @param {string} [opts.roomId]
 * @param {string} opts.userId
 * @param {boolean} [opts.isLocal]
 * @param {object} [opts.supabase]
 * @param {(texts:string[]) => any} [opts.markReviewed] - wrap + persist the passed sentences
 * @returns {Promise<{ granted:number, marked:number, revoked:number }>}
 */
export async function reviewSentencesForXp({
    chapters = [],
    source = "solo",
    roomId = null,
    userId,
    isLocal = false,
    supabase = null,
    markReviewed = null,
} = {}) {
    if (!userId || !Array.isArray(chapters) || !chapters.length) {
        return { granted: 0, marked: 0, revoked: 0 };
    }

    const useProxy = !isLocal && !!supabase
        && (typeof navigator === "undefined" || navigator.onLine !== false);

    const toGrant = [];         // { hash, text, wordCount, source, roomId, chapterId, verdict }
    const needsGrammar = [];    // { hash, text, isDialogue, wordCount, chapterId }
    const passText = [];        // texts to mark reviewed
    const rejectText = [];      // also marked so we stop re-checking them
    const liveHashes = new Set();
    const pastedSet = readPastedSet(userId);

    for (const chapter of chapters) {
        const html = chapter?.content || "";
        for (const h of allHashesInHtml(html)) liveHashes.add(h);
        for (const s of unreviewedSentencesFromHtml(html)) {
            if (pastedSet.has(s.key)) { rejectText.push(s.text); continue; } // pasted → never pays
            const result = evaluateSentence({ text: s.text, isDialogue: s.isDialogue });
            const wc = tokenizeWords(s.text).length;
            if (result.verdict === VERDICT_PASS) {
                toGrant.push({
                    hash: s.key,
                    text: s.text,
                    wordCount: wc,
                    source,
                    roomId: roomId || undefined,
                    chapterId: chapter.id,
                    verdict: "pass",
                });
                passText.push(s.text);
            } else if (result.verdict === VERDICT_NEEDS_GRAMMAR) {
                if (useProxy) {
                    needsGrammar.push({
                        hash: s.key,
                        text: s.text,
                        isDialogue: s.isDialogue,
                        wordCount: wc,
                        chapterId: chapter.id,
                    });
                } else if (localGrammarPass(s.text)) {
                    toGrant.push({
                        hash: s.key,
                        text: s.text,
                        wordCount: wc,
                        source,
                        roomId: roomId || undefined,
                        chapterId: chapter.id,
                        verdict: "pass",
                    });
                    passText.push(s.text);
                }
                // else: hold, re-check next run.
            } else if (result.verdict === VERDICT_REJECT) {
                rejectText.push(s.text);
            }
        }
    }

    if (needsGrammar.length) {
        const verdicts = await runGrammarProxy(supabase, needsGrammar);
        for (const item of needsGrammar) {
            const v = verdicts.get(item.hash);
            if (v === "pass") {
                toGrant.push({
                    hash: item.hash,
                    text: item.text,
                    wordCount: item.wordCount,
                    source,
                    roomId: roomId || undefined,
                    chapterId: item.chapterId,
                    verdict: "needs_grammar",
                });
                passText.push(item.text);
            } else if (v === "reject") {
                rejectText.push(item.text);
            } else if (!v && localGrammarPass(item.text)) {
                // proxy unreachable → lenient fallback so writing still pays.
                toGrant.push({
                    hash: item.hash,
                    text: item.text,
                    wordCount: item.wordCount,
                    source,
                    roomId: roomId || undefined,
                    chapterId: item.chapterId,
                    verdict: "pass",
                });
                passText.push(item.text);
            }
            // v === "needs_ai" → hold for Layer 3, re-check next run.
        }
    }

    let granted = 0;
    let revoked = 0;
    const prevGrants = readLocalGrants(userId);

    if (toGrant.length) {
        if (isLocal || !supabase) {
            const next = { ...prevGrants };
            for (const item of toGrant) next[item.hash] = { ts: Date.now(), words: item.wordCount };
            writeLocalGrants(userId, next);
            granted = toGrant.length;
        } else {
            try {
                const { data } = await supabase.rpc("grant_sentence_xp", { p_sentences: toGrant });
                const ok = Array.isArray(data?.granted) ? data.granted : [];
                granted = ok.length;
                const next = { ...prevGrants };
                for (const hash of ok) next[hash] = { ts: Date.now() };
                writeLocalGrants(userId, next);
            } catch {
                granted = 0;
            }
        }
    }

    // Revoke provisional grants whose sentence no longer exists in the doc.
    const goneHashes = Object.keys(prevGrants).filter((h) => !liveHashes.has(h));
    if (goneHashes.length) {
        if (!isLocal && supabase) {
            try {
                await supabase.rpc("revoke_sentences", { p_hashes: goneHashes });
                revoked = goneHashes.length;
            } catch {
                /* keep them for the next pass */
            }
        }
        const next = { ...prevGrants };
        for (const h of goneHashes) delete next[h];
        writeLocalGrants(userId, next);
    }

    const marks = [...passText, ...rejectText];
    if (marks.length && typeof markReviewed === "function") {
        try { markReviewed(marks); } catch { /* ignore */ }
    }

    // Prune pasted hashes that are no longer anywhere in the doc.
    if (pastedSet.size) {
        let pruned = false;
        for (const h of [...pastedSet]) {
            if (!liveHashes.has(h)) { pastedSet.delete(h); pruned = true; }
        }
        if (pruned) writePastedSet(userId, pastedSet);
    }

    return { granted, marked: marks.length, revoked };
}
