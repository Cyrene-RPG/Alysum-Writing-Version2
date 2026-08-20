/**
 * Leftover test-lobby ids redirect home. No bots, no fake cards.
 */
const STORAGE_KEY = "alysum-ww-demo";
export const DEMO_PREFIX = "demo-ww-";

export function isDemoRoom(id) {
    return String(id || "").startsWith(DEMO_PREFIX);
}

try {
    sessionStorage.removeItem(STORAGE_KEY);
} catch {
    /* ignore */
}
