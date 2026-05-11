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
        "existed",
        "yeah",
        "yep",
        "yup",
        "nah",
        "nope",
        "huh",
        "hey",
        "wow",
        "whoa",
        "ooh",
        "aah",
        "ugh",
        "gosh",
        "gee",
        "okay",
        "sure",
        "alright",
        "instead",
        "however",
        "therefore",
        "otherwise",
        "anyway",
        "anyways",
        "besides",
        "moreover",
        "furthermore",
        "nevertheless",
        "nonetheless",
        "meanwhile",
        "afterward",
        "afterwards",
        "indeed",
        "plus",
        "minus",
        "regardless",
        "basically",
        "literally",
        "seriously",
        "obviously",
        "clearly",
        "definitely",
        "probably",
        "possibly",
        "certainly",
        "totally",
        "essentially",
        "generally",
        "specifically",
        "especially",
        "particularly",
        "simply",
        "recently",
        "lately",
        "hopefully",
        "thankfully",
        "oddly",
        "interestingly",
        "surprisingly",
        "unsurprisingly",
        "ironically",
        "technically",
        "honestly",
        "frankly",
        "supposedly",
        "apparently",
        "arguably",
        "luckily",
        "unfortunately",
        "fortunately",
        "notably",
        "mostly",
        "partly",
        "fully",
        "please",
        "thanks",
        "sorry",
        "yes",
        "no"
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

/**
 * Words often written as ", Yeah" / "; Anyway" — comma alone is not enough to treat as a mid-clause name.
 * (Lowercase first token of the matched phrase.)
 */
const COMMA_LEAD_DISCOURSE = new Set(
    [
        "yeah",
        "yep",
        "yup",
        "nah",
        "nope",
        "huh",
        "wow",
        "whoa",
        "please",
        "thanks",
        "sorry",
        "sure",
        "okay",
        "yes",
        "no",
        "well",
        "hey",
        "oh",
        "ah",
        "um",
        "uh",
        "er",
        "gosh",
        "gee",
        "anyway",
        "anyways",
        "instead",
        "however",
        "besides",
        "still",
        "yet",
        "again",
        "perhaps",
        "maybe",
        "honestly",
        "seriously",
        "basically",
        "literally",
        "obviously",
        "clearly",
        "probably",
        "definitely",
        "certainly",
        "possibly",
        "totally",
        "especially",
        "generally",
        "usually",
        "sometimes",
        "often",
        "never",
        "always",
        "either",
        "neither"
    ].map(w => w.toLowerCase())
);

/**
 * Capital that follows a lowercase letter, clause punctuation, quotes, or an opener bracket —
 * typical for names in running prose (1st or 3rd person), not bare sentence-initial scenery.
 * @param {string} firstTokenLower — first word of the matched phrase, lowercased
 */
function isLikelyMidClauseCapital(index, s, firstTokenLower) {
    if (index <= 0) return false;
    let j = index - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;
    if (j < 0) return false;
    const c = s[j];
    if (c >= "a" && c <= "z") return true;
    if (",;:!?\u2014\u2013".includes(c)) {
        if (COMMA_LEAD_DISCOURSE.has(firstTokenLower)) return false;
        return true;
    }
    if (c === '"' || c === "\u201c" || c === "\u201d") return true;
    if (c === "'" || c === "\u2019") return true;
    if ("([{\u2018".includes(c)) return true;
    return false;
}

