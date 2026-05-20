/**
 * Profile picture upload (Supabase Storage) and UI helpers.
 */

export const PROFILE_PIC_BUCKET = "profile-pictures";
export const PROFILE_PIC_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PIC_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};

export function profilePicUrlFromUserData(data) {
    return String(data?.profile_pic_url ?? data?.profilePicUrl ?? "").trim();
}

export function profilePicInitialFromLabel(label) {
    const s = String(label ?? "").trim();
    return (s[0] || "A").toUpperCase();
}

/** Append cache-buster when displaying so replacements show immediately. */
export function profilePicDisplayUrl(url, bust) {
    const base = String(url ?? "").trim();
    if (!base) return "";
    if (!bust) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}v=${encodeURIComponent(String(bust))}`;
}

export function profilePicStoragePath(userId, ext = "jpg") {
    const safeExt = String(ext || "jpg")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
        .slice(0, 8);
    return `${userId}/avatar.${safeExt || "jpg"}`;
}

export function extFromMime(mime) {
    return MIME_TO_EXT[String(mime || "").toLowerCase()] || "jpg";
}

export function validateProfilePicFile(file) {
    if (!file || typeof file !== "object") {
        return { ok: false, error: "Choose an image file." };
    }
    const type = String(file.type || "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MIME_TO_EXT, type)) {
        return { ok: false, error: "Use JPG, PNG, WebP, or GIF." };
    }
    if (file.size > PROFILE_PIC_MAX_BYTES) {
        return { ok: false, error: "Image must be 2 MB or smaller." };
    }
    return { ok: true };
}

/**
 * @param {{ imgEl?: HTMLImageElement|null, initialEl?: HTMLElement|null, url?: string, label?: string, bust?: string|number }} opts
 */
export function applyProfilePicDisplay({ imgEl, initialEl, url, label, bust }) {
    const displayUrl = profilePicDisplayUrl(url, bust);
    const initial = profilePicInitialFromLabel(label);

    if (displayUrl && imgEl) {
        imgEl.src = displayUrl;
        imgEl.alt = label ? `${label} profile photo` : "Profile photo";
        imgEl.hidden = false;
        if (initialEl) initialEl.classList.add("is-hidden");
        return;
    }

    if (imgEl) {
        imgEl.hidden = true;
        imgEl.removeAttribute("src");
        imgEl.alt = "";
    }
    if (initialEl) {
        initialEl.textContent = initial;
        initialEl.classList.remove("is-hidden");
    }
}

function storagePathFromPublicUrl(url) {
    const raw = String(url ?? "").trim();
    if (!raw) return "";
    try {
        const u = new URL(raw);
        const marker = `/object/public/${PROFILE_PIC_BUCKET}/`;
        const alt = `/storage/v1/object/public/${PROFILE_PIC_BUCKET}/`;
        let idx = u.pathname.indexOf(marker);
        let prefix = marker;
        if (idx < 0) {
            idx = u.pathname.indexOf(alt);
            prefix = alt;
        }
        if (idx < 0) return "";
        return decodeURIComponent(u.pathname.slice(idx + prefix.length));
    } catch (_) {
        return "";
    }
}

async function deleteStoredProfilePic(supabase, url) {
    const path = storagePathFromPublicUrl(url);
    if (!path) return;
    const { error } = await supabase.storage.from(PROFILE_PIC_BUCKET).remove([path]);
    if (error) console.warn("profile pic storage delete:", error);
}

/**
 * @returns {Promise<{ ok: true, url: string } | { ok: false, error: string }>}
 */
export async function uploadProfilePicture(supabase, userId, file, previousUrl) {
    const check = validateProfilePicFile(file);
    if (!check.ok) return { ok: false, error: check.error };

    const ext = extFromMime(file.type);
    const path = profilePicStoragePath(userId, ext);

    const { error: upErr } = await supabase.storage.from(PROFILE_PIC_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
    });
    if (upErr) {
        return { ok: false, error: upErr.message || "Upload failed." };
    }

    const { data: pub } = supabase.storage.from(PROFILE_PIC_BUCKET).getPublicUrl(path);
    const url = String(pub?.publicUrl ?? "").trim();
    if (!url) return { ok: false, error: "Could not get image URL." };

    const { error: dbErr } = await supabase
        .from("users")
        .update({ profile_pic_url: url })
        .eq("id", userId);
    if (dbErr) {
        return { ok: false, error: dbErr.message || "Could not save profile." };
    }

    const prevPath = storagePathFromPublicUrl(previousUrl);
    if (previousUrl && prevPath && prevPath !== path) {
        await deleteStoredProfilePic(supabase, previousUrl);
    }

    return { ok: true, url };
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function removeProfilePicture(supabase, userId, currentUrl) {
    await deleteStoredProfilePic(supabase, currentUrl);
    const { error } = await supabase.from("users").update({ profile_pic_url: null }).eq("id", userId);
    if (error) return { ok: false, error: error.message || "Could not remove photo." };
    return { ok: true };
}
