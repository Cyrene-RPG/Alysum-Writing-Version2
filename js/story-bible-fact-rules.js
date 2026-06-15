/**
 * Deterministic, rule-based character fact extraction.
 * No ML, no NLP APIs, no probabilistic models.
 */

const HAIR_COLORS = ["black", "brown", "blonde", "blond", "red", "auburn", "silver", "gray", "grey", "white", "blue", "green", "pink", "purple"];
const HAIR_TYPES = { curly: "Curly", curls: "Curly", straight: "Straight", wavy: "Wavy", coiled: "Coiled", braided: "Braided", kinky: "Kinky" };
const EYE_COLORS = ["black", "brown", "hazel", "amber", "blonde", "blue", "green", "gray", "grey", "silver", "gold", "violet", "purple", "red"];
const SKIN_TONES = ["pale", "fair", "light", "olive", "tan", "bronze", "brown", "dark", "deep", "ebony", "ivory", "freckled"];
const OCCUPATIONS = ["warrior", "mage", "wizard", "blacksmith", "teacher", "doctor", "detective", "soldier", "captain", "merchant", "farmer", "student", "priest", "thief", "assassin", "guard", "healer", "queen", "king"];
const SPECIES_RACES = ["human", "elf", "dwarf", "orc", "vampire", "werewolf", "fae", "fairy", "demigod", "angel", "demon", "dragonborn", "giant", "witch"];
const TITLES = ["king", "queen", "captain", "doctor", "dr", "sir", "lady", "lord", "prince", "princess", "duke", "duchess", "commander", "chief"];
const RELATIONS = ["sister", "brother", "mother", "father", "friend", "enemy", "wife", "husband"];
const PERSONALITY_TRAITS = ["brave", "kind", "cold", "calm", "cunning", "loyal", "arrogant", "patient", "impulsive", "optimistic", "pessimistic", "stubborn", "gentle", "ruthless", "curious"];
const HEIGHT_WORDS = { tall: "Tall", short: "Short", petite: "Petite", towering: "Towering", lanky: "Lanky" };
const PHYSICAL_FEATURE_PATTERNS = [
    { re: /\bscars?\b/i, value: "Scars" },
    { re: /\btattoos?\b/i, value: "Tattoos" },
    { re: /\bfreckles?\b/i, value: "Freckles" },
    { re: /\bbirthmark\b/i, value: "Birthmark" },
    { re: /\blimp\b/i, value: "Limp" },
    { re: /\bprosthetic (?:arm|leg|hand)\b/i, value: "Prosthetic limb" },
    { re: /\bmissing (?:eye|arm|leg|hand)\b/i, value: "Missing limb/eye" },
    { re: /\beyepatch\b/i, value: "Eyepatch" }
];

function escapeRegExp(s) {
    return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ENTITY_MAP = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'"
};

function decodeEntities(s) {
    return String(s || "").replace(/&([a-z]+);/gi, (full, key) => {
        const lower = String(key || "").toLowerCase();
        return Object.prototype.hasOwnProperty.call(ENTITY_MAP, lower) ? ENTITY_MAP[lower] : full;
    });
}

function normalizeText(s) {
    return decodeEntities(s).replace(/\s+/g, " ").trim();
}

function sentenceChunks(text) {
    const src = String(text || "");
    const out = [];
    const re = /[^.!?\n]+(?:[.!?]+|$)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const raw = m[0];
        const clean = normalizeText(raw);
        if (!clean) continue;
        out.push({ text: clean, start: m.index, end: m.index + raw.length });
    }
    return out;
}

function buildNameRegex(name) {
    const cleaned = normalizeText(name);
    if (!cleaned) return null;
    const parts = cleaned.split(" ").map(escapeRegExp);
    return new RegExp(`\\b${parts.join("\\s+")}\\b`, "gi");
}

function canonicalColor(word) {
    const w = String(word || "").toLowerCase();
    if (w === "blond") return "Blonde";
    if (w === "grey") return "Gray";
    return w ? w[0].toUpperCase() + w.slice(1) : "";
}

