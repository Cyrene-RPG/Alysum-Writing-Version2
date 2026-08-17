/**
 * Account username (handle) is unique and separate from Profile Name.
 * Uniqueness is case-insensitive: CoolUser and cooluser are the same name.
 */

export function usernameKey(raw) {
    return String(raw || "")
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
}

export function formatUsernameError(error) {
    const text = String(error?.message || error || "");
    const lower = text.toLowerCase();
    if (lower.includes("duplicate") || lower.includes("unique") || error?.code === "23505") {
        return "That username is already taken. Choose another before locking it in.";
    }
    return text || "Could not check username.";
}

export async function usernameAlreadyTaken(supabase, username, userId) {
    const key = usernameKey(username);
    if (!key) return false;

    const { data, error } = await supabase.from("users").select("id, username").ilike("username", username);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows.some((row) => {
        if (!row?.id || row.id === userId) return false;
        return usernameKey(row.username) === key;
    });
}
