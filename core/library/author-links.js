/** Canonical, origin-relative author links. Never infer identity from a display name. */
export function authorProfileUrl({userId = "", username = "", anonymous = false} = {}) {
    if (anonymous) return null;
    const id=String(userId || "").trim(), handle=String(username || "").trim();
    if (id) return "/author?id=" + encodeURIComponent(id);
    return handle ? "/author?u=" + encodeURIComponent(handle) : null;
}
