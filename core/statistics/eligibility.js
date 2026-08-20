/**
 * Sentence eligibility Layers 0–3.
 * Cheapest first. Dialogue relaxes 2/3; Layer 1 always applies.
 * Layer 3 is a 0–1 score applied later (batched AI). This file does not call a model.
 */

import { pasteVoidsSentence, uniquenessRatio, UNIQUENESS_MIN } from "./writing-xp.js";
import { isDialogueSentence } from "./sentence-split.js";
import {
    tokenizeWords,
    hasVerbHint,
    hasStopWord,
    looksLikeWordList,
    looksLikeCharMash
} from "./grammar-hints.js";
import { startsWithCapital, verdictFromLanguageTool } from "./grammar-check.js";

export const MIN_WORDS_NARRATION = 3;
export const MIN_WORDS_DIALOGUE = 1;

/** Layer 3 cutoffs — tune later without changing the pipeline shape. */
export const LAYER3 = Object.freeze({
    narrationPass: 0.65,
    narrationReject: 0.4,
    dialoguePass: 0.35,
    dialogueReject: 0.12
});

export const VERDICT_PASS = "pass";
export const VERDICT_REJECT = "reject";
export const VERDICT_NEEDS_AI = "needs_ai";
export const VERDICT_NEEDS_GRAMMAR = "needs_grammar";

function reject(layer, reason, extra) {
    return { verdict: VERDICT_REJECT, layer, reason, needsAi: false, ...extra };
}

function pass(layer, reason, extra) {
    return { verdict: VERDICT_PASS, layer, reason, needsAi: false, ...extra };
}

function needsAi(reason, extra) {
    return { verdict: VERDICT_NEEDS_AI, layer: 3, reason, needsAi: true, needsGrammar: false, ...extra };
}

function needsGrammar(reason, extra) {
    return { verdict: VERDICT_NEEDS_GRAMMAR, layer: 2, reason, needsAi: false, needsGrammar: true, ...extra };
}

