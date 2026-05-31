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

/** Words that look capitalized in prose but are almost never character names. */
const NON_NAME_DENY = new Set(
    [
        "normally", "usually", "suddenly", "finally", "actually", "apparently", "obviously",
        "probably", "possibly", "eventually", "immediately", "recently", "currently", "previously",
        "originally", "initially", "ultimately", "generally", "specifically", "especially",
        "particularly", "simply", "merely", "mostly", "partly", "fully", "hardly", "barely",
        "nearly", "almost", "exactly", "precisely", "roughly", "approximately", "supposedly",
        "allegedly", "reportedly", "presumably", "hopefully", "thankfully", "unfortunately",
        "interestingly", "surprisingly", "unsurprisingly", "ironically", "technically",
        "honestly", "frankly", "seriously", "literally", "basically", "essentially",
        "definitely", "certainly", "totally", "completely", "absolutely", "entirely",
        "instead", "however", "therefore", "otherwise", "anyway", "anyways", "besides",
        "meanwhile", "afterward", "afterwards", "regardless", "nevertheless", "nonetheless",
        "furthermore", "moreover", "otherwise", "somehow", "somewhat", "somewhere",
        "everywhere", "anywhere", "nowhere", "everyone", "someone", "anyone", "nobody",
        "something", "anything", "everything", "nothing", "another", "others", "either",
        "neither", "perhaps", "maybe", "please", "thanks", "sorry", "okay", "alright",
        "yeah", "yep", "yup", "nah", "nope", "huh", "hey", "wow", "whoa", "gosh", "gee",
        "fuck", "fucking", "fucked", "shit", "shitty", "damn", "damned", "hell", "ass",
        "bitch", "bastard", "crap", "piss", "pissed", "bloody", "bloody", "christ", "god",
        "jesus", "lord", "dear", "sweet", "poor", "dear", "old", "young", "little", "big",
        "great", "good", "bad", "best", "worst", "long", "short", "high", "low", "deep",
        "dark", "light", "bright", "cold", "hot", "warm", "cool", "dry", "wet", "empty",
        "full", "open", "closed", "quiet", "loud", "slow", "fast", "quick", "early", "late",
        "wrong", "right", "true", "false", "real", "fake", "whole", "half", "double",
        "single", "triple", "first", "second", "third", "last", "next", "previous", "same",
        "different", "other", "such", "very", "quite", "rather", "too", "so", "just", "only",
        "even", "still", "yet", "already", "again", "once", "twice", "never", "always",
        "often", "sometimes", "rarely", "seldom", "daily", "weekly", "monthly", "yearly",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "january", "february", "march", "april", "may", "june", "july", "august",
        "september", "october", "november", "december", "spring", "summer", "autumn",
        "winter", "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon",
        "evening", "midnight", "noon", "north", "south", "east", "west", "left", "right",
        "chapter", "part", "section", "page", "paragraph", "scene", "act", "book", "story",
        "mother", "father", "brother", "sister", "daughter", "son", "wife", "husband",
        "friend", "friends", "family", "people", "person", "man", "woman", "boy", "girl",
        "kid", "kids", "guy", "guys", "lady", "ladies", "gentleman", "gentlemen", "officer",
        "doctor", "captain", "sergeant", "professor", "president", "minister", "king",
        "queen", "prince", "princess", "lord", "lady", "sir", "madam", "ma'am", "miss",
        "mister", "ms", "mr", "mrs", "dr"
    ].map(w => w.toLowerCase())
);

const STRONG_NAME_KINDS = new Set(["attribution", "possessive", "vocative", "title", "full_name"]);

function isDeniedNamePhrase(phrase) {
    const p = phrase.trim();
    if (p.length < 2) return true;
    const tokens = p.split(/\s+/);
    const first = tokens[0].toLowerCase();
    if (FIRST_TOKEN_DENY.has(first)) return true;
    if (NON_NAME_DENY.has(first)) return true;
    const key = p.toLowerCase();
    if (PHRASE_DENY.has(key)) return true;
    if (tokens.length === 1 && SCAN_SINGLEWORD_EXTRA_DENY.has(key)) return true;
    if (tokens.length === 1 && p.length > 18) return true;
    if (!/^[A-Z]/.test(tokens[0])) return true;
    return false;
}

/**
 * Score likely character names using dialogue tags, possessives, vocatives, and full names —
 * not bare sentence-initial capitals.
 * @param {string} text
 * @returns {Map<string, { name: string, score: number, mentions: number, kinds: Set<string> }>}
 */
