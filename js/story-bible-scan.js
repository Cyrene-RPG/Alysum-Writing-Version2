/**
 * Manuscript helpers for Story Bible name *suggestions* (algorithmic, not AI).
 * Does not read Firestore bible rows — scans chapter HTML as plain text.
 */

function safeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

/** Mirrors editor stripHtmlToText so the scan does not depend on editor.html. */
export function stripHtmlToText(html) {
    return safeString(html, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(div|p|h1|h2|h3|li|blockquote|ul|ol)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Like stripHtmlToText but keeps newlines after block tags — used for first-person–aware name scan. */
export function stripHtmlForBibleScan(html) {
    return safeString(html, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(div|p|h1|h2|h3|li|blockquote|ul|ol)>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t\f\v]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** First word of candidate (lowercase) — sentence/function words, not people names. */
const FIRST_TOKEN_DENY = new Set(
    [
        "the",
        "a",
        "an",
        "and",
        "but",
        "or",
        "nor",
        "if",
        "when",
        "while",
        "until",
        "before",
        "after",
        "though",
        "although",
        "because",
        "since",
        "unless",
        "where",
        "whether",
        "how",
        "why",
        "what",
        "who",
        "which",
        "here",
        "there",
        "this",
        "that",
        "these",
        "those",
        "they",
        "them",
        "their",
        "theirs",
        "she",
        "her",
        "hers",
        "he",
        "him",
        "his",
        "it",
        "its",
        "we",
        "us",
        "our",
        "ours",
        "you",
        "your",
        "yours",
        "was",
        "were",
        "had",
        "have",
        "has",
        "been",
        "being",
        "are",
        "is",
        "am",
        "would",
        "could",
        "should",
        "might",
        "must",
        "can",
        "will",
        "shall",
        "ought",
        "just",
        "not",
        "only",
        "even",
        "ever",
        "never",
        "still",
        "already",
        "also",
        "too",
        "very",
        "some",
        "any",
        "no",
        "more",
        "most",
        "less",
        "least",
        "then",
        "than",
        "into",
        "onto",
        "from",
        "with",
        "without",
        "about",
        "above",
        "across",
        "along",
        "around",
        "inside",
        "outside",
        "between",
        "beyond",
        "during",
        "within",
        "among",
        "toward",
        "towards",
        "through",
        "over",
        "under",
        "again",
        "once",
        "twice",
        "every",
        "each",
        "either",
        "neither",
        "another",
        "such",
        "other",
        "both",
        "few",
        "many",
        "much",
        "little",
        "own",
        "same",
        "something",
        "nothing",
        "everything",
        "anything",
        "someone",
        "anyone",
        "everyone",
        "nobody",
        "somewhere",
        "anywhere",
        "everywhere",
        "nowhere",
        "perhaps",
        "maybe",
        "rather",
        "quite",
        "almost",
        "nearly",
        "enough",
        "yet",
        "soon",
        "today",
        "tomorrow",
        "yesterday",
        "morning",
        "evening",
        "afternoon",
        "night",
        "year",
        "years",
        "month",
        "months",
        "week",
        "weeks",
        "day",
        "days",
        "time",
        "times",
        "way",
        "ways",
        "thing",
        "things",
        "man",
        "men",
        "woman",
        "women",
        "child",
        "children",
        "people",
        "person",
        "hand",
        "hands",
        "chapter",
        "part",
        "book",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "first",
        "last",
        "next",
        "new",
        "old",
        "long",
        "big",
        "small",
        "good",
        "bad",
        "great",
        "young",
        "like",
        "well",
        "back",
        "down",
        "out",
        "up",
        "in",
        "on",
        "at",
        "as",
        "so",
        "of",
        "to",
        "for",
        "by",
        "my",
        "mine",
        "his",
        "her",
        "its",
        "our",
        "your",
        "their",
        "including",
        "following",
        "according",
        "regarding",
        "concerning",
        "considering",
        "given",
        "seeing",
        "looking",
        "watching",
        "hearing",
        "knowing",
        "thinking",
        "feeling",
        "wanting",
        "trying",
        "hoping",
        "waiting",
        "using",
        "finding",
        "showing",
        "beginning",
        "starting",
        "stopping",
        "ending",
        "turning",
        "walking",
        "running",
        "coming",
        "going",
        "staying",
        "leaving",
        "returning",
        "opening",
        "closing",
        "holding",
        "keeping",
        "bringing",
        "sending",
        "building",
        "remaining",
        "adding",
        "falling",
        "growing",
        "winning",
        "offering",
        "remembering",
        "appearing",
        "buying",
        "serving",
        "dying",
        "sitting",
        "raising",
        "passing",
        "selling",
        "leading",
        "understanding",
        "wearing",
        "speaking",
        "reading",
        "allowing",
        "spending",
        "teaching",
        "changing",
        "living",
        "playing",
        "moving",
        "believing",
        "happening",
        "writing",
        "providing",
        "standing",
        "losing",
        "paying",
        "meeting",
        "continued",
        "learn",
        "change",
        "play",
        "feel",
        "try",
        "leave",
        "call",
        "need",
        "become",
        "put",
        "mean",
        "keep",
        "let",
        "begin",
        "seem",
        "help",
        "show",
        "hear",
        "believe",
        "bring",
        "happen",
        "write",
        "sit",
        "stand",
        "lose",
        "pay",
        "meet",
        "say",
        "tell",
        "go",
        "look",
        "want",
        "use",
        "give",
        "find",
        "make",
        "take",
        "get",
        "set",
        "run",
        "move",
        "live",
        "ask",
        "include",
        "based",
        "assuming",
        "listening",
        "knowing",
        "saying",
        "telling",
        "asking",
        "reading",
        "writing",
        "speaking",
        "listening",
        "watching",
        "waiting",
        "hoping",
        "dreaming",
        "planning",
        "deciding",
        "choosing",
        "refusing",
        "accepting",
        "offering",
        "suggesting",
        "ordering",
        "begging",
        "praying",
        "cursing",
        "laughing",
        "crying",
        "smiling",
        "frowning",
        "nodding",
        "shaking",
        "sighing",
        "gasping",
        "breathing",
        "whispering",
        "shouting",
        "screaming",
        "yelling",
        "muttering",
        "murmuring",
        "repeating",
        "explaining",
        "describing",
        "arguing",
        "discussing",
        "debating",
        "concluding",
        "summarizing",
        "listing",
        "counting",
        "measuring",
        "judging",
        "guessing",
        "estimating",
        "calculating",
        "imagining",
        "pretending",
        "acting",
        "performing",
        "singing",
        "dancing",
        "fighting",
        "killing",
        "saving",
        "helping",
        "hurting",
        "healing",
        "teaching",
        "learning",
        "studying",
        "working",
        "resting",
        "sleeping",
        "waking",
        "remembering",
        "forgetting",
        "recalling",
        "reminding",
        "warning",
        "threatening",
        "promising",
        "swearing",
        "lying",
        "joking",
        "teasing",
        "flirting",
        "kissing",
        "hugging",
        "touching",
        "pushing",
        "pulling",
        "throwing",
        "catching",
        "hitting",
        "missing",
        "breaking",
        "fixing",
        "destroying",
        "creating",
        "arriving",
        "departing",
        "entering",
        "exiting",
        "climbing",
        "falling",
        "jumping",
        "flying",
        "swimming",
        "sinking",
        "floating",
        "sliding",
        "rolling",
        "spinning",
        "twisting",
        "bending",
        "stretching",
        "shrinking",
        "improving",
        "worsening",
        "remaining",
        "becoming",
        "seeming",
        "appearing",
        "disappearing",
        "vanishing",
        "emerging",
        "resulting",
        "joining",
        "separating",
        "dividing",
        "combining",
        "mixing",
        "matching",
        "fitting",
        "belonging",
        "owning",
        "seeking",
        "searching",
        "staring",
        "glancing",
        "peering",
        "observing",
        "noticing",
        "witnessing",
        "experiencing",
        "suffering",
        "enjoying",
        "enduring",
        "surviving",
        "existing",
        "being",
        "doing",
        "having",
        "getting",
        "making",
        "letting",
        "seeing",
        "seemed",
        "said",
        "told",
        "asked",
        "went",
        "came",
        "looked",
        "wanted",
        "found",
        "gave",
        "felt",
        "tried",
        "left",
        "called",
        "needed",
        "became",
        "kept",
        "began",
        "helped",
        "showed",
        "heard",
        "moved",
        "believed",
        "brought",
        "happened",
        "wrote",
        "stood",
        "lost",
        "paid",
        "met",
        "knew",
        "thought",
        "took",
        "put",
        "set",
        "ran",
        "sat",
        "lay",
        "led",
        "read",
        "ate",
        "done",
        "gone",
        "been",
        "being",
        "having",
        "doing",
        "saying",
        "going",
        "getting",
        "making",
        "knowing",
        "thinking",
        "seeing",
        "coming",
        "taking",
        "giving",
        "working",
        "calling",
        "trying",
        "asking",
        "needing",
        "feeling",
        "becoming",
        "leaving",
        "putting",
        "meaning",
        "keeping",
        "letting",
        "beginning",
        "seeming",
        "helping",
        "showing",
        "hearing",
        "playing",
        "running",
        "moving",
        "believing",
        "bringing",
        "happening",
        "writing",
        "sitting",
        "standing",
        "losing",
        "paying",
        "meeting",
        "including",
        "continuing",
        "learning",
        "changing",
        "living",
        "playing",
        "believing",
        "bringing",
        "happening",
        "choosing",
        "wondering",
        "realized",
        "noticed",
        "decided",
        "replied",
        "answered",
        "continued",
        "added",
        "explained",
        "muttered",
        "whispered",
        "shouted",
        "screamed",
        "sighed",
        "nodded",
        "shook",
        "glanced",
        "stared",
        "watched",
        "listened",
        "followed",
        "reached",
        "pulled",
        "pushed",
        "picked",
        "dropped",
        "threw",
        "caught",
        "missed",
        "broke",
        "fixed",
        "built",
        "destroyed",
        "created",
        "returned",
        "arrived",
        "entered",
        "exited",
        "climbed",
        "fell",
        "jumped",
        "flew",
        "swam",
        "sank",
        "floated",
        "slid",
        "rolled",
        "spun",
        "twisted",
        "bent",
        "stretched",
        "grew",
        "shrank",
        "improved",
        "worsened",
        "changed",
        "remained",
        "disappeared",
        "vanished",
        "emerged",
        "joined",
        "separated",
        "divided",
        "combined",
        "mixed",
        "matched",
        "fitted",
        "belonged",
        "owned",
        "sought",
        "searched",
        "observed",
        "witnessed",
        "experienced",
        "suffered",
        "enjoyed",
        "endured",
        "survived",
        "died",
        "lived",
        "breathed",
        "existed"
    ].map(w => w.toLowerCase())
);

/** True if the period at dotIndex ends a common honorific (so the following capital is not a new sentence). */
function isAbbreviationPeriod(dotIndex, s) {
    const frag = s.slice(Math.max(0, dotIndex - 4), dotIndex + 1);
    return /\b(?:Mrs|Mr|Ms|Dr)\.$/i.test(frag);
}

/** After . ! ? or newline (whitespace skipped) — capital here is often generic narration in first person. */
function isCapitalAfterHardSentenceBreak(index, s) {
    if (index <= 0) return true;
    let j = index - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;
    if (j < 0) return true;
    const c = s[j];
    if (c === "\n" || c === "!" || c === "?") return true;
    if (c === ".") {
        if (isAbbreviationPeriod(j, s)) return false;
        return true;
    }
    return false;
}

/** said Name, told Sarah, met Kai — strong signal in first-person. */
function extractAttributionNames(s) {
    const re =
        /\b(?:said|says|say|told|tell|tells|asks?|asked|called|calls?|replied|answered|muttered|mutters|whispered|whispers|shouted|shouts|yelled|yells|texted|emailed|met|introduced|mentions?|mentioned|wrote|texts)\s+([A-Z][a-z]{2,})\b/g;
    const names = [];
    let m;
    while ((m = re.exec(s)) !== null) {
        names.push(m[1].trim());
    }
    return names;
}

/** Mr. Smith, Dr. Lee */
function extractTitleNames(s) {
    const re = /\b(?:Mr|Mrs|Ms|Dr)\.\s+([A-Z][a-z]{2,})\b/g;
    const names = [];
    let m;
    while ((m = re.exec(s)) !== null) {
        names.push(m[1].trim());
    }
    return names;
}

const PHRASE_DENY = new Set(
    [
        "new york",
        "los angeles",
        "san francisco",
        "united states",
        "united kingdom",
        "north america",
        "south america",
        "middle east",
        "new england",
        "new jersey",
        "new mexico",
        "new hampshire",
        "new orleans",
        "new zealand",
        "south africa",
        "north carolina",
        "south carolina",
        "west virginia",
        "great britain",
        "middle ages",
        "dark ages",
        "ice age",
        "white house",
        "civil war",
        "world war",
        "prime minister",
        "vice president",
        "high school",
        "middle school",
        "public school",
        "private school",
        "christmas eve",
        "new year",
        "good morning",
        "good night",
        "good afternoon",
        "good evening",
        "thank you",
        "you know"
    ]
);

/**
 * @param {string} text — plain text
 * @param {{
 *   minOccurrences?: number,
 *   minOccurrencesIfOnlyAfterBreak?: number,
 *   firstPerson?: boolean
 * }} [opts]
 * @returns {{ name: string, occurrences: number }[]}
 */
export function extractNameCandidatesFromPlainText(text, opts = {}) {
    const minOcc = typeof opts.minOccurrences === "number" && opts.minOccurrences > 0 ? opts.minOccurrences : 2;
    const minIfOnlyBreak =
        typeof opts.minOccurrencesIfOnlyAfterBreak === "number" && opts.minOccurrencesIfOnlyAfterBreak > 0
            ? opts.minOccurrencesIfOnlyAfterBreak
            : 4;
    const firstPerson = opts.firstPerson !== false;

    /** Collapse whitespace but keep newlines for sentence-break detection. */
    const source = safeString(text, "")
        .replace(/[ \t\r\f\v]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (!source) return [];

    const capRe = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g;

    /** @type {Map<string, { name: string, n: number, mid: number }>} */
    const map = new Map();

    function bumpPhrase(phrase, { countAsMid }) {
        const p = phrase.trim();
        if (p.length < 3) return;
        const first = p.split(/\s+/)[0].toLowerCase();
        if (FIRST_TOKEN_DENY.has(first)) return;
        const key = p.toLowerCase();
        if (PHRASE_DENY.has(key)) return;

        let row = map.get(key);
        if (!row) {
            row = { name: p, n: 0, mid: 0 };
            map.set(key, row);
        }
        row.n += 1;
        if (p.length > row.name.length) row.name = p;
        if (countAsMid) row.mid += 1;
    }

    /** Extra signal without double-counting occurrences already found by capRe on full text. */
    function boostMidOnly(phrase) {
        const p = phrase.trim();
        if (p.length < 3) return;
        const first = p.split(/\s+/)[0].toLowerCase();
        if (FIRST_TOKEN_DENY.has(first)) return;
        const key = p.toLowerCase();
        if (PHRASE_DENY.has(key)) return;
        const row = map.get(key);
        if (row) row.mid += 1;
    }

    capRe.lastIndex = 0;
    let m;
    while ((m = capRe.exec(source)) !== null) {
        const phrase = m[1].trim();
        const atBreak = isCapitalAfterHardSentenceBreak(m.index, source);
        if (firstPerson) bumpPhrase(phrase, { countAsMid: !atBreak });
        else bumpPhrase(phrase, { countAsMid: true });
    }

    if (firstPerson) {
        for (const n of extractAttributionNames(source)) boostMidOnly(n);
        for (const n of extractTitleNames(source)) boostMidOnly(n);
    }

    return [...map.values()]
        .filter(x => {
            if (x.n < minOcc) return false;
            if (!firstPerson) return true;
            /** Kept if it ever appears mid-narrative / dialogue / attribution, or repeats often enough while only after hard breaks. */
            if (x.mid >= 1) return true;
            return x.n >= minIfOnlyBreak;
        })
        .sort((a, b) => b.n - a.n)
        .map(x => ({ name: x.name, occurrences: x.n }));
}

/**
 * @param {{ name: string, occurrences: number }[]} candidates
 * @param {Array<{ name: string, aliases?: string[] }>} characters
 */
export function subtractBibleNames(candidates, characters) {
    const known = new Set();
    for (const c of characters) {
        const n = (c.name || "").trim().toLowerCase();
        if (n) known.add(n);
        for (const a of c.aliases || []) {
            const t = (a || "").trim().toLowerCase();
            if (t) known.add(t);
        }
    }
    return candidates.filter(x => !known.has((x.name || "").trim().toLowerCase()));
}
