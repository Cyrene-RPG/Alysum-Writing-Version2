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
    cultivation: tint(50, "#4a6b3a"),
    murim: tint(40, "#6b3a2e"),
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
    "fairy-tale-retelling": g("Fairy Tale / Retelling", C.fantasy),
    grimdark: g("Grimdark", C.fantasy),
    "portal-fantasy": g("Portal Fantasy", C.fantasy),
    "historical-fantasy": g("Historical Fantasy", C.fantasy),
    isekai: g("Isekai", C.isekai),
    "reverse-isekai": g("Reverse Isekai", C.isekai),
    "modern-fantasy": g("Modern Fantasy", C.fantasy),
    wuxia: g("Wuxia", C.cultivation),
    xianxia: g("Xianxia", C.cultivation),
    xuanhuan: g("Xuanhuan", C.cultivation),
    qihuan: g("Qihuan", C.cultivation),
    jianghu: g("Jianghu", C.cultivation),
    cultivation: g("Cultivation", C.cultivation),
    murim: g("Murim", C.murim),
    "muhan-murim": g("Muhan Murim", C.murim),
    system: g("System", C.litrpg),
    litrpg: g("LitRPG", C.litrpg),
    "game-world": g("Game World", C.litrpg),
    regression: g("Regression", C.isekai),
    returner: g("Returner", C.isekai),
    reincarnation: g("Reincarnation", C.isekai),
    transmigration: g("Transmigration", C.isekai),
    "time-loop": g("Time Loop", C.isekai),
    mecha: g("Mecha", C.scifi),
    romcom: g("Romcom", C.romance),
    harem: g("Harem", C.romance),
    "reverse-harem": g("Reverse Harem", C.romance),
    scifi: g("Sci-Fi", C.scifi),
    "soft-sci-fi": g("Soft Sci-Fi", C.scifi),
    cyberpunk: g("Cyberpunk", C.scifi),
    biopunk: g("Biopunk", C.scifi),
    steampunk: g("Steampunk", C.scifi),
    "time-travel": g("Time Travel", C.scifi),
    "alternate-timeline": g("Alternate Timeline", C.scifi),
    dystopian: g("Dystopian", C.scifi),
    utopian: g("Utopian", C.scifi),
    "post-apocalyptic": g("Post-Apocalyptic", C.scifi),
    "military-sci-fi": g("Military Sci-Fi", C.scifi),
    "ai-robotics": g("AI / Robotics", C.scifi),
    romance: g("Romance", C.romance),
    "paranormal-romance": g("Paranormal Romance", C.romance),
    "dark-romance": g("Dark Romance", C.romance),
    "romantic-comedy": g("Romantic Comedy", C.romance),
    "erotic-romance": g("Erotic Romance", C.romance),
    "slow-burn": g("Slow Burn", C.romance),
    "forbidden-love": g("Forbidden Love", C.romance),
    "enemies-to-lovers": g("Enemies to Lovers", C.romance),
    "queer-romance": g("Queer Romance", C.romance),
    "mm-romance": g("MM Romance", C.romance),
    "ff-romance": g("FF Romance", C.romance),
    mystery: g("Mystery", C.mystery),
    thriller: g("Thriller", C.thriller),
    "psychological-thriller": g("Psychological Thriller", C.thriller),
    "spy-thriller": g("Spy Thriller", C.thriller),
    "political-thriller": g("Political Thriller", C.thriller),
    horror: g("Horror", C.horror),
    "psychological-horror": g("Psychological Horror", C.horror),
    "supernatural-horror": g("Supernatural Horror", C.horror),
    "gothic-horror": g("Gothic Horror", C.horror),
    "cosmic-horror": g("Cosmic Horror", C.horror),
    "folk-horror": g("Folk Horror", C.horror),
    "survival-horror": g("Survival Horror", C.horror),
    "paranormal-horror": g("Paranormal Horror", C.horror),
    supernatural: g("Supernatural", C.supernatural),
    action: g("Action", C.action),
    adventure: g("Adventure", C.adventure),
    survival: g("Survival", C.action),
    war: g("War", C.action),
    military: g("Military", C.action),
    "treasure-hunt": g("Treasure Hunt", C.action),
    drama: g("Drama", C.drama),
    "family-drama": g("Family Drama", C.drama),
    tragedy: g("Tragedy", C.tragedy),
    melodrama: g("Melodrama", C.drama),
    slice: g("Slice of Life", C.slice),
    comedy: g("Comedy", C.comedy),
    parody: g("Parody", C.comedy),
    "dark-comedy": g("Dark Comedy", C.comedy),
    "creative-nonfiction": g("Creative Nonfiction", C.narrative),
    "travel-writing": g("Travel Writing", C.narrative),
    historical: g("Historical", C.historical),
    history: g("History", C.informational),
    science: g("Science", C.informational),
    psychology: g("Psychology", C.informational),
    philosophy: g("Philosophy", C.informational),
    "true-crime": g("True Crime", C.informational),
    politics: g("Politics", C.informational),
    economics: g("Economics", C.informational),
    fanfic: g("Fan Fiction", C.fanfic),
    "reader-insert": g("Reader-Insert", C.fanfic),
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

