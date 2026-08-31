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
        dailyWordGoal: row.daily_word_goal ?? row.dailyWordGoal,
        writingDayTotals: row.writing_day_totals ?? row.writingDayTotals,
        profileImageUrl: row.profile_image_url ?? row.profileImageUrl ?? "",
        bio: row.bio ?? row.about_me ?? "",
        supportLinks: normalizeSupportLinks(row.support_links ?? row.supportLinks),
    };
}

export function aboutMeStorageKey(userId) {
    return `alysum-about-me:${String(userId || "").trim()}`;
}

export function readStoredAboutMe(userId) {
    if (!userId) return "";
    try {
        return String(localStorage.getItem(aboutMeStorageKey(userId)) || "").trim();
    } catch {
        return "";
    }
}

export function writeStoredAboutMe(userId, bio) {
    if (!userId) return;
    try {
        localStorage.setItem(aboutMeStorageKey(userId), String(bio || ""));
    } catch {
        /* ignore */
    }
}

export function supportLinksStorageKey(userId) {
    return `alysum-support-links:${String(userId || "").trim()}`;
}

export function readStoredSupportLinks(userId) {
    if (!userId) return {};
    try {
        const raw = localStorage.getItem(supportLinksStorageKey(userId));
        if (!raw) return {};
        return normalizeSupportLinks(JSON.parse(raw));
    } catch {
        return {};
    }
}

export function writeStoredSupportLinks(userId, links) {
    if (!userId) return;
    try {
        localStorage.setItem(supportLinksStorageKey(userId), JSON.stringify(normalizeSupportLinks(links)));
    } catch {
        /* ignore */
    }
}

export function supportLinksFromSources(row, user) {
    const fromRow = normalizeSupportLinks(row?.support_links ?? row?.supportLinks);
    if (Object.keys(fromRow).length) return fromRow;
    const meta = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
    const fromMeta = normalizeSupportLinks(meta.support_links ?? meta.supportLinks);
    if (Object.keys(fromMeta).length) return fromMeta;
    return readStoredSupportLinks(user?.id);
}

export function aboutMeText(row, user) {
    const fromRow = String(row?.bio ?? row?.about_me ?? row?.data?.bio ?? "").trim();
    if (fromRow) return fromRow;
    const meta = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
    const fromMeta = String(meta.bio ?? meta.about ?? "").trim();
    if (fromMeta) return fromMeta;
    return readStoredAboutMe(user?.id);
}

export function showMsg(el, text, ok) {
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.remove("err", "ok", "visible");
    el.classList.add(ok ? "ok" : "err");
    if (el.classList.contains("save-prompt")) {
        el.style.display = "inline";
        return;
    }
    el.classList.add("visible");
    el.style.display = "inline-block";
}

export function hideMsg(el) {
    if (!el) return;
    el.classList.remove("visible", "err", "ok");
    el.textContent = "";
    el.style.display = "";
}

export function normalizeDisplayName(raw) {
    const s = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    if (s.length > 40) return s.slice(0, 40);
    return s;
}
