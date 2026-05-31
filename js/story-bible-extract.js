/**
 * Pull character profile drafts from manuscript text — appearance, pronouns,
 * first chapter seen, and excerpt snippets.
 */

import { normalizeBibleCharacter } from "./story-bible-api.js?v=9";
import { suggestAppearanceFills } from "./story-bible-enrich.js?v=2";
import { snippetContextsForPhrase } from "./story-bible-scan.js?v=7";

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameRegex(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(escapeRegExp);
    if (!parts.length) return null;
    return parts.join("\\s+");
}

/**
 * @param {string} name
 * @param {string} plain
 * @returns {string}
 */
function inferPronounsNearName(name, plain) {
    const re = nameRegex(name);
    if (!re || !plain) return "";

    const paragraphs = plain.split(/\n+/);
    let he = 0;
    let she = 0;
    let they = 0;

    for (const para of paragraphs) {
        if (!new RegExp(`\\b${re}\\b`, "i").test(para)) continue;
        const lower = para.toLowerCase();
        he += (lower.match(/\bhe\b|\bhim\b|\bhis\b/g) || []).length;
        she += (lower.match(/\bshe\b|\bher\b|\bhers\b/g) || []).length;
        they += (lower.match(/\bthey\b|\bthem\b|\btheir\b/g) || []).length;
    }

    if (she > he && she >= they && she >= 2) return "she/her";
    if (he > she && he >= they && he >= 2) return "he/him";
    if (they > he && they > she && they >= 2) return "they/them";
    if (she >= 3 && she >= he) return "she/her";
    if (he >= 3 && he >= she) return "he/him";
    if (they >= 3) return "they/them";
    return "";
}

/**
 * @param {string} name
 * @param {Array<{ section: string, id: string, title: string, label: string, plainText: string }>} chapters
 */
function findFirstChapterMention(name, chapters) {
    const re = nameRegex(name);
    if (!re || !chapters?.length) return { section: "", id: "", label: "" };
    for (const ch of chapters) {
        if (!ch.plainText) continue;
        if (new RegExp(`\\b${re}\\b`, "i").test(ch.plainText)) {
            return { section: ch.section || "", id: ch.id || "", label: ch.label || ch.title || "" };
        }
    }
    return { section: "", id: "", label: "" };
}

const SIGNAL_LABELS = {
    attribution: "dialogue tag",
    possessive: "possessive",
    vocative: "vocative",
    title: "honorific",
    full_name: "full name",
    context: "introduced with",
    mid_clause: "mid-sentence"
};

/**
 * @param {string} name
 * @param {string} plainText
 * @param {Array<{ section: string, id: string, title: string, label: string, plainText: string }>} [chapters]
 * @param {{ signals?: string[], occurrences?: number }} [meta]
 */
export function extractProfileDraftForName(name, plainText, chapters = [], meta = {}) {
    const trimmed = String(name || "").trim();
    const pseudo = normalizeBibleCharacter({ name: trimmed, aliases: [], appearance: {}, pronouns: "" }, "draft");
    const appearanceHints = suggestAppearanceFills([pseudo], plainText, { minMentions: 1 });
    /** @type {Record<string, string>} */
    const appearance = {};
    for (const hint of appearanceHints) {
        if (!appearance[hint.slot]) appearance[hint.slot] = hint.value;
    }

    const pronouns = inferPronounsNearName(trimmed, plainText);
    const first = findFirstChapterMention(trimmed, chapters);
    const snippets = snippetContextsForPhrase(plainText, trimmed, { max: 3, radius: 90 });
    const signals = (meta.signals || []).map(s => SIGNAL_LABELS[s] || s).filter(Boolean);

    return {
        name: trimmed,
        occurrences: meta.occurrences || 0,
        score: meta.score || 0,
        signals,
        appearance,
        appearanceHints,
        pronouns,
        introducedSection: first.section,
        introducedChapterId: first.id,
        firstSeenLabel: first.label,
        snippets
    };
}

/**
 * @param {Array<{ name: string, occurrences?: number, score?: number, signals?: string[] }>} candidates
 * @param {string} plainText
 * @param {Array<{ section: string, id: string, title: string, label: string, plainText: string }>} [chapters]
 */
export function buildCharacterDraftsFromScan(candidates, plainText, chapters = []) {
    return (candidates || []).map(row =>
        extractProfileDraftForName(row.name, plainText, chapters, {
            occurrences: row.occurrences,
            score: row.score,
            signals: row.signals
        })
    );
}

/**
 * One-line summary for scan result cards.
 * @param {ReturnType<typeof extractProfileDraftForName>} draft
 */
export function formatProfileDraftSummary(draft) {
    const parts = [];
    const app = draft.appearance || {};
    if (app.eyes) parts.push(`eyes: ${app.eyes}`);
    if (app.hair) parts.push(`hair: ${app.hair}`);
    if (app.skin) parts.push(`skin: ${app.skin}`);
    if (app.height) parts.push(`height: ${app.height}`);
    if (app.build) parts.push(`build: ${app.build}`);
    if (draft.pronouns) parts.push(draft.pronouns);
    if (draft.firstSeenLabel) parts.push(`first in ${draft.firstSeenLabel}`);
    return parts.join(" · ");
}
