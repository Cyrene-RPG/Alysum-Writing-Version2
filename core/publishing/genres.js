/**
 * Shared library / publish genre list. Keys are stored on listings.
 * Leaf labels from Alysum-Web, kebab-case keys. Existing keys kept.
 */

function tint(mix, fallback) {
    return `color-mix(in srgb, var(--accent, #7c3aed) ${mix}%, ${fallback})`;
}

const C = {
    fantasy: tint(55, "#3c5b45"),
    isekai: tint(45, "#7b2d2d"),
    litrpg: tint(40, "#a9822c"),
    scifi: tint(50, "#3a4a63"),
    romance: "color-mix(in srgb, var(--pink, #ec4899) 55%, #8c4a56)",
    lgbtq: "color-mix(in srgb, var(--pink, #ec4899) 40%, #5a3d6b)",
    horror: "color-mix(in srgb, var(--alysum-ui-chrome, #141414) 40%, #3e2a38)",
    mystery: tint(40, "#2f4a47"),
    slice: "color-mix(in srgb, var(--gold, #f5d489) 40%, #b4783a)",
    action: tint(35, "#a1512e"),
    drama: "color-mix(in srgb, var(--purple, #7c3aed) 55%, #4b3f63)",
    adventure: tint(35, "#6b7a3e"),
    comedy: "color-mix(in srgb, var(--gold, #f5d489) 45%, #c08a34)",
    thriller: tint(30, "#5c2a2a"),
    historical: "color-mix(in srgb, var(--gold, #f5d489) 30%, #705c3a)",
    supernatural: tint(50, "#2e3b57"),
    tragedy: "color-mix(in srgb, var(--purple, #7c3aed) 40%, #3a2e3b)",
    narrative: "color-mix(in srgb, var(--gold, #f5d489) 28%, #6a5a3a)",
    informational: tint(30, "#4a5568"),
    fanfic: tint(45, "#7b2d2d"),
};

function g(label, color) {
    return { label, color };
}