function endsWithTerminal(text) {
    return /[.!?]["'”’»]?["'”’»]?\s*$/.test(String(text || "").trim());
}

function baseFields(text, isDialogue, words, uniqueness) {
    return {
        text: String(text || "").trim(),
        isDialogue: Boolean(isDialogue),
        wordCount: words.length,
        uniqueness
    };
}

/**
 * @param {{ text: string, isDialogue?: boolean, pastedInsert?: string, pastedMultiWord?: boolean }} input
 */
export function evaluateLayers01(input) {
    const text = String(input?.text || "").trim();
    const isDialogue = input?.isDialogue ?? isDialogueSentence(text);
    const words = tokenizeWords(text);
    const uniqueness = uniquenessRatio(words);
    const extra = baseFields(text, isDialogue, words, uniqueness);

    const pasted = input?.pastedMultiWord === true
        || (input?.pastedInsert != null && pasteVoidsSentence(input.pastedInsert));
    if (pasted) {
        return reject(0, "multi_word_paste", extra);
    }
    if (!text || !endsWithTerminal(text)) {
        return reject(0, "no_terminal", extra);
    }
    const minWords = isDialogue ? MIN_WORDS_DIALOGUE : MIN_WORDS_NARRATION;
    if (words.length < minWords) {
        return reject(0, "too_short", extra);
    }
    if (looksLikeCharMash(words)) {
        return reject(1, "char_mash", extra);
    }
    if (uniqueness < UNIQUENESS_MIN) {
        return reject(1, "low_uniqueness", extra);
    }
    extra.layer01 = "ok";
    return extra;
}

/**
 * Run Layers 0–2. Narration that looks like English still needs LanguageTool
 * (free) — verb+glue is not enough ("hello cheese man how are you doing.").
 * Dialogue that clears Layer 1 stays relaxed.
 */
export function evaluateSentence(input) {
    const early = evaluateLayers01(input);
    if (early.verdict === VERDICT_REJECT) return early;

    const text = early.text;
    const words = tokenizeWords(text);
    const extra = {
        text,
        isDialogue: early.isDialogue,
        wordCount: early.wordCount,
        uniqueness: early.uniqueness
    };

    if (input?.grammarMatches) {
        return applyLanguageToolResult(extra, input.grammarMatches);
    }

    if (early.isDialogue) {
        return pass(2, "dialogue_relaxed", extra);
    }

    if (looksLikeWordList(text, words)) {
        return reject(2, "word_list", extra);
    }

    const verb = hasVerbHint(words);
    const glue = hasStopWord(words);
    if (!verb && !glue) {
        return reject(2, "no_structure", extra);
    }

    return needsGrammar(
        startsWithCapital(text) ? "needs_languagetool" : "informal_narration",
        extra
    );
}

export function applyLanguageToolResult(base, matches) {
    const extra = { ...base };
    const v = verdictFromLanguageTool(extra.text, matches, { isDialogue: extra.isDialogue });
    extra.grammarSevere = v.grammarSevere;
    extra.grammarSoft = v.grammarSoft;
    extra.grammarTotal = v.grammarTotal;
    extra.needsGrammar = false;
    if (v.verdict === "reject") return reject(2, v.reason, extra);
    if (v.verdict === "needs_ai") return needsAi(v.reason, extra);
    return pass(2, v.reason, extra);
}

/** Apply a Layer 3 score (0–1) to a needs_ai result. */
export function applyCoherenceScore(result, score) {
    if (!result || result.verdict !== VERDICT_NEEDS_AI) return result;
    const n = Number(score);
    if (!Number.isFinite(n)) {
        return reject(3, "no_score", { ...result, coherence: null, needsAi: false });
    }
    const s = Math.min(1, Math.max(0, n));
    const passAt = result.isDialogue ? LAYER3.dialoguePass : LAYER3.narrationPass;
    const rejectAt = result.isDialogue ? LAYER3.dialogueReject : LAYER3.narrationReject;
    if (s >= passAt) {
        return pass(3, "ai_pass", { ...result, coherence: s, needsAi: false });
    }
    if (s < rejectAt) {
        return reject(3, "ai_reject", { ...result, coherence: s, needsAi: false });
    }
    return reject(3, "ai_borderline", { ...result, coherence: s, needsAi: false });
}

/**
 * Split a sealed war batch: local reject/pass vs leftover for one batched AI call.
 */
export function guestFinalize(result) {
    if (!result) return reject(3, "guest_no_ai", {});
    if (result.verdict === VERDICT_NEEDS_AI || result.verdict === VERDICT_NEEDS_GRAMMAR) {
        return reject(3, "guest_no_network", { ...result, needsAi: false, needsGrammar: false });
    }
    return result;
}

/**
 * Split a sealed war batch: local reject/pass, LanguageTool queue, leftover AI.
 */
export function partitionForLayer3(sentences) {
    const rejected = [];
    const passed = [];
    const forGrammar = [];
    const forAi = [];
    for (const item of sentences || []) {
        const result = evaluateSentence(item);
        if (result.verdict === VERDICT_PASS) passed.push({ item, result });
        else if (result.verdict === VERDICT_NEEDS_GRAMMAR) forGrammar.push({ item, result });
        else if (result.verdict === VERDICT_NEEDS_AI) forAi.push({ item, result });
        else rejected.push({ item, result });
    }
    return { rejected, passed, forGrammar, forAi };
}

export const WORKED_EXAMPLES = Object.freeze([
    {
        text: "One, one, one, one, one.",
        isDialogue: true,
        expect: "reject",
        layer: 1,
        why: "Layer 1 uniqueness even as dialogue"
    },
    {
        text: "One, two, tree, show, moo.",
        isDialogue: false,
        expect: "reject",
        layer: 2,
        why: "Narration word list"
    },
    {
        text: "One, zoo and he shoe boo.",
        isDialogue: true,
        expect: "pass",
        layer: 2,
        why: "Dialogue relaxed after Layer 1"
    },
    {
        text: "One, zoo and he shoe boo.",
        isDialogue: false,
        expect: "needs_grammar",
        why: "Narration leftover — LanguageTool then Layer 3, not a cheap pass"
    },
    {
        text: "hello cheese man how are you doing.",
        isDialogue: false,
        expect: "needs_grammar",
        why: "Informal narration — LanguageTool + coherence, not a cheap pass"
    }
]);
