/**
 * Permanent account handle (Firestore `username`) vs cosmetic display (Firestore `displayName`).
 * Display name is what readers see; handle is fixed after signup (Discord-style).
 */

export function permanentHandleFromUserData(data) {
    const h = String(data?.username ?? "").trim();
    return h || "user";
}

/** Cosmetic display name only (empty if unset). */
export function cosmeticDisplayNameFromUserData(data) {
    return String(data?.displayName ?? data?.display_name ?? "").trim();
}

/** Name shown in UI: cosmetic display if set, otherwise the permanent handle. */
export function publicDisplayNameFromUserData(data) {
    const cosmetic = cosmeticDisplayNameFromUserData(data);
    if (cosmetic) return cosmetic;
    return permanentHandleFromUserData(data);
}