export const GENRES = {
    fantasy: g("Fantasy", C.fantasy),
    "high-fantasy": g("High Fantasy", C.fantasy),
    "low-fantasy": g("Low Fantasy", C.fantasy),
    "dark-fantasy": g("Dark Fantasy", C.fantasy),
    "epic-fantasy": g("Epic Fantasy", C.fantasy),
    "sword-and-sorcery": g("Sword and Sorcery", C.fantasy),
    "urban-fantasy": g("Urban Fantasy", C.fantasy),
    "mythic-fantasy": g("Mythic Fantasy", C.fantasy),
    "fairy-tale-retelling": g("Fairy Tale / Retelling", C.fantasy),
    grimdark: g("Grimdark", C.fantasy),
    "gaslamp-fantasy": g("Gaslamp Fantasy", C.fantasy),
    "portal-fantasy": g("Portal Fantasy", C.fantasy),
    "historical-fantasy": g("Historical Fantasy", C.fantasy),
    "contemporary-fantasy": g("Contemporary Fantasy", C.fantasy),
    isekai: g("Isekai", C.isekai),
    litrpg: g("LitRPG", C.litrpg),
    scifi: g("Sci-Fi", C.scifi),
    "hard-sci-fi": g("Hard Sci-Fi", C.scifi),
    "soft-sci-fi": g("Soft Sci-Fi", C.scifi),
    "space-opera": g("Space Opera", C.scifi),
    cyberpunk: g("Cyberpunk", C.scifi),
    biopunk: g("Biopunk", C.scifi),
    steampunk: g("Steampunk", C.scifi),
    dieselpunk: g("Dieselpunk", C.scifi),
    solarpunk: g("Solarpunk", C.scifi),
    "time-travel": g("Time Travel", C.scifi),
    "alternate-timeline": g("Alternate Timeline", C.scifi),
    dystopian: g("Dystopian", C.scifi),
    utopian: g("Utopian", C.scifi),
    "post-apocalyptic": g("Post-Apocalyptic", C.scifi),
    "military-sci-fi": g("Military Sci-Fi", C.scifi),
    "first-contact": g("First Contact", C.scifi),
    "ai-robotics": g("AI / Robotics", C.scifi),
    romance: g("Romance", C.romance),
    "contemporary-romance": g("Contemporary Romance", C.romance),
    "historical-romance": g("Historical Romance", C.romance),
    "paranormal-romance": g("Paranormal Romance", C.romance),
    "dark-romance": g("Dark Romance", C.romance),
    "romantic-comedy": g("Romantic Comedy", C.romance),
    "erotic-romance": g("Erotic Romance", C.romance),
    "slow-burn": g("Slow Burn", C.romance),
    "second-chance-romance": g("Second Chance Romance", C.romance),
    "forbidden-love": g("Forbidden Love", C.romance),
    "friends-to-lovers": g("Friends to Lovers", C.romance),
    "enemies-to-lovers": g("Enemies to Lovers", C.romance),
    "queer-romance": g("Queer Romance", C.romance),
    "mm-romance": g("MM Romance", C.romance),
    "ff-romance": g("FF Romance", C.romance),
    "mx-romance": g("MX Romance", C.romance),
    lgbtq: g("LGBTQ+", C.lgbtq),
    queer: g("Queer", C.lgbtq),
    gay: g("Gay", C.lgbtq),
    lesbian: g("Lesbian", C.lgbtq),
    bisexual: g("Bisexual", C.lgbtq),
    pansexual: g("Pansexual", C.lgbtq),
    asexual: g("Asexual", C.lgbtq),
    aromantic: g("Aromantic", C.lgbtq),
    transgender: g("Transgender", C.lgbtq),
    "non-binary": g("Non-Binary", C.lgbtq),
    genderfluid: g("Genderfluid", C.lgbtq),
    intersex: g("Intersex", C.lgbtq),
    "mlm-boys-love": g("MLM / Boys' Love", C.lgbtq),
    "wlw-girls-love": g("WLW / Girls' Love", C.lgbtq),
    "coming-out": g("Coming Out", C.lgbtq),
    "found-family": g("Found Family", C.lgbtq),
    queerplatonic: g("Queerplatonic", C.lgbtq),
    "gender-exploration": g("Gender Exploration", C.lgbtq),
    "trans-coming-of-age": g("Trans Coming of Age", C.lgbtq),
    mystery: g("Mystery", C.mystery),
    detective: g("Detective", C.mystery),
    crime: g("Crime", C.mystery),
    noir: g("Noir", C.mystery),
    "cozy-mystery": g("Cozy Mystery", C.mystery),
    whodunit: g("Whodunit", C.mystery),
    thriller: g("Thriller", C.thriller),
    "psychological-thriller": g("Psychological Thriller", C.thriller),
    "legal-thriller": g("Legal Thriller", C.thriller),
    "spy-thriller": g("Spy Thriller", C.thriller),
    "political-thriller": g("Political Thriller", C.thriller),
    horror: g("Horror", C.horror),
    "psychological-horror": g("Psychological Horror", C.horror),
    "supernatural-horror": g("Supernatural Horror", C.horror),
    "gothic-horror": g("Gothic Horror", C.horror),
    "body-horror": g("Body Horror", C.horror),
    "cosmic-horror": g("Cosmic Horror", C.horror),
    "folk-horror": g("Folk Horror", C.horror),
    slasher: g("Slasher", C.horror),
    "survival-horror": g("Survival Horror", C.horror),
    "paranormal-horror": g("Paranormal Horror", C.horror),
    supernatural: g("Supernatural", C.supernatural),
    action: g("Action", C.action),
    adventure: g("Adventure", C.adventure),
    survival: g("Survival", C.action),
    war: g("War", C.action),
    military: g("Military", C.action),
    swashbuckler: g("Swashbuckler", C.action),
    "treasure-hunt": g("Treasure Hunt", C.action),
    drama: g("Drama", C.drama),
    "family-drama": g("Family Drama", C.drama),
    tragedy: g("Tragedy", C.tragedy),
    melodrama: g("Melodrama", C.drama),
    "coming-of-age": g("Coming of Age", C.drama),
    slice: g("Slice of Life", C.slice),
    comedy: g("Comedy", C.comedy),
    humor: g("Humor", C.comedy),
    satire: g("Satire", C.comedy),
    parody: g("Parody", C.comedy),
    "dark-comedy": g("Dark Comedy", C.comedy),
    "absurdist-comedy": g("Absurdist Comedy", C.comedy),
    memoir: g("Memoir", C.narrative),
    autobiography: g("Autobiography", C.narrative),
    biography: g("Biography", C.narrative),
    "personal-essay": g("Personal Essay", C.narrative),
    "creative-nonfiction": g("Creative Nonfiction", C.narrative),
    "travel-writing": g("Travel Writing", C.narrative),
    historical: g("Historical", C.historical),
    history: g("History", C.informational),
    science: g("Science", C.informational),
    psychology: g("Psychology", C.informational),
    philosophy: g("Philosophy", C.informational),
    "self-help": g("Self-Help", C.informational),
    "true-crime": g("True Crime", C.informational),
    politics: g("Politics", C.informational),
    economics: g("Economics", C.informational),
    sociology: g("Sociology", C.informational),
    "alternate-universe": g("Alternate Universe (AU)", C.fanfic),
    "canon-divergence": g("Canon Divergence", C.fanfic),
    "fix-it-fic": g("Fix-It Fic", C.fanfic),
    crossover: g("Crossover", C.fanfic),
    "self-insert": g("Self-Insert", C.fanfic),
    "reader-insert": g("Reader-Insert", C.fanfic),
    "rewrite-retelling": g("Rewrite / Retelling", C.fanfic),
};

/** @deprecated All keys live on GENRES. Kept so older pickers still import it. */
export const EXTRA_GENRES = {};

export function genreDef(key) {
    return GENRES[key] || null;
}

export function genreLabel(key) {
    return genreDef(key)?.label || String(key || "").trim() || "Genre";
}

export function genreColor(key) {
    return genreDef(key)?.color || "var(--accent, #7c3aed)";
}

export function allGenreKeys() {
    return Object.keys(GENRES);
}

export function matchingGenreKeys(query) {
    const q = String(query || "").trim().toLowerCase();
    return allGenreKeys().filter((key) => {
        if (!q) return true;
        return genreLabel(key).toLowerCase().includes(q) || key.toLowerCase().includes(q);
    });
}

export function toggleGenreSelection(selected, key, max = 3) {
    const next = [...(Array.isArray(selected) ? selected : [])];
    const want = String(key || "").trim();
    if (!want) return next;
    const ix = next.indexOf(want);
    if (ix >= 0) next.splice(ix, 1);
    else if (next.length < max) next.push(want);
    return next;
}

/** Up to 3 keys: main, secondary, tertiary. Accepts genres[] or a single genre. */
export function normalizeGenreList(source) {
    const raw = source && typeof source === "object" && !Array.isArray(source) ? source : { genre: source };
    const fromArray = Array.isArray(raw.genres) ? raw.genres : [];
    const single = String(raw.genre || "").trim();
    const keys = [];
    for (const item of fromArray.length ? fromArray : (single ? [single] : [])) {
        const key = String(item || "").trim();
        if (key && !keys.includes(key) && keys.length < 3) keys.push(key);
    }
    return keys;
}
