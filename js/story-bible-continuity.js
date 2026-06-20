/**
 * Timeline, relationship graph, and continuity conflict detection for Story Bible.
 */

import { SINGLETON_FACT_CATEGORIES } from "./story-bible-facts-api.js?v=1";

function normalizeText(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
}

function chapterSortKey(chapterOptions, chapterTitle) {
    const title = normalizeText(chapterTitle).toLowerCase();
    if (!title) return 99999;
    const ix = (chapterOptions || []).findIndex(ch => normalizeText(ch.title).toLowerCase() === title);
    return ix >= 0 ? ix : 99998;
}

/**
 * @param {ReturnType<import("./story-bible-facts-api.js").normalizeBibleFact>[]} facts
 * @param {ReturnType<import("./story-bible-api.js").normalizeBibleCharacter>[]} characters
 * @param {{ section: string, id: string, title: string, label: string }[]} chapterOptions
 */
export function buildTimeline(facts, characters, chapterOptions) {
    const events = [];

    for (const char of characters || []) {
        if (char.introducedChapterId) {
            const ch = (chapterOptions || []).find(c => c.id === char.introducedChapterId);
            events.push({
                kind: "introduced",
                sort: chapterSortKey(chapterOptions, ch?.title || ""),
                chapter: ch?.title || "Unknown chapter",
                chapterLabel: ch?.label || "",
                characterId: char.id,
                characterName: char.name || "(unnamed)",
                detail: `${char.name || "Character"} introduced`,
                source: "bible"
            });
        }
        if (char.status === "deceased" && char.deceasedChapterId) {
            const ch = (chapterOptions || []).find(c => c.id === char.deceasedChapterId);
            events.push({
                kind: "death",
                sort: chapterSortKey(chapterOptions, ch?.title || ""),
                chapter: ch?.title || "Unknown chapter",
                chapterLabel: ch?.label || "",
                characterId: char.id,
                characterName: char.name || "(unnamed)",
                detail: `${char.name || "Character"} dies`,
                source: "bible"
            });
        }
    }

    for (const fact of facts || []) {
        const char = (characters || []).find(c => c.id === fact.character_id);
        events.push({
            kind: "fact",
            sort: chapterSortKey(chapterOptions, fact.source_chapter),
            chapter: fact.source_chapter || "Unknown chapter",
            chapterLabel: fact.source_chapter || "",
            characterId: fact.character_id,
            characterName: char?.name || "Unknown",
            detail: `${fact.category}: ${fact.value}`,
            source: fact.source_text || "",
            factId: fact.id,
            category: fact.category
        });
    }

    events.sort((a, b) => a.sort - b.sort || a.characterName.localeCompare(b.characterName));
    return events;
}

/**
 * @param {ReturnType<import("./story-bible-facts-api.js").normalizeBibleFact>[]} facts
 * @param {ReturnType<import("./story-bible-api.js").normalizeBibleCharacter>[]} characters
 */
export function buildRelationshipGraph(facts, characters) {
    const nodes = new Map();
    const edges = [];

    for (const char of characters || []) {
        if (!normalizeText(char.name)) continue;
        nodes.set(char.id, { id: char.id, name: char.name, type: "character" });
    }

    for (const fact of facts || []) {
        if (normalizeText(fact.category) !== "Relationships") continue;
        const fromChar = (characters || []).find(c => c.id === fact.character_id);
        if (!fromChar) continue;
        const val = normalizeText(fact.value);
        const match = val.match(/^(\w+)\s+of\s+(.+)$/i);
        if (!match) continue;
        const relation = match[1].toLowerCase();
        const targetName = normalizeText(match[2]);
        let target = (characters || []).find(c => normalizeText(c.name).toLowerCase() === targetName.toLowerCase());
        let targetId = target?.id;
        if (!targetId) {
            targetId = `rel_${targetName.toLowerCase().replace(/\s+/g, "_")}`;
            if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId, name: targetName, type: "mentioned" });
        }
        edges.push({
            from: fromChar.id,
            to: targetId,
            label: relation,
            source: fact.source_text,
            factId: fact.id
        });
    }

    return {
        nodes: [...nodes.values()],
        edges
    };
}

/**
 * @param {ReturnType<import("./story-bible-facts-api.js").normalizeBibleFact>[]} facts
 * @param {ReturnType<import("./story-bible-api.js").normalizeBibleCharacter>[]} characters
 */
export function detectContinuityConflicts(facts, characters) {
    const conflicts = [];
    const byCharCat = new Map();

    for (const fact of facts || []) {
        const cat = normalizeText(fact.category);
        if (!SINGLETON_FACT_CATEGORIES.has(cat)) continue;
        const key = `${fact.character_id}|${cat.toLowerCase()}`;
        if (!byCharCat.has(key)) byCharCat.set(key, []);
        byCharCat.get(key).push(fact);
    }

    for (const [, rows] of byCharCat) {
        const values = new Map();
        for (const row of rows) {
            const v = normalizeText(row.value).toLowerCase();
            if (!values.has(v)) values.set(v, []);
            values.get(v).push(row);
        }
        if (values.size <= 1) continue;
        const char = (characters || []).find(c => c.id === rows[0].character_id);
        conflicts.push({
            characterId: rows[0].character_id,
            characterName: char?.name || "Unknown",
            category: rows[0].category,
            values: [...values.entries()].map(([value, factRows]) => ({
                value: factRows[0].value,
                sources: factRows.map(r => ({
                    chapter: r.source_chapter,
                    paragraph: r.source_paragraph,
                    text: r.source_text,
                    factId: r.id
                }))
            }))
        });
    }

    return conflicts;
}

/**
 * Compare character appearance sheet vs latest singleton facts.
 */
export function detectSheetFactMismatches(facts, characters) {
    const mismatches = [];
    const slotMap = {
        eyes: "Eye Color",
        hair: "Hair Color",
        skin: "Skin Tone",
        height: "Height",
        age: "Age"
    };

    for (const char of characters || []) {
        const app = char.appearance || {};
        for (const [slot, category] of Object.entries(slotMap)) {
            const sheetVal = normalizeText(app[slot]).toLowerCase();
            if (!sheetVal) continue;
            const charFacts = (facts || []).filter(
                f => f.character_id === char.id && normalizeText(f.category) === category
            );
            if (!charFacts.length) continue;
            const latest = charFacts[0];
            const factVal = normalizeText(latest.value).toLowerCase();
            if (factVal && sheetVal && !sheetVal.includes(factVal) && !factVal.includes(sheetVal)) {
                mismatches.push({
                    characterId: char.id,
                    characterName: char.name,
                    slot,
                    category,
                    sheetValue: app[slot],
                    factValue: latest.value,
                    factId: latest.id
                });
            }
        }
    }
    return mismatches;
}