function pushFact(bucket, category, value, reason, sourceText, subjectName = "") {
    const val = normalizeText(value);
    if (!val) return;
    bucket.push({
        category,
        value: val,
        confidence_reason: reason,
        source_text: normalizeText(sourceText),
        subject_name: normalizeText(subjectName)
    });
}

function extractFactsFromSentence(sentenceText) {
    const s = normalizeText(sentenceText);
    const lower = s.toLowerCase();
    const out = [];

    const hasHairContext = /\b(hair|curl|curls|braid|braids|locks?|fringe|bangs?)\b/i.test(s);
    for (const color of HAIR_COLORS) {
        if (new RegExp(`\\b${escapeRegExp(color)}\\b`, "i").test(s) && hasHairContext) {
            pushFact(out, "Hair Color", canonicalColor(color), `Matched hair color dictionary word "${color}" with hair context.`, s);
        }
    }
    for (const [word, canonical] of Object.entries(HAIR_TYPES)) {
        if (new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(s) && hasHairContext) {
            pushFact(out, "Hair Type", canonical, `Matched hair type dictionary word "${word}" with hair context.`, s);
        }
    }

    const hasEyeContext = /\b(eyes?|iris|gaze)\b/i.test(s);
    for (const color of EYE_COLORS) {
        if (hasEyeContext && new RegExp(`\\b${escapeRegExp(color)}\\b`, "i").test(s)) {
            pushFact(out, "Eye Color", canonicalColor(color), `Matched eye color dictionary word "${color}" with eye context.`, s);
        }
    }

    const hasSkinContext = /\b(skin|complexion)\b/i.test(s);
    for (const tone of SKIN_TONES) {
        if (hasSkinContext && new RegExp(`\\b${escapeRegExp(tone)}\\b`, "i").test(s)) {
            pushFact(out, "Skin Tone", tone[0].toUpperCase() + tone.slice(1), `Matched skin tone dictionary word "${tone}" with skin context.`, s);
        }
    }

    const feetInches = /\b(\d)\s*'\s*(\d{1,2})\s*(?:"|in)?\b/g;
    let hm;
    while ((hm = feetInches.exec(s)) !== null) {
        pushFact(out, "Height", `${hm[1]}'${hm[2]}"`, "Matched explicit height pattern feet/inches.", s);
    }
    const cm = /\b(\d{2,3})\s*cm\b/gi;
    while ((hm = cm.exec(s)) !== null) {
        pushFact(out, "Height", `${hm[1]} cm`, "Matched explicit height pattern in centimeters.", s);
    }
    for (const [word, canonical] of Object.entries(HEIGHT_WORDS)) {
        if (new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(s)) {
            pushFact(out, "Height", canonical, `Matched descriptive height word "${word}".`, s);
        }
    }

    const agePatterns = [
        { re: /\b(\d{1,3})-year-old\b/gi, reason: "Matched age pattern '#-year-old'." },
        { re: /\baged\s+(\d{1,3})\b/gi, reason: "Matched age pattern 'aged #'. " },
        { re: /\b(\d{1,3})\s+years?\s+old\b/gi, reason: "Matched age pattern '# years old'." }
    ];
    for (const pattern of agePatterns) {
        let m;
        while ((m = pattern.re.exec(s)) !== null) {
            pushFact(out, "Age", m[1], pattern.reason, s);
        }
    }

    for (const occ of OCCUPATIONS) {
        const predRe = new RegExp(`\\b(?:is|was|became|works\\s+as|served\\s+as|serves\\s+as)\\s+(?:an?\\s+)?${escapeRegExp(occ)}\\b`, "i");
        if (predRe.test(s)) {
            pushFact(out, "Occupation", occ[0].toUpperCase() + occ.slice(1), `Matched occupation phrase for "${occ}".`, s);
        }
    }

    for (const species of SPECIES_RACES) {
        const spRe = new RegExp(`\\b(?:is|was|became|born\\s+as)\\s+(?:an?\\s+)?${escapeRegExp(species)}\\b`, "i");
        if (spRe.test(s)) {
            pushFact(out, "Species/Race", species[0].toUpperCase() + species.slice(1), `Matched species/race phrase for "${species}".`, s);
        }
    }

    for (const trait of PERSONALITY_TRAITS) {
        const traitRe = new RegExp(`\\b(?:is|was|seems|appears|remains|stays)\\s+${escapeRegExp(trait)}\\b`, "i");
        if (traitRe.test(s)) {
            pushFact(out, "Personality Traits", trait[0].toUpperCase() + trait.slice(1), `Matched personality trait phrase "${trait}".`, s);
        }
    }

    const titlePrefix = new RegExp(`\\b(${TITLES.map(escapeRegExp).join("|")})\\s+([A-Z][A-Za-z'\\-]{1,})\\b`, "g");
    let tm;
    while ((tm = titlePrefix.exec(s)) !== null) {
        pushFact(out, "Titles", tm[1][0].toUpperCase() + tm[1].slice(1).toLowerCase(), `Matched title prefix "${tm[1]}" before name "${tm[2]}".`, s, tm[2]);
    }
    const titleAppositive = new RegExp(`\\b([A-Z][A-Za-z'\\-]{1,}),\\s+the\\s+(${TITLES.map(escapeRegExp).join("|")})\\b`, "gi");
    while ((tm = titleAppositive.exec(s)) !== null) {
        pushFact(out, "Titles", tm[2][0].toUpperCase() + tm[2].slice(1).toLowerCase(), `Matched appositive title "${tm[2]}".`, s, tm[1]);
    }

    const relSentence = new RegExp(`\\b([A-Z][A-Za-z'\\-]{1,})\\s+(?:is\\s+(?:the\\s+)?)?(${RELATIONS.join("|")})\\s+of\\s+([A-Z][A-Za-z'\\-]{1,})\\b`, "gi");
    let rm;
    while ((rm = relSentence.exec(s)) !== null) {
        const relation = rm[2].toLowerCase();
        pushFact(out, "Relationships", `${relation} of ${rm[3]}`, `Matched relationship pattern '${relation} of'.`, s, rm[1]);
    }
    const relPartial = new RegExp(`\\b(${RELATIONS.join("|")})\\s+of\\s+([A-Z][A-Za-z'\\-]{1,})\\b`, "gi");
    while ((rm = relPartial.exec(s)) !== null) {
        const relation = rm[1].toLowerCase();
        pushFact(out, "Relationships", `${relation} of ${rm[2]}`, `Matched relationship pattern '${relation} of'.`, s);
    }

    for (const feature of PHYSICAL_FEATURE_PATTERNS) {
        if (feature.re.test(s)) {
            pushFact(out, "Physical Features", feature.value, `Matched physical feature pattern "${feature.re}".`, s);
        }
    }

    return out;
}

