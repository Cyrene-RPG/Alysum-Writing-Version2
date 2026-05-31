/**
 * Plot Doctor — attribute-slot lexicon for the attribute-contradiction detector.
 *
 * Each slot has:
 *   - synonyms: a map from any recognized word to a canonical bucket.
 *   - contradictions: buckets that contradict each other if both appear for the
 *     same character (default: any two distinct buckets contradict each other).
 *   - hedge tokens that, if present near a candidate, suppress the flag.
 */

const HEDGES = [
    "once",
    "had",
    "was",
    "used",
    "before",
    "previously",
    "former",
    "formerly",
    "no longer",
    "not anymore",
    "would",
    "seem",
    "seemed",
    "look",
    "looked",
    "appear",
    "appeared",
    "almost",
    "nearly",
    "perhaps",
    "maybe"
];

/**
 * Build a map from a synonym list per bucket.
 * @param {Record<string, string[]>} buckets
 */
function buildSlot(buckets) {
    const synonyms = new Map();
    for (const [canonical, words] of Object.entries(buckets)) {
        for (const w of words) synonyms.set(w.toLowerCase(), canonical);
    }
    return { synonyms, buckets };
}

const EYES = buildSlot({
    blue: ["blue", "blue-grey", "blue-gray", "sky-blue", "ice-blue"],
    green: ["green", "emerald", "jade", "olive-green"],
    brown: ["brown", "chestnut", "chocolate"],
    hazel: ["hazel"],
    grey: ["grey", "gray", "slate", "steel-grey", "steel-gray"],
    amber: ["amber", "golden", "honey-coloured", "honey-colored"],
    violet: ["violet", "purple"],
    black: ["black", "obsidian"],
    dark: ["dark"]
});

const HAIR = buildSlot({
    blond: ["blond", "blonde", "golden", "flaxen", "platinum"],
    brown: ["brown", "brunette", "chestnut", "chocolate", "mousy"],
    black: ["black", "raven", "jet-black", "jet"],
    red: ["red", "redhead", "ginger", "auburn", "copper"],
    grey: ["grey", "gray", "silver", "salt-and-pepper"],
    white: ["white", "snow-white"],
    dark: ["dark"]
});

const SKIN = buildSlot({
    pale: ["pale", "fair", "ivory", "porcelain", "milky"],
    olive: ["olive", "tan", "tanned"],
    brown: ["brown", "bronze", "copper"],
    dark: ["dark", "deep-brown", "deep"],
    freckled: ["freckled", "freckle"],
    ruddy: ["ruddy", "florid"]
});

const HEIGHT = buildSlot({
    short: ["short", "petite", "small", "stunted", "stubby"],
    average: ["average", "medium-height", "middling"],
    tall: ["tall", "towering", "lanky", "statuesque"],
    very_tall: ["giant", "gigantic", "huge"]
});

const BUILD = buildSlot({
    slim: ["slim", "slender", "thin", "skinny", "wiry", "lean", "lithe"],
    average: ["average-build", "average", "ordinary"],
    muscular: ["muscular", "muscled", "brawny", "powerful", "strapping", "burly"],
    heavy: ["heavy", "stout", "stocky", "thick-set", "thickset", "portly", "plump"]
});

const SLOT_DEFINITIONS = Object.freeze({
    eyes: EYES,
    hair: HAIR,
    skin: SKIN,
    height: HEIGHT,
    build: BUILD
});

/**
 * Return canonical bucket for a word in a slot, or "" if unrecognized.
 * @param {string} slot
 * @param {string} word
 */
export function canonicalForSlot(slot, word) {
    const def = SLOT_DEFINITIONS[slot];
    if (!def) return "";
    return def.synonyms.get(String(word ?? "").toLowerCase()) || "";
}

/**
 * @param {string} slot
 */
export function listSlotWords(slot) {
    const def = SLOT_DEFINITIONS[slot];
    if (!def) return [];
    return Array.from(def.synonyms.keys());
}

export function listAttributeSlots() {
    return Object.keys(SLOT_DEFINITIONS);
}

