/**
 * Turn the sentences a writer just wrote into XP.
 *
 * Runs on save / chapter-switch / idle / pagehide (solo editor) and on seal
 * (Word Wars) — never per keystroke. Sentences already wrapped in
 * [data-xp-reviewed] are skipped; new ones go through the eligibility pipeline
 * (core/statistics/eligibility.js); passes grant `writing_sentence` XP as
 * provisional (12h) via the grant_sentence_xp RPC and get marked reviewed.
 *
 * LanguageTool (Layer 2b) is not wired yet — until it is, `needs_grammar`
 * sentences that look like clean capitalised prose (real verb, ≥4 words) are
 * passed locally; the rest are held and re-checked next run.
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
const MIN_LOCAL_PASS_WORDS = 4;

function localKey(userId) {
    return LOCAL_KEY_PREFIX + String(userId || "");
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

    const toGrant = [];         // { hash, text, wordCount, source, roomId, chapterId, verdict }
    const passText = [];        // texts to mark reviewed
    const rejectText = [];      // also marked so we stop re-checking them
    const liveHashes = new Set();

    for (const chapter of chapters) {
        const html = chapter?.content || "";
        for (const h of allHashesInHtml(html)) liveHashes.add(h);
        for (const s of unreviewedSentencesFromHtml(html)) {
            const result = evaluateSentence({ text: s.text, isDialogue: s.isDialogue });
            const wc = tokenizeWords(s.text).length;
            if (result.verdict === VERDICT_PASS
                || (result.verdict === VERDICT_NEEDS_GRAMMAR && localGrammarPass(s.text))) {
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
            } else if (result.verdict === VERDICT_REJECT) {
                rejectText.push(s.text);
            }
            // needs_grammar we can't resolve → leave unmarked, re-check next run.
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

    return { granted, marked: marks.length, revoked };
}