/** Stems of words that appear as Name's / Name's (possessive) — strong person cue. */
function possessiveWordStems(s) {
    const set = new Set();
    const re = /\b([A-Z][a-z]{2,})(?:'|\u2019)s\b/g;
    let m;
    while ((m = re.exec(s)) !== null) set.add(m[1].toLowerCase());
    return set;
}

/**
 * Single-token capitalized hits that are usually scenery / objects / institutions in fiction,
 * not character names (multi-word phrases use PHRASE_DENY / first token).
 */
const SCAN_SINGLEWORD_EXTRA_DENY = new Set(
    [
        "airport", "apartment", "bathroom", "bedroom", "bridge", "building", "car", "ceiling",
        "chair", "church", "city", "classroom", "coffee", "college", "corner", "country", "desk",
        "diner", "door", "downtown", "driveway", "elevator", "evening", "forest", "garage",
        "ground", "hallway", "highway", "hospital", "hotel", "house", "internet", "island",
        "kitchen", "lake", "library", "light", "lights", "lobby", "morning", "mountain",
        "neighborhood", "office", "parking", "path", "phone", "porch", "rain", "restaurant",
        "river", "road", "roof", "room", "school", "shadow", "sidewalk", "sky", "snow",
        "stairs", "station", "steps", "store", "street", "subway", "sun", "sunlight",
        "sunshine", "table", "tea", "town", "traffic", "tree", "trees", "university",
        "wall", "walls", "water", "window", "windows", "world", "yard",
        "breeze", "silence", "darkness", "distance", "ocean", "beach", "sand", "grass",
        "garden", "balcony", "basement", "attic", "closet", "mirror", "screen", "computer",
        "laptop", "message", "email", "news", "paper", "letter", "package", "money",
        "wallet", "keys", "button", "glass", "metal", "wood", "stone", "brick", "smoke",
        "steam", "fog", "mist", "cloud", "moon", "stars", "storm", "thunder", "lightning",
        "sidewalk", "crosswalk", "fence", "gate", "tower", "skyline", "horizon", "valley",
        "canyon", "desert", "jungle", "swamp", "meadow", "plaza", "mall", "market", "bank",
        "cafe", "pub", "bar", "kitchen", "dining", "bed", "couch", "sofa", "shelf", "cabinet",
        "drawer", "closet", "pillow", "blanket", "sheet", "towel", "soap", "shower", "tub",
        "sink", "toilet", "stove", "oven", "fridge", "microwave", "dishwasher", "counter",
        "appliance", "vehicle", "truck", "bus", "train", "plane", "boat", "ship", "bike",
        "bicycle", "motorcycle", "scooter", "subway", "tunnel", "runway", "terminal",
        "lobby", "suite", "hall", "corridor", "stairwell", "escalator", "sidewalk",
        "statue", "monument", "fountain", "billboard", "sign", "signs", "poster", "banner",
        "curtain", "carpet", "rug", "vase", "urn", "crate", "barrel",
        "bucket", "basket", "bin", "canister", "jar", "can", "bottle", "envelope", "folder",
        "notebook", "backpack", "suitcase", "briefcase", "handbag", "purse", "wallet",
        "ticket", "receipt", "invoice", "bookmark", "keyboard", "monitor", "headphones",
        "microphone", "projector", "clipboard", "bulletin", "stapler", "hammer", "nail",
        "screw", "bolt", "socket", "charger", "cable", "cord", "handle", "knob", "hinge",
        "frame", "canvas", "easel", "podium", "lectern", "altar", "aisle", "pew", "bench",
        "boulder", "cliff", "ridge", "plateau", "glacier", "volcano", "tornado", "hurricane",
        "earthquake", "tsunami", "drought", "flood", "wildfire", "embers", "ashes", "cinders",
        "paragraph", "margin", "footnote", "headline", "caption", "logo", "brand", "sticker",
        "decal", "wrapper", "packaging", "carton", "cardboard", "plastic", "polyester", "nylon",
        "ghost", "ghosts", "ghoul", "ghouls", "zombie", "zombies"
    ].map(w => w.toLowerCase())
);

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
        "you know",
        "instead of",
        "because of",
        "out of",
        "inside of",
        "outside of",
        "regardless of",
        "ahead of",
        "in front of",
        "in spite of"
    ]
);

/**
 * @param {string} text — plain text
 * @param {{
 *   minOccurrences?: number,
 *   minOccurrencesIfOnlyAfterBreak?: number,
 *   firstPerson?: boolean,
 *   balanced?: boolean,
 *   maxResults?: number
 * }} [opts]
 * @returns {{ name: string, occurrences: number }[]}
 */