function dedupeCandidates(candidates) {
    const seen = new Set();
    const out = [];
    for (const row of candidates) {
        const key = `${row.character_name.toLowerCase()}|${row.category.toLowerCase()}|${row.value.toLowerCase()}|${row.source_text.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

const NAME_STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "but",
    "or",
    "he",
    "she",
    "they",
    "his",
    "her",
    "their",
    "him",
    "them",
    "this",
    "that",
    "these",
    "those",
    "there",
    "here",
    "then",
    "chapter",
    "crikey",
    "yes",
    "no",
    "okay",
    "alright",
    "morning",
    "night",
    "afternoon",
    "evening"
]);

function isNameToken(token) {
    const t = String(token || "").trim();
    if (!/^[A-Z][a-z]{2,}$/.test(t)) return false;
    return !NAME_STOPWORDS.has(t.toLowerCase());
}

export function detectNameCandidates(text, knownNames = []) {
    const src = normalizeText(text || "");
    if (!src) return [];

    const known = new Set((Array.isArray(knownNames) ? knownNames : []).map(n => normalizeText(n).toLowerCase()).filter(Boolean));
    const scores = new Map();

    function add(name, points) {
        const key = normalizeText(name).toLowerCase();
        if (!key || known.has(key)) return;
        const prev = scores.get(key) || { name: normalizeText(name), score: 0 };
        prev.score += points;
        if (name.length > prev.name.length) prev.name = normalizeText(name);
        scores.set(key, prev);
    }

    const fullNameRe = /\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g;
    let m;
    while ((m = fullNameRe.exec(src)) !== null) {
        if (!isNameToken(m[1]) || !isNameToken(m[2])) continue;
        add(`${m[1]} ${m[2]}`, 3);
    }

    const singleNameRe = /\b([A-Z][a-z]{2,})\b/g;
    while ((m = singleNameRe.exec(src)) !== null) {
        if (!isNameToken(m[1])) continue;
        add(m[1], 1);
    }

    const attributionRe = /\b(?:said|asked|told|met|called|replied|whispered|shouted)\s+([A-Z][a-z]{2,})\b/g;
    while ((m = attributionRe.exec(src)) !== null) {
        if (!isNameToken(m[1])) continue;
        add(m[1], 3);
    }
    const reverseAttributionRe = /\b([A-Z][a-z]{2,})\s+(?:said|asked|told|replied|whispered|shouted)\b/g;
    while ((m = reverseAttributionRe.exec(src)) !== null) {
        if (!isNameToken(m[1])) continue;
        add(m[1], 3);
    }

    return [...scores.values()]
        .filter(row => row.score >= 1)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 6)
        .map(row => row.name);
}

export function findKnownCharacterMentions(text, characters) {
    const src = String(text || "");
    const mentions = [];
    for (const char of Array.isArray(characters) ? characters : []) {
        const names = [char?.name, ...(Array.isArray(char?.aliases) ? char.aliases : [])]
            .map(normalizeText)
            .filter(Boolean);
        for (const name of names) {
            const re = buildNameRegex(name);
            if (!re) continue;
            let m;
            while ((m = re.exec(src)) !== null) {
                mentions.push({
                    character_name: normalizeText(char.name || name),
                    matched_name: normalizeText(m[0]),
                    start: m.index,
                    end: m.index + m[0].length
                });
            }
        }
    }
    mentions.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    return mentions;
}

export function extractCandidateFactsFromSelection(input) {
    const text = normalizeText(input?.text || "");
    const characters = Array.isArray(input?.characters) ? input.characters : [];
    const defaultCharacterName = normalizeText(input?.defaultCharacterName || "");
    if (!text) return { matchedCharacterNames: [], candidates: [] };

    const mentions = findKnownCharacterMentions(text, characters);
    const matchedCharacterNames = [...new Set(mentions.map(m => m.character_name))];
    const chunks = sentenceChunks(text);
    const candidateRows = [];
    const onlyOneKnown = matchedCharacterNames.length === 1 ? matchedCharacterNames[0] : "";

    for (const chunk of chunks) {
        const sentenceMentions = mentions
            .filter(m => m.start >= chunk.start && m.end <= chunk.end)
            .map(m => m.character_name);
        const active = [...new Set(sentenceMentions)];
        if (!active.length && onlyOneKnown) active.push(onlyOneKnown);
        if (!active.length && defaultCharacterName) active.push(defaultCharacterName);

        const sentenceFacts = extractFactsFromSentence(chunk.text);
        if (!sentenceFacts.length) continue;
        if (!active.length) continue;

        for (const fact of sentenceFacts) {
            if (fact.subject_name) {
                const explicitSubject = active.find(name => name.toLowerCase() === fact.subject_name.toLowerCase());
                if (explicitSubject) {
                    candidateRows.push({
                        character_name: explicitSubject,
                        category: fact.category,
                        value: fact.value,
                        confidence_reason: fact.confidence_reason,
                        source_text: fact.source_text
                    });
                    continue;
                }
            }
            for (const name of active) {
                candidateRows.push({
                    character_name: name,
                    category: fact.category,
                    value: fact.value,
                    confidence_reason: fact.confidence_reason,
                    source_text: fact.source_text
                });
            }
        }
    }

    return {
        matchedCharacterNames,
        candidates: dedupeCandidates(candidateRows)
    };
}
