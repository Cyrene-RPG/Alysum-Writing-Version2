import { normalizeSupportLinks } from "@alysum/library/author-profile.js";

const PASSWORD_BLOCKED_OAUTH = new Set(["google", "discord"]);

/** True when the account has no email/password identity (Google/Discord only). */
export function isPasswordChangeBlocked(user) {
    const providers = (user?.identities || [])
        .map((i) => String(i?.provider || "").toLowerCase())
        .filter(Boolean);
    if (providers.length === 0) return false;
    if (providers.includes("email")) return false;
    return providers.every((p) => PASSWORD_BLOCKED_OAUTH.has(p));
}

export function mergeUserRow(row) {
    if (!row || typeof row !== "object") return {};
    return {
        ...row,
        displayName: row.display_name ?? row.displayName,
        accountType: row.account_type ?? row.accountType,
        writingDayTotals: row.writing_day_totals ?? row.writingDayTotals,
        profileImageUrl: row.profile_image_url ?? row.profileImageUrl ?? "",
        bio: row.bio ?? "",
        supportLinks: normalizeSupportLinks(row.support_links ?? row.supportLinks),
    };
}

export function showMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("err", "ok");
    el.classList.add("visible", ok ? "ok" : "err");
}

export function hideMsg(el) {
    if (!el) return;
    el.classList.remove("visible", "err", "ok");
    el.textContent = "";
}

export function normalizeDisplayName(raw) {
    const s = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    if (s.length > 40) return s.slice(0, 40);
    return s;
}
