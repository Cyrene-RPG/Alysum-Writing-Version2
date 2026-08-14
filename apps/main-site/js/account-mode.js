/**
 * Account intent: author workspace, reader-focused, or both (toggle + legacy default).
 * Firestore field: users/{uid}.accountType — "author" | "reader" | "both"
 * Missing/unknown values are treated as "both" for existing users.
 */
export const UI_MODE_STORAGE_KEY = "alysum-ui-mode";

export const ACCOUNT_AUTHOR = "author";
export const ACCOUNT_READER = "reader";
export const ACCOUNT_BOTH = "both";

/** Logged-in reader hub (profile + shortcuts). */
export const READER_HOME_URL = "settings.html";

/** Logged-in writer hub (books, stats, prompts). */
export const WRITER_HOME_URL = "settings.html";

export function normalizeAccountType(raw) {
    if (raw === ACCOUNT_AUTHOR || raw === ACCOUNT_READER || raw === ACCOUNT_BOTH) {
        return raw;
    }
    return ACCOUNT_BOTH;
}

/** Both (explicit) and legacy accounts without accountType can switch Studio ↔ Library. */
export function accountSupportsModeToggle(accountType) {
    return normalizeAccountType(accountType) === ACCOUNT_BOTH;
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
    if (t === ACCOUNT_AUTHOR) return WRITER_HOME_URL;
    /* "library" in session = reading side → profile hub, not the catalog page. */
    return getUiMode() === "library" ? READER_HOME_URL : WRITER_HOME_URL;
}
