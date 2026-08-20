/**
 * Word Wars finish job: one LanguageTool request for leftover narration.
 * Browsers never load this file.
 */

import {
    fetchLanguageToolCheck,
    packSentencesForLanguageTool,
    matchesForSpan
} from "../../statistics/grammar-check.js";
import { applyLanguageToolResult } from "../../statistics/eligibility.js";

export async function runLanguageToolOnBatch(forGrammar, { fetchFn } = {}) {
    const texts = (forGrammar || []).map((row) => row.item?.text || row.result?.text || "");
    if (!texts.length) return [];
    const { packed, spans } = packSentencesForLanguageTool(texts);
    const json = await fetchLanguageToolCheck(packed, { fetchFn });
    const matches = json?.matches || [];
    return forGrammar.map((row, i) => {
        const span = spans[i];
        const slice = matchesForSpan(matches, span);
        const result = applyLanguageToolResult(row.result, slice);
        return { ...row, result };
    });
}
