/**
 * A tiny record of "who was signed in last" so the app can keep working offline.
 *
 * Supabase persists its session token in localStorage, but an offline reload with
 * an expired token gives us nothing to go on. We stamp the user id/email here on
 * every successful cloud sign-in check; when the network is down we trust it and
 * stay in cloud mode (serving books from the local draft cache) instead of
 * bouncing to the login page. Cleared on logout.
 */

const KEY = "alysum:session-hint";

export function rememberSessionHint(user) {
    const id = user && (user.id || user.sub);
    if (!id) return;
    try {
        localStorage.setItem(KEY, JSON.stringify({
            id: String(id),
            email: user.email ? String(user.email) : null,
            ts: Date.now(),
        }));
    } catch {
        /* ignore quota / disabled storage */
    }
}

export function readSessionHint() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "null");
        if (raw && typeof raw === "object" && raw.id) {
            return { id: String(raw.id), email: raw.email ?? null };
        }
    } catch {
        /* ignore */
    }
    return null;
}

export function clearSessionHint() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}
