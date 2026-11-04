/**
 * Per-book writer background images.
 * Local copy: Cache API. Cloud copy: book-content-images, URL on publish_meta.
 */

const BUCKET = "book-content-images";
const CACHE_NAME = "alysum:editor:writer-background";
const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;

const memory = new Map();
const localMemory = new Map();
const localFiles = new Map();

export function safeWriterBackgroundUrl(url) {
    const value = String(url || "").trim();
    if (!value || value.length > 2000) return "";
    if (/['"\\]/.test(value)) return "";
    try {
        const parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
        if (parsed.protocol === "http:") parsed.protocol = "https:";
        if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
            return "";
        }
        return parsed.href;
    } catch {
        return "";
    }
}

export function readWriterBackgroundUrl(meta) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
    return safeWriterBackgroundUrl(meta.writerBackgroundUrl || meta.writer_background_url);
}

export function assertWriterBackgroundFile(file) {
    if (!file) throw new Error("Choose an image.");
    const type = String(file.type || "");
    if (type && !type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > MAX_BACKGROUND_BYTES) throw new Error("Image must be 8 MB or smaller.");
}

function localCacheUrl(bookId) {
    return `https://alysum.invalid/writer-background/${encodeURIComponent(bookId)}`;
}

function revokeLocalSrc(bookId) {
    const prev = localMemory.get(bookId);
    if (prev) URL.revokeObjectURL(prev);
    localMemory.delete(bookId);
}

function backgroundExt(file) {
    const fromName = (file?.name || "").split(".").pop() || "";
    const cleaned = fromName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleaned) return cleaned;
    const fromType = String(file?.type || "").split("/")[1] || "";
    return fromType.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function uploadToBucket(supabase, path, file) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
    });
    if (error) return { error };
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data?.publicUrl || "" };
}

export async function saveLocalWriterBackground(bookId, file) {
    const id = String(bookId || "").trim();
    if (!id) throw new Error("Missing book.");
    assertWriterBackgroundFile(file);
    revokeLocalSrc(id);
    const objectUrl = URL.createObjectURL(file);
    localMemory.set(id, objectUrl);
    localFiles.set(id, file);
    try {
        if (typeof caches !== "undefined") {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(localCacheUrl(id), new Response(file, {
                headers: { "Content-Type": file.type || "image/jpeg" },
            }));
        }
    } catch {
        /* memory still holds the file */
    }
    return objectUrl;
}

export async function loadLocalWriterBackground(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return "";
    if (localMemory.has(id)) return localMemory.get(id);
    try {
        if (typeof caches === "undefined") return "";
        const cache = await caches.open(CACHE_NAME);
        const res = await cache.match(localCacheUrl(id));
        if (!res) return "";
        const blob = await res.blob();
        if (!blob.size || (blob.type && !blob.type.startsWith("image/"))) return "";
        const objectUrl = URL.createObjectURL(blob);
        localMemory.set(id, objectUrl);
        if (!localFiles.has(id)) {
            const ext = (blob.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
            localFiles.set(id, new File([blob], `writer-background.${ext}`, { type: blob.type || "image/jpeg" }));
        }
        return objectUrl;
    } catch {
        return "";
    }
}

export async function clearLocalWriterBackground(bookId) {
    const id = String(bookId || "").trim();
    if (!id) return;
    revokeLocalSrc(id);
    localFiles.delete(id);
    try {
        if (typeof caches === "undefined") return;
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(localCacheUrl(id));
    } catch {
        /* ignore */
    }
}

export async function rememberWriterBackground(url) {
    const safe = safeWriterBackgroundUrl(url);
    if (!safe) return "";
    if (memory.has(safe)) return memory.get(safe);
    try {
        if (typeof caches === "undefined") {
            memory.set(safe, safe);
            return safe;
        }
        const cache = await caches.open(CACHE_NAME);
        let res = await cache.match(safe);
        if (!res) {
            res = await fetch(safe);
            if (!res.ok) throw new Error("Could not load image.");
            await cache.put(safe, res.clone());
        }
        const blob = await res.blob();
        if (!blob.size || (blob.type && !blob.type.startsWith("image/"))) {
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

export async function uploadWriterBackground(supabase, bookId, file, userId = "") {
    if (!supabase) throw new Error("Background upload needs a signed-in account.");
    const id = String(bookId || "").trim();
    if (!id) throw new Error("Missing book.");
    if (id.startsWith("local-book-")) {
        throw new Error("This book is only on this device. Sign in and save it to your account to keep the picture on other devices.");
    }
    const uid = String(userId || "").trim();
    if (!uid) throw new Error("Background upload needs a signed-in account.");
    assertWriterBackgroundFile(file);
    const ext = backgroundExt(file);
    const uploaded = await uploadToBucket(
        supabase,
        `${uid}/${id}/writer-bg/${crypto.randomUUID()}.${ext}`,
        file,
    );
    if (uploaded.error) throw new Error(uploaded.error.message || "Could not upload image.");
    const url = safeWriterBackgroundUrl(uploaded.url);
    if (!url) throw new Error("Could not upload image.");
    return url;
}

export { MAX_BACKGROUND_BYTES };
