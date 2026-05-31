/**
 * Scan the manuscript for appearance traits near existing bible characters
 * and suggest values for empty appearance slots only.
 */

import {
    splitSentences,
    buildNameRegex,
    locateMatchesInSentences,
    escapeRegExp
} from "./plot-doctor/util/text.js?v=1";
import {
    listAttributeSlots,
    listSlotWords,
    canonicalForSlot,
    parsePronouns,
    HEDGE_TOKENS
} from "./plot-doctor/util/lexicon.js?v=1";
import { normalizeBibleCharacter, saveBibleCharacter } from "./story-bible-api.js?v=7";

const SLOT_LABELS = {
    eyes: "Eyes",
    hair: "Hair",
    skin: "Skin",
    height: "Height",
    build: "Build"
};

function buildSlotRegex(slot) {
    const words = listSlotWords(slot).sort((a, b) => b.length - a.length).map(escapeRegExp);
    if (!words.length) return null;
    return new RegExp(`\\b(?:${words.join("|")})\\b`, "gi");
}

function hasHedgeNearby(text, sentence) {
    const slice = text.slice(sentence.start, sentence.end).toLowerCase();
    for (const hedge of HEDGE_TOKENS) {
        const re = new RegExp(`\\b${hedge.replace(/\s+/g, "\\s+")}\\b`);
        if (re.test(slice)) return true;
    }
    return false;
}

function snippetOf(text, start, end) {
    const padding = 50;
    const lo = Math.max(0, start - padding);
    const hi = Math.min(text.length, end + padding);
    return text.slice(lo, hi).replace(/\s+/g, " ").trim();
}

function displayValueForBucket(slot, bucket, rawWord) {
    if (rawWord && rawWord.trim()) return rawWord.trim();
    return bucket.replace(/_/g, " ");
}

/**
 * @param {Array<ReturnType<typeof normalizeBibleCharacter>>} characters
 * @param {string} plainText
 * @param {{ minMentions?: number }} [opts]
 * @returns {Array<{ id: string, characterId: string, characterName: string, slot: string, slotLabel: string, value: string, bucket: string, count: number, snippet: string }>}
 */
export function suggestAppearanceFills(characters, plainText, opts = {}) {
    const minMentions = typeof opts.minMentions === "number" ? opts.minMentions : 2;
    if (!plainText?.trim() || !Array.isArray(characters) || !characters.length) return [];

    const sentences = splitSentences(plainText);
    if (!sentences.length) return [];

    const slots = listAttributeSlots();
    const slotRegexCache = new Map();
    function slotRegex(slot) {
        if (!slotRegexCache.has(slot)) slotRegexCache.set(slot, buildSlotRegex(slot));
        return slotRegexCache.get(slot);
    }

    const suggestions = [];

    for (const char of characters) {
        const appearance = char.appearance || {};
        const emptySlots = slots.filter(slot => !(appearance[slot] || "").trim());
        if (!emptySlots.length) continue;

        const recognizableNames = [char.name, ...(char.aliases || [])].filter(Boolean);
        const nameRe = buildNameRegex(recognizableNames);
        if (!nameRe) continue;

        const nameMatches = locateMatchesInSentences(plainText, new RegExp(nameRe, "gi"), sentences);
        const sentencesWithChar = new Set(nameMatches.map(m => m.sentence.start));

        const pronouns = parsePronouns(char.pronouns || "");
        if (pronouns.recognized && nameMatches.length) {
            const paragraphs = plainText.split(/\n+/);
            let offset = 0;
            const paragraphRanges = paragraphs.map(p => {
                const start = plainText.indexOf(p, offset);
                const trueStart = start >= 0 ? start : offset;
                offset = trueStart + p.length;
                return { start: trueStart, end: trueStart + p.length };
            });
            for (const m of nameMatches) {
                const para = paragraphRanges.find(p => m.sentence.start >= p.start && m.sentence.end <= p.end);
                if (!para) continue;
                for (const sent of sentences) {
                    if (sent.start >= para.start && sent.end <= para.end) {
                        sentencesWithChar.add(sent.start);
                    }
                }
            }
        }

        for (const slot of emptySlots) {
            const re = slotRegex(slot);
            if (!re) continue;

            /** @type {Map<string, { count: number, rawWord: string, snippet: string }>} */
            const bucketCounts = new Map();
            const matches = locateMatchesInSentences(plainText, new RegExp(re, "gi"), sentences);

            for (const m of matches) {
                if (!sentencesWithChar.has(m.sentence.start)) continue;
                if (hasHedgeNearby(plainText, m.sentence)) continue;
                const bucket = canonicalForSlot(slot, m.matchText);
                if (!bucket) continue;

                const prev = bucketCounts.get(bucket) || { count: 0, rawWord: m.matchText, snippet: "" };
                prev.count += 1;
                if (!prev.snippet) prev.snippet = snippetOf(plainText, m.matchStart, m.matchEnd);
                if ((m.matchText || "").length > (prev.rawWord || "").length) prev.rawWord = m.matchText;
                bucketCounts.set(bucket, prev);
            }

            let best = null;
            for (const [bucket, data] of bucketCounts) {
                if (!best || data.count > best.count) best = { bucket, ...data };
            }
            if (!best || best.count < minMentions) continue;

            suggestions.push({
                id: `${char.id}::${slot}`,
                characterId: char.id,
                characterName: char.name || "(unnamed)",
                slot,
                slotLabel: SLOT_LABELS[slot] || slot,
                value: displayValueForBucket(slot, best.bucket, best.rawWord),
                bucket: best.bucket,
                count: best.count,
                snippet: best.snippet
            });
        }
    }

    suggestions.sort((a, b) => b.count - a.count || a.characterName.localeCompare(b.characterName));
    return suggestions;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {Array<ReturnType<typeof normalizeBibleCharacter>>} characters
 * @param {Array<{ characterId: string, slot: string, value: string }>} picks
 */
export async function applyAppearanceSuggestions(supabase, uid, bookId, characters, picks) {
    if (!picks?.length) return 0;

    const byChar = new Map();
    for (const pick of picks) {
        if (!pick.characterId || !pick.slot || !pick.value) continue;
        if (!byChar.has(pick.characterId)) byChar.set(pick.characterId, []);
        byChar.get(pick.characterId).push(pick);
    }

    let updated = 0;
    for (const [characterId, slotPicks] of byChar) {
        const base = characters.find(c => c.id === characterId);
        if (!base) continue;
        const appearance = { ...(base.appearance || {}) };
        let changed = false;
        for (const pick of slotPicks) {
            if ((appearance[pick.slot] || "").trim()) continue;
            appearance[pick.slot] = pick.value;
            changed = true;
        }
        if (!changed) continue;
        const next = normalizeBibleCharacter({ ...base, appearance }, base.id);
        await saveBibleCharacter(supabase, uid, bookId, next);
        updated++;
    }
    return updated;
}