/** Human labels for bible form sections. */
export const APPEARANCE_SLOT_LABELS = Object.freeze({
    eyes: "Eyes",
    hair: "Hair",
    skin: "Skin",
    height: "Height",
    build: "Build"
});

/**
 * Canonical bucket labels for datalist / select suggestions in the Story Bible.
 * @param {string} slot
 * @returns {string[]}
 */
export function canonicalOptionsForSlot(slot) {
    const def = SLOT_DEFINITIONS[slot];
    if (!def || !def.buckets) return [];
    return Object.keys(def.buckets).map(k => k.replace(/_/g, " "));
}

/**
 * Compare two canonical bucket labels in the same slot. Returns true if they
 * are different (contradictions are simply "different buckets" today).
 * @param {string} a
 * @param {string} b
 */
export function bucketsContradict(a, b) {
    if (!a || !b) return false;
    if (a === b) return false;
    if (a === "dark" || b === "dark") {
        const other = a === "dark" ? b : a;
        if (other === "black" || other === "brown") return false;
    }
    return true;
}

export const HEDGE_TOKENS = Object.freeze(new Set(HEDGES));

/**
 * Cheap parse of free-form bible appearance text into a canonical bucket for a slot.
 * Empty bible field returns "". Multi-word values pick the first recognized token.
 * @param {string} slot
 * @param {string} value
 */
export function parseBibleSlotValue(slot, value) {
    const text = String(value ?? "").toLowerCase();
    if (!text.trim()) return "";
    const def = SLOT_DEFINITIONS[slot];
    if (!def) return "";
    for (const [word, canonical] of def.synonyms) {
        const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
        if (re.test(text)) return canonical;
    }
    return "";
}

/**
 * Standard third-person pronouns by token. Returns { gendered: true/false, words: Set<string> }
 * given the bible's free-form pronoun string.
 * @param {string} pronounsStr
 */
export function parsePronouns(pronounsStr) {
    const text = String(pronounsStr ?? "").toLowerCase();
    if (!text.trim()) return { recognized: false, words: new Set() };
    const words = new Set();
    if (/\bshe\b|\bher\b/.test(text)) {
        words.add("she");
        words.add("her");
        words.add("hers");
        words.add("herself");
    }
    if (/\bhe\b|\bhim\b/.test(text)) {
        words.add("he");
        words.add("him");
        words.add("his");
        words.add("himself");
    }
    if (/\bthey\b|\bthem\b/.test(text)) {
        words.add("they");
        words.add("them");
        words.add("their");
        words.add("theirs");
        words.add("themselves");
    }
    if (/\bit\b|\bits\b/.test(text)) {
        words.add("it");
        words.add("its");
        words.add("itself");
    }
    return { recognized: words.size > 0, words };
}

/**
 * Patterns indicating a death event in prose, used by dead-character-speaks fallback.
 * Each entry is a function that returns a RegExp given a name-alternation pattern.
 * The name pattern should be already escaped and joined with `|`.
 */
export function buildDeathRegexes(nameAlt) {
    const N = `(?:${nameAlt})`;
    return [
        new RegExp(`\\b${N}\\b[^.?!\\n]{0,40}\\b(?:died|is dead|was dead|killed|murdered|slain|fell|perished)\\b`, "i"),
        new RegExp(`\\bkilled\\s+${N}\\b`, "i"),
        new RegExp(`\\bmurdered\\s+${N}\\b`, "i"),
        new RegExp(`\\b${N}'s\\s+(?:body|corpse|funeral|grave|burial|death|remains)\\b`, "i"),
        new RegExp(`\\bburied\\s+${N}\\b`, "i")
    ];
}

/**
 * Dialogue-attribution verbs used by dead-character-speaks. Matches "NAME said",
 * "NAME asked", etc., but only when the name appears as the verb's subject.
 */
export const DIALOGUE_VERBS = Object.freeze([
    "said",
    "asked",
    "replied",
    "whispered",
    "shouted",
    "muttered",
    "answered",
    "called",
    "cried",
    "continued",
    "added",
    "demanded",
    "exclaimed",
    "yelled",
    "murmured",
    "gasped",
    "snapped",
    "barked",
    "growled"
]);