export function extractNameCandidatesFromPlainText(text, opts = {}) {
    const minOcc = typeof opts.minOccurrences === "number" && opts.minOccurrences > 0 ? opts.minOccurrences : 3;
    const minIfOnlyBreak =
        typeof opts.minOccurrencesIfOnlyAfterBreak === "number" && opts.minOccurrencesIfOnlyAfterBreak > 0
            ? opts.minOccurrencesIfOnlyAfterBreak
            : 5;
    const maxResults =
        typeof opts.maxResults === "number" && opts.maxResults > 0 ? opts.maxResults : 50;
    /** Opt-in: extra sentence-break filter for very chatty first-person introspection. */
    const firstPerson = opts.firstPerson === true;
    /** Default on: single-word junk (mostly sentence-initial objects) dropped unless it looks name-like. */
    const balanced = opts.balanced !== false;

    /** Collapse whitespace but keep newlines for sentence-break detection. */
    const source = safeString(text, "")
        .replace(/[ \t\r\f\v]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (!source) return [];

    const capRe = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g;

    /** @type {Map<string, { name: string, n: number, mid: number, midClause: number }>} */
    const map = new Map();

    function bumpPhrase(phrase, { countAsMid, midClauseHit }) {
        const p = phrase.trim();
        if (p.length < 3) return;
        const first = p.split(/\s+/)[0].toLowerCase();
        if (FIRST_TOKEN_DENY.has(first)) return;
        const key = p.toLowerCase();
        if (PHRASE_DENY.has(key)) return;
        if (!p.includes(" ") && SCAN_SINGLEWORD_EXTRA_DENY.has(key)) return;
        if (!p.includes(" ") && p.length > 15) return;

        let row = map.get(key);
        if (!row) {
            row = { name: p, n: 0, mid: 0, midClause: 0 };
            map.set(key, row);
        }
        row.n += 1;
        if (p.length > row.name.length) row.name = p;
        if (countAsMid) row.mid += 1;
        if (midClauseHit) row.midClause += 1;
    }

    /** Extra signal without double-counting occurrences already found by capRe on full text. */
    function boostMidOnly(phrase) {
        const p = phrase.trim();
        if (p.length < 3) return;
        const first = p.split(/\s+/)[0].toLowerCase();
        if (FIRST_TOKEN_DENY.has(first)) return;
        const key = p.toLowerCase();
        if (PHRASE_DENY.has(key)) return;
        if (!p.includes(" ") && SCAN_SINGLEWORD_EXTRA_DENY.has(key)) return;
        if (!p.includes(" ") && p.length > 15) return;
        const row = map.get(key);
        if (row) row.mid += 1;
    }

    let possessiveSet = new Set();
    const speechOrTitleSet = new Set();
    if (balanced || firstPerson) {
        possessiveSet = possessiveWordStems(source);
        for (const n of extractAttributionNames(source)) {
            speechOrTitleSet.add(n.toLowerCase());
            if (firstPerson) boostMidOnly(n);
        }
        for (const n of extractTitleNames(source)) {
            speechOrTitleSet.add(n.toLowerCase());
            if (firstPerson) boostMidOnly(n);
        }
    }

    capRe.lastIndex = 0;
    let m;
    while ((m = capRe.exec(source)) !== null) {
        const phrase = m[1].trim();
        const firstTok = phrase.split(/\s+/)[0].toLowerCase();
        const atBreak = isCapitalAfterHardSentenceBreak(m.index, source);
        const midClauseHit = isLikelyMidClauseCapital(m.index, source, firstTok);
        if (firstPerson) bumpPhrase(phrase, { countAsMid: !atBreak, midClauseHit });
        else bumpPhrase(phrase, { countAsMid: true, midClauseHit });
    }

    return [...map.values()]
        .filter(x => {
            if (x.n < minOcc) return false;
            const key = x.name.toLowerCase();
            const multi = x.name.includes(" ");
            if (firstPerson) {
                if (possessiveSet.has(key)) return true;
                if (speechOrTitleSet.has(key)) return true;
                if (x.mid >= 1) return true;
                return x.n >= minIfOnlyBreak;
            }
            if (balanced && !multi) {
                if (possessiveSet.has(key)) return true;
                if (speechOrTitleSet.has(key)) return true;
                if (x.midClause >= 1) return true;
                /** High repeat count alone (often scenery or repeated nouns); raised to cut generic caps. */
                if (x.n >= 10) return true;
                return false;
            }
            return true;
        })
        .sort((a, b) => b.n - a.n)
        .slice(0, maxResults)
        .map(x => ({ name: x.name, occurrences: x.n }));
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Short excerpts around where a phrase appears — saved into character notes when adding from scan.
 * @param {string} plain
 * @param {string} phrase
 * @param {{ max?: number, radius?: number }} [opts]
 * @returns {string[]}
 */
export function snippetContextsForPhrase(plain, phrase, opts = {}) {
    const max = typeof opts.max === "number" && opts.max > 0 ? opts.max : 4;
    const radius = typeof opts.radius === "number" && opts.radius > 0 ? opts.radius : 100;
    const p = (phrase || "").trim();
    if (!plain || !p) return [];
    const inner = escapeRegExp(p).replace(/\s+/g, "\\s+");
    const re = new RegExp(`(^|[^A-Za-z])(${inner})(?=[^A-Za-z]|$)`, "gi");
    const seen = new Set();
    const out = [];
    let m;
    let guard = 0;
    while ((m = re.exec(plain)) !== null && guard++ < 800) {
        const start = m.index + m[1].length;
        if (seen.has(start)) continue;
        seen.add(start);
        const a = Math.max(0, start - radius);
        const b = Math.min(plain.length, start + m[2].length + radius);
        let chunk = plain.slice(a, b).replace(/[ \t\r\f\v]+/g, " ").trim();
        if (a > 0) chunk = "..." + chunk;
        if (b < plain.length) chunk = chunk + "...";
        out.push(chunk);
        if (out.length >= max) break;
    }
    return out;
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