/** Identity / trope labels that used to live on GENRES. Stored as tags. */
const TAG_FROM_GENRE = {
    lgbtq: "LGBTQ+",
    queer: "Queer",
    gay: "Gay",
    lesbian: "Lesbian",
    bisexual: "Bisexual",
    pansexual: "Pansexual",
    asexual: "Asexual",
    aromantic: "Aromantic",
    transgender: "Transgender",
    "non-binary": "Non-Binary",
    genderfluid: "Genderfluid",
    intersex: "Intersex",
    "coming-out": "Coming Out",
    "found-family": "Found Family",
    queerplatonic: "Queerplatonic",
    "gender-exploration": "Gender Exploration",
    "trans-coming-of-age": "Trans Coming of Age",
    "self-insert": "Self-Insert",
    "fix-it-fic": "Fix-It Fic",
    "rewrite-retelling": "Rewrite / Retelling",
    sociology: "Sociology",
    "personal-essay": "Personal Essay",
    biography: "Biography",
    autobiography: "Autobiography",
    "coming-of-age": "Coming of Age",
    humor: "Humor",
    swashbuckler: "Swashbuckler",
    slasher: "Slasher",
    "body-horror": "Body Horror",
    noir: "Noir",
    crime: "Crime",
    detective: "Detective",
    "historical-romance": "Historical Romance",
    "contemporary-romance": "Contemporary Romance",
    "first-contact": "First Contact",
    dieselpunk: "Dieselpunk",
    solarpunk: "Solarpunk",
    "space-opera": "Space Opera",
    "hard-sci-fi": "Hard Sci-Fi",
    "contemporary-fantasy": "Contemporary Fantasy",
    "gaslamp-fantasy": "Gaslamp Fantasy",
    "mythic-fantasy": "Mythic Fantasy",
    crossover: "Crossover",
    "canon-divergence": "Canon Divergence",
    "alternate-universe": "Alternate Universe (AU)",
    "self-help": "Self-Help",
    satire: "Satire",
    "absurdist-comedy": "Absurdist Comedy",
    memoir: "Memoir",
    "legal-thriller": "Legal Thriller",
    "wlw-girls-love": "WLW / Girls' Love",
    "mlm-boys-love": "MLM / Boys' Love",
    "mx-romance": "MX Romance",
    "cozy-mystery": "Cozy Mystery",
    whodunit: "Whodunit",
    "friends-to-lovers": "Friends to Lovers",
    "second-chance-romance": "Second Chance Romance",
};

export function partitionGenresAndTags(genres, tags) {
    const nextGenres = [];
    const nextTags = [];
    const seen = new Set();
    function addTag(label) {
        const value = String(label || "").trim();
        if (!value) return;
        const id = value.toLowerCase();
        if (seen.has(id)) return;
        seen.add(id);
        nextTags.push(value);
    }
    for (const tag of Array.isArray(tags) ? tags : []) addTag(tag);
    for (const item of Array.isArray(genres) ? genres : []) {
        const key = String(item || "").trim();
        if (!key) continue;
        if (TAG_FROM_GENRE[key] || !GENRES[key]) {
            addTag(TAG_FROM_GENRE[key] || key);
            continue;
        }
        if (!nextGenres.includes(key) && nextGenres.length < 3) nextGenres.push(key);
    }
    return { genres: nextGenres, tags: nextTags };
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