function scoreCharacterNamesInText(text) {
    const source = safeString(text, "")
        .replace(/[ \t\r\f\v]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    /** @type {Map<string, { name: string, score: number, mentions: number, kinds: Set<string> }>} */
    const map = new Map();

    function add(rawName, points, kind, mentionInc = 1) {
        const name = rawName.trim();
        if (isDeniedNamePhrase(name)) return;
        const key = name.toLowerCase();
        let row = map.get(key);
        if (!row) row = { name, score: 0, mentions: 0, kinds: new Set() };
        row.score += points;
        row.mentions += mentionInc;
        row.kinds.add(kind);
        if (name.length > row.name.length) row.name = name;
        map.set(key, row);
    }

    const patterns = [
        {
            re: /\b([A-Z][a-z]{2,})\s+(?:said|says|say|replied|replies|answered|answers|asked|asks|whispered|whispers|muttered|mutters|shouted|shouts|yelled|yells|called|calls|texted|texts|emailed|emails|wrote|writes|met|introduced|introduces|mentions|mentioned|told|tells|murmured|murmurs|declared|declares|added|adds|continued|continues|insisted|insists|demanded|demands|pleaded|pleads|warned|warns|promised|promises|admitted|admits|confessed|confesses|explained|explains|remarked|remarks|observed|observes|noted|notes|sighed|sighs|laughed|laughs|chuckled|chuckles|snapped|snaps|growled|growls|hissed|hisses|breathed|breathes|mouthed|mouths)\b/g,
            pick: m => m[1],
            pts: 12,
            kind: "attribution"
        },
        {
            re: /\b(?:said|says|say|replied|replies|answered|answers|asked|asks|whispered|whispers|muttered|mutters|shouted|shouts|yelled|yells|called|calls|texted|texts|emailed|emails|wrote|writes|met|introduced|introduces|mentioned|mentions|told|tells)\s+([A-Z][a-z]{2,})\b/g,
            pick: m => m[1],
            pts: 12,
            kind: "attribution"
        },
        {
            re: /\b([A-Z][a-z]{2,})(?:'|\u2019)s\b/g,
            pick: m => m[1],
            pts: 10,
            kind: "possessive"
        },
        {
            re: /(?:^|[.!?\n]\s*|[\u201c""])\s*([A-Z][a-z]{2,})\s*[,!?]/gm,
            pick: m => m[1],
            pts: 9,
            kind: "vocative"
        },
        {
            re: /\b(?:Mr|Mrs|Ms|Dr)\.\s+([A-Z][a-z]{2,})\b/g,
            pick: m => m[1],
            pts: 11,
            kind: "title"
        },
        {
            re: /\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g,
            pick: m => `${m[1]} ${m[2]}`,
            pts: 14,
            kind: "full_name"
        },
        {
            re: /\b(?:with|and|meet|met|saw|see|sees|seen|called|named|introduced\s+to)\s+([A-Z][a-z]{2,})\b/g,
            pick: m => m[1],
            pts: 6,
            kind: "context"
        }
    ];

    for (const { re, pick, pts, kind } of patterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(source)) !== null) {
            add(pick(m), pts, kind);
        }
    }

    const capRe = /\b([A-Z][a-z]{2,})\b/g;
    capRe.lastIndex = 0;
    let cap;
    while ((cap = capRe.exec(source)) !== null) {
        const word = cap[1];
        const idx = cap.index;
        const firstTok = word.toLowerCase();
        if (isDeniedNamePhrase(word)) continue;
        const key = word.toLowerCase();
        const row = map.get(key);
        if (!row) continue;
        const midClause = isLikelyMidClauseCapital(idx, source, firstTok);
        if (midClause) {
            row.score += 2;
            row.mentions += 1;
            row.kinds.add("mid_clause");
        }
    }

    return map;
}

function passesNameScoreFilter(row, opts) {
    const loose = opts.loose === true;
    const strict = opts.firstPerson === true;
    const minScore = loose ? 5 : strict ? 14 : 10;
    const minMentions = loose ? 2 : strict ? 3 : 2;

    if (row.mentions < minMentions && row.score < minScore + 4) return false;
    if (row.score < minScore) return false;

    const multi = row.name.includes(" ");
    const hasStrong = [...row.kinds].some(k => STRONG_NAME_KINDS.has(k));

    if (multi && hasStrong) return true;
    if (multi && row.score >= 12) return true;
    if (hasStrong) return true;
    if (loose && row.score >= 8 && row.mentions >= 4) return true;
    return false;
}

/**
 * @param {string} text — plain text
 * @param {{
 *   minOccurrences?: number,
 *   firstPerson?: boolean,
 *   balanced?: boolean,
 *   loose?: boolean,
 *   maxResults?: number
 * }} [opts]
 * @returns {Array<{ name: string, occurrences: number, score: number, signals: string[] }>}
 */
export function extractCharacterNameCandidates(text, opts = {}) {
    const maxResults =
        typeof opts.maxResults === "number" && opts.maxResults > 0 ? opts.maxResults : 40;
    const minOcc =
        typeof opts.minOccurrences === "number" && opts.minOccurrences > 0 ? opts.minOccurrences : 2;

    const source = safeString(text, "")
        .replace(/[ \t\r\f\v]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (!source) return [];

    const scored = scoreCharacterNamesInText(source);
    const scanOpts = {
        loose: opts.loose === true || opts.balanced === false,
        firstPerson: opts.firstPerson === true
    };

    return [...scored.values()]
        .filter(row => passesNameScoreFilter(row, scanOpts))
        .filter(row => row.mentions >= minOcc || row.score >= 12)
        .sort((a, b) => b.score - a.score || b.mentions - a.mentions || a.name.localeCompare(b.name))
        .slice(0, maxResults)
        .map(row => ({
            name: row.name,
            occurrences: row.mentions,
            score: row.score,
            signals: [...row.kinds]
        }));
}

/**
 * @param {string} text — plain text
 * @param {{
 *   minOccurrences?: number,
 *   minOccurrencesIfOnlyAfterBreak?: number,
 *   firstPerson?: boolean,
 *   balanced?: boolean,
 *   loose?: boolean,
 *   maxResults?: number
 * }} [opts]
 * @returns {{ name: string, occurrences: number, score?: number, signals?: string[] }[]}
 */
export function extractNameCandidatesFromPlainText(text, opts = {}) {
    return extractCharacterNameCandidates(text, {
        ...opts,
        loose: opts.loose === true || opts.balanced === false
    });
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
