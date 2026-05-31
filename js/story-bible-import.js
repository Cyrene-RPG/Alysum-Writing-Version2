/**
 * Shared helpers — create Story Bible entries from manuscript scan or Plot Doctor findings.
 */

import {
    normalizeBibleCharacter,
    generateBibleCharacterId,
    saveBibleCharacter,
    normalizeBiblePlace,
    generateBiblePlaceId,
    saveBiblePlace,
    listBibleCharacters
} from "./story-bible-api.js?v=7";
import { snippetContextsForPhrase } from "./story-bible-scan.js?v=6";

function normalizeNameKey(name) {
    return String(name || "")
        .trim()
        .toLowerCase();
}

/**
 * @param {string} name
 * @param {number} occurrences
 * @param {string} plain
 * @param {string} [sourceLabel]
 */
export function draftNotesFromScanName(name, occurrences, plain, sourceLabel = "manuscript scan") {
    const snippets = snippetContextsForPhrase(plain, name, { max: 4, radius: 100 });
    let notes =
        `[Added from ${sourceLabel} — about ${occurrences}× in this book.]\n` +
        `Edit or replace this note; it is not updated automatically.\n`;
    if (snippets.length) notes += "\nExcerpts:\n" + snippets.map(s => `• ${s}`).join("\n\n");
    else notes += "\n(No excerpts captured for this phrase.)";
    return notes;
}

/**
 * @param {{ name: string, occurrences?: number }} row
 * @param {string} plain
 * @param {string} [sourceLabel]
 */
export function characterFromScanSuggestion(row, plain, sourceLabel) {
    const name = (row.name || "").trim();
    const occurrences = typeof row.occurrences === "number" ? row.occurrences : 1;
    return normalizeBibleCharacter(
        {
            name,
            aliases: [],
            appearance: {},
            notes: draftNotesFromScanName(name, occurrences, plain, sourceLabel),
            tags: ["scan-import"],
            introducedSection: "",
            introducedChapterId: ""
        },
        generateBibleCharacterId()
    );
}

/**
 * @param {{ name: string, occurrences?: number }} row
 * @param {string} plain
 * @param {string} [sourceLabel]
 */
export function placeFromScanSuggestion(row, plain, sourceLabel) {
    const name = (row.name || "").trim();
    const occurrences = typeof row.occurrences === "number" ? row.occurrences : 1;
    return normalizeBiblePlace(
        {
            name,
            aliases: [],
            kind: "",
            parentPlace: "",
            notes: draftNotesFromScanName(name, occurrences, plain, sourceLabel),
            tags: ["scan-import"],
            introducedSection: "",
            introducedChapterId: ""
        },
        generateBiblePlaceId()
    );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {{ name: string, occurrences?: number }} row
 * @param {string} plain
 * @param {string} [sourceLabel]
 */
export async function saveCharacterFromScan(supabase, uid, bookId, row, plain, sourceLabel) {
    const character = characterFromScanSuggestion(row, plain, sourceLabel);
    if (!character.name) throw new Error("Name required");
    await saveBibleCharacter(supabase, uid, bookId, character);
    return character;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {{ name: string, occurrences?: number }} row
 * @param {string} plain
 * @param {string} [sourceLabel]
 */
export async function savePlaceFromScan(supabase, uid, bookId, row, plain, sourceLabel) {
    const place = placeFromScanSuggestion(row, plain, sourceLabel);
    if (!place.name) throw new Error("Name required");
    await saveBiblePlace(supabase, uid, bookId, place);
    return place;
}

/**
 * @param {Array<{ name: string, count?: number }>} members
 */
export function pickPrimaryNameFromDrift(members) {
    if (!members?.length) return { primary: "", aliases: [] };
    const sorted = [...members].sort((a, b) => (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name));
    const primary = sorted[0].name;
    const aliases = sorted.slice(1).map(m => m.name).filter(n => n && n !== primary);
    return { primary, aliases };
}

/**
 * @param {Record<string, any>} issue
 * @returns {Array<{ name: string, count: number }>}
 */
export function parseNameDriftMembers(issue) {
    const summary = String(issue.evidence_summary || issue.evidenceSummary || "");
    const fromSummary = [];
    const re = /([A-Za-z][A-Za-z'\-]*)\s*\((\d+)\)/g;
    let m;
    while ((m = re.exec(summary)) !== null) {
        fromSummary.push({ name: m[1], count: parseInt(m[2], 10) || 1 });
    }
    if (fromSummary.length) return fromSummary;

    const ref = String(issue.evidence_ref || issue.evidenceRef || "");
    if (ref.startsWith("cluster:")) {
        return ref
            .slice(8)
            .split(",")
            .map(n => n.trim())
            .filter(Boolean)
            .map(name => ({ name, count: 1 }));
    }
    return [];
}

/**
 * @param {ReturnType<typeof normalizeBibleCharacter>} character
 * @param {string[]} aliasNames
 */
export function mergeAliasesIntoCharacter(character, aliasNames) {
    const existing = new Set(
        [character.name, ...(character.aliases || [])].map(n => normalizeNameKey(n)).filter(Boolean)
    );
    const nextAliases = [...(character.aliases || [])];
    for (const alias of aliasNames) {
        const key = normalizeNameKey(alias);
        if (!key || existing.has(key)) continue;
        existing.add(key);
        nextAliases.push(alias.trim());
    }
    return normalizeBibleCharacter({ ...character, aliases: nextAliases }, character.id);
}

/**
 * Import a name-drift Plot Doctor issue into the Story Bible.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {Record<string, any>} issue
 * @param {string} plain
 */
export async function importNameDriftIssueToBible(supabase, uid, bookId, issue, plain) {
    const members = parseNameDriftMembers(issue);
    if (!members.length) throw new Error("Could not parse name cluster");

    const { primary, aliases } = pickPrimaryNameFromDrift(members);
    if (!primary) throw new Error("No primary name in cluster");

    const characters = await listBibleCharacters(supabase, uid, bookId);
    const keys = new Set(members.map(m => normalizeNameKey(m.name)));
    const match = characters.find(c => {
        const names = [c.name, ...(c.aliases || [])].map(normalizeNameKey);
        return names.some(n => keys.has(n));
    });

    if (match) {
        const allAliases = members.map(m => m.name).filter(n => normalizeNameKey(n) !== normalizeNameKey(match.name));
        const merged = mergeAliasesIntoCharacter(match, allAliases);
        await saveBibleCharacter(supabase, uid, bookId, merged);
        return { action: "merged", character: merged };
    }

    const notes =
        draftNotesFromScanName(primary, members[0]?.count || 1, plain, "Plot Doctor name drift") +
        (aliases.length ? `\n\nAlso seen as: ${aliases.join(", ")}` : "");
    const created = normalizeBibleCharacter(
        {
            name: primary,
            aliases,
            appearance: {},
            notes,
            tags: ["plot-doctor-import"],
            introducedSection: "",
            introducedChapterId: ""
        },
        generateBibleCharacterId()
    );
    await saveBibleCharacter(supabase, uid, bookId, created);
    return { action: "created", character: created };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} uid
 * @param {string} bookId
 * @param {Array<{ name: string, occurrences?: number }>} rows
 * @param {string} plain
 * @param {string} [sourceLabel]
 */
export async function bulkSaveCharactersFromScan(supabase, uid, bookId, rows, plain, sourceLabel) {
    let added = 0;
    for (const row of rows) {
        if (!(row.name || "").trim()) continue;
        await saveCharacterFromScan(supabase, uid, bookId, row, plain, sourceLabel);
        added++;
    }
    return added;
}
