/**
 * Account intent for Studio, Reading, Artist, or combinations.
 * DB field: users/{uid}.account_type
 * Canonical values: "reader" | "author" | "artist" | "writer_artist" | "both" | "all"
 * Legacy: missing/unknown → "both". "author" is the Writer path (kept for existing SQL gates).
 */
export const UI_MODE_STORAGE_KEY = "alysum-ui-mode";

/** Writer / Studio path (stored as author for legacy SQL + settings). */
export const ACCOUNT_AUTHOR = "author";
export const ACCOUNT_READER = "reader";
/** Writer + Reader (toggle). */
export const ACCOUNT_BOTH = "both";
export const ACCOUNT_ARTIST = "artist";
export const ACCOUNT_WRITER_ARTIST = "writer_artist";
/** Writer + Reader + Artist. */
export const ACCOUNT_ALL = "all";

/** Signup / settings choices in display order. */
export const ACCOUNT_TYPE_OPTIONS = [
    { value: ACCOUNT_READER, label: "Reader" },
    { value: ACCOUNT_AUTHOR, label: "Writer" },
    { value: ACCOUNT_ARTIST, label: "Artist" },
    { value: ACCOUNT_WRITER_ARTIST, label: "Writer / Artist" },
    { value: ACCOUNT_BOTH, label: "Writer / Reader" },
    { value: ACCOUNT_ALL, label: "All" },
];

const VALID_ACCOUNT_TYPES = new Set(ACCOUNT_TYPE_OPTIONS.map((o) => o.value));

/** Logged-in reader hub (Continue + shelf). */
export const READER_HOME_URL = "/reader";

/** Logged-in writer hub (books, stats, prompts). */
export const WRITER_HOME_URL = "settings.html";

/** Reader-dedicated URLs (writer counterparts stay on their own paths). */
export const READER_ROUTES = {
    home: "/reader",
    discover: "/reader/discover",
    updates: "/reader/updates",
    profile: "/reader/profile",
    settings: "/reader/settings",
    inbox: "/reader/inbox",
    connections: "/reader/connections",
};

export function isReaderPath(pathname = typeof location !== "undefined" ? location.pathname : "") {
    const path = String(pathname || "");
    return path === "/reader" || path.startsWith("/reader/");
}

export function isValidAccountType(raw) {
    return VALID_ACCOUNT_TYPES.has(raw);
}

export function normalizeAccountType(raw) {
    if (isValidAccountType(raw)) return raw;
    return ACCOUNT_BOTH;
}

/** True when the account has more than one path (shows the Switch dropdown). */
export function accountSupportsModeToggle(accountType) {
    const t = normalizeAccountType(accountType);
    const paths =
        Number(accountHasWriter(t)) +
        Number(accountHasReader(t)) +
        Number(accountHasArtist(t));
    return paths >= 2;
}

/** Matches SQL public.account_has_writer */
export function accountHasWriter(accountType) {
    const t = normalizeAccountType(accountType);
    return (
        t === ACCOUNT_AUTHOR ||
        t === ACCOUNT_WRITER_ARTIST ||
        t === ACCOUNT_BOTH ||
        t === ACCOUNT_ALL
    );
}

/** Matches SQL public.account_has_reader */
export function accountHasReader(accountType) {
    const t = normalizeAccountType(accountType);
    return t === ACCOUNT_READER || t === ACCOUNT_BOTH || t === ACCOUNT_ALL;
}

/** Matches SQL public.account_has_artist */
export function accountHasArtist(accountType) {
    const t = normalizeAccountType(accountType);
    return (
        t === ACCOUNT_ARTIST ||
        t === ACCOUNT_WRITER_ARTIST ||
        t === ACCOUNT_ALL
    );
}

/** Studio / writer-side home (not reader-only). */
export function accountUsesWriterHome(accountType) {
    const t = normalizeAccountType(accountType);
    return (
        t === ACCOUNT_AUTHOR ||
        t === ACCOUNT_ARTIST ||
        t === ACCOUNT_WRITER_ARTIST
    );
}

export function getUiMode() {
    try {
        const m = sessionStorage.getItem(UI_MODE_STORAGE_KEY);
        if (m === "library" || m === "studio") return m;
    } catch (e) {}
    return "studio";
}

export function setUiMode(mode) {
    try {
        if (mode === "library" || mode === "studio") {
            sessionStorage.setItem(UI_MODE_STORAGE_KEY, mode);
        }
    } catch (e) {}
}

/** Default home after login when ?next= is not set. */
export function homeUrlForUserData(data) {
    const t = normalizeAccountType(data && (data.accountType ?? data.account_type));
    if (t === ACCOUNT_READER) return READER_HOME_URL;
    if (accountUsesWriterHome(t)) return WRITER_HOME_URL;
    /* "library" in session = reading side → profile hub, not the catalog page. */
    return getUiMode() === "library" ? READER_HOME_URL : WRITER_HOME_URL;
}
