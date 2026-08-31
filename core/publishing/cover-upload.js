/**
 * Public book covers. Bucket: book-covers. Paths: {bookId}/{uuid}.{ext}
 */

const BUCKET = "book-covers";
const MAX_COVER_BYTES = 8 * 1024 * 1024;

export function safeCoverUrl(url) {
    let value = String(url || "").trim();
    if (!value || /['"\\]/.test(value)) return "";
    if (value.startsWith("//")) value = `https:${value}`;
    if (/^http:\/\//i.test(value)) value = `https://${value.slice("http://".length)}`;
    if (!/^https:\/\//i.test(value)) {
        if (!/^[A-Za-z0-9._/-]+$/.test(value)) return "";
        value = `https://jrfxgpkpbacajhcwimgz.supabase.co/storage/v1/object/public/${BUCKET}/${value.replace(/^\/+/, "")}`;
    }
    return value;
}

export function normalizeCrop(raw) {
    if (!raw || typeof raw !== "object") return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const w = Number(raw.w);
    const h = Number(raw.h);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
    const nx = Math.min(0.98, Math.max(0, x));
    const ny = Math.min(0.98, Math.max(0, y));
    const nw = Math.min(1 - nx, Math.max(0.04, w));
    const nh = Math.min(1 - ny, Math.max(0.04, h));
    return { x: nx, y: ny, w: nw, h: nh };
}

function bandInImage(visualAspect, widthFrac, imgW, imgH) {
    const imgAspect = imgW > 0 && imgH > 0 ? imgW / imgH : 1;
    let w = Math.min(1, widthFrac);
    let h = (w * imgAspect) / visualAspect;
    if (h > 1) {
        h = 1;
        w = Math.min(1, visualAspect / imgAspect);
    }
    return {
        x: (1 - w) / 2,
        y: Math.max(0, (1 - h) / 2),
        w,
        h,
    };
}

export function defaultCrops(imgW = 0, imgH = 0) {
    return {
        coverCrop: { x: 0, y: 0, w: 1, h: 1 },
        coverMini: bandInImage(2.5, 0.7, imgW, imgH),
        coverWide: bandInImage(2.5, 1, imgW, imgH),
    };
}

export function cropFrameStyle(rect) {
    const crop = normalizeCrop(rect);
    if (!crop) return "";
    return [
        "position:absolute",
        "max-width:none",
        "right:auto",
        "bottom:auto",
        "object-fit:fill",
        `width:${100 / crop.w}%`,
        `height:${100 / crop.h}%`,
        `left:${(-100 * crop.x) / crop.w}%`,
        `top:${(-100 * crop.y) / crop.h}%`,
    ].join(";");
}

const COVER_CACHE = "alysum:library:covers";
const memory = new Map();

/** Same-session src: blob URL after cache, otherwise the remote URL. */
export function peekCoverSrc(url) {
    const safe = safeCoverUrl(url);
    if (!safe) return "";
    return memory.get(safe) || safe;
}

export async function rememberCover(url) {
    const safe = safeCoverUrl(url);
    if (!safe) return "";
    if (memory.has(safe)) return memory.get(safe);
    try {
        if (typeof caches === "undefined") {
            memory.set(safe, safe);
            return safe;
        }
        const cache = await caches.open(COVER_CACHE);
        let res = await cache.match(safe);
        if (!res) {
            res = await fetch(safe, { mode: "cors", credentials: "omit", cache: "force-cache" });
            if (!res.ok) {
                memory.set(safe, safe);
                return safe;
            }
            await cache.put(safe, res.clone());
        }
        const blob = await res.blob();
        if (!String(blob.type || "").startsWith("image/")) {
            memory.set(safe, safe);
            return safe;
        }
        const objectUrl = URL.createObjectURL(blob);
        memory.set(safe, objectUrl);
        return objectUrl;
    } catch {
        memory.set(safe, safe);
        return safe;
    }
}

export function rememberCovers(urls) {
    const unique = [...new Set((urls || []).map(safeCoverUrl).filter(Boolean))];
    return Promise.all(unique.map((src) => rememberCover(src)));
}

const FALLBACK_BUCKET = "book-content-images";
const DRAFT_CACHE = "alysum:covers:draft";
const draftMemory = new Map();
const draftFiles = new Map();

function assertCoverFile(file) {
    if (!file) throw new Error("Choose an image.");
    if (file.type && !file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > MAX_COVER_BYTES) throw new Error("Cover must be 8 MB or smaller.");
}

function draftCacheUrl(bookId) {
    return `https://alysum.invalid/covers/draft/${encodeURIComponent(bookId)}`;
}

function revokeDraftSrc(bookId) {
    const prev = draftMemory.get(bookId);
    if (prev) URL.revokeObjectURL(prev);
    draftMemory.delete(bookId);
}

export async function saveDraftCover(bookId, file) {
    const id = String(bookId || "").trim();
    if (!id) throw new Error("Missing book.");
    assertCoverFile(file);
    revokeDraftSrc(id);
    const objectUrl = URL.createObjectURL(file);
    draftMemory.set(id, objectUrl);
    draftFiles.set(id, file);
    try {
        if (typeof caches !== "undefined") {
            const cache = await caches.open(DRAFT_CACHE);
            await cache.put(draftCacheUrl(id), new Response(file, {
                headers: { "Content-Type": file.type || "image/jpeg" },
            }));
        }
    } catch {
        /* memory still holds the file */
    }
    return objectUrl;
}

export async function loadDraftCover(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return "";
    if (draftMemory.has(id)) return draftMemory.get(id);
    try {
        if (typeof caches === "undefined") return "";
        const cache = await caches.open(DRAFT_CACHE);
        const res = await cache.match(draftCacheUrl(id));
        if (!res) return "";
        const blob = await res.blob();
        if (!blob.size || (blob.type && !blob.type.startsWith("image/"))) return "";
        const objectUrl = URL.createObjectURL(blob);
        draftMemory.set(id, objectUrl);
        if (!draftFiles.has(id)) {
            const ext = (blob.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
            draftFiles.set(id, new File([blob], `cover.${ext}`, { type: blob.type || "image/jpeg" }));
        }
        return objectUrl;
    } catch {
        return "";
    }
}

export async function loadDraftCoverFile(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return null;
    if (draftFiles.has(id)) return draftFiles.get(id);
    await loadDraftCover(id);
    return draftFiles.get(id) || null;
}

export async function clearDraftCover(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return;
    revokeDraftSrc(id);
    draftFiles.delete(id);
    try {
        if (typeof caches === "undefined") return;
        const cache = await caches.open(DRAFT_CACHE);
        await cache.delete(draftCacheUrl(id));
    } catch {
        /* ignore */
    }
}

function isBucketMissing(error) {
    const msg = String(error?.message || error || "").toLowerCase();
    return msg.includes("bucket") && (msg.includes("not found") || msg.includes("does not exist") || msg.includes("not exist"));
}

function coverExt(file) {
    const fromName = (file?.name || "").split(".").pop() || "";
    const cleaned = fromName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleaned) return cleaned;
    const fromType = String(file?.type || "").split("/")[1] || "";
    return fromType.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function uploadToBucket(supabase, bucket, path, file) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type || "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
    });
    if (error) return { error };
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data?.publicUrl || "" };
}

export async function uploadBookCover(supabase, bookId, file, userId = "") {
    if (!supabase) throw new Error("Cover upload needs a signed-in account.");
    const id = String(bookId || "").trim();
    if (!id) throw new Error("Missing book.");
    if (id.startsWith("local-book-")) {
        throw new Error("This book is only on this device. Sign in and save it to your account first.");
    }
    assertCoverFile(file);
    const ext = coverExt(file);
    const primary = await uploadToBucket(supabase, BUCKET, `${id}/${crypto.randomUUID()}.${ext}`, file);
    if (!primary.error) return primary.url;
    if (!isBucketMissing(primary.error)) {
        throw new Error(primary.error.message || "Could not upload cover.");
    }
    const uid = String(userId || "").trim();
    if (!uid) throw new Error(primary.error.message || "Could not upload cover.");
    const fallback = await uploadToBucket(
        supabase,
        FALLBACK_BUCKET,
        `${uid}/${id}/cover/${crypto.randomUUID()}.${ext}`,
        file,
    );
    if (fallback.error) throw new Error(fallback.error.message || "Could not upload cover.");
    return fallback.url;
}
