export const ARTIST_MEDIA_BUCKET = "artist-media";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 12 * 1024 * 1024;

function extensionFor(file) {
    const fromName = String(file?.name || "").split(".").pop() || "";
    const cleaned = fromName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleaned && cleaned.length <= 5) return cleaned;
    const fromType = String(file?.type || "").split("/")[1] || "jpg";
    return fromType.replace(/[^a-z0-9]/g, "") || "jpg";
}

export function assertArtistImage(file) {
    if (!file) throw new Error("Choose an image.");
    if (!ALLOWED.has(file.type)) throw new Error("Use a PNG, JPEG, WebP, or GIF.");
    if (file.size > MAX_BYTES) throw new Error("Images must be 12 MB or smaller.");
}

export async function uploadArtistImage(supabase, userId, file) {
    assertArtistImage(file);
    const id = String(userId || "").trim();
    if (!supabase || !id) throw new Error("Sign in to upload.");
    const path = `${id}/${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error } = await supabase.storage.from(ARTIST_MEDIA_BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
    });
    if (error) {
        const message = String(error.message || "");
        if (/bucket/i.test(message) && /not found|does not exist/i.test(message)) {
            throw new Error("Image storage is not set up yet. Run supabase/live-site/supabase-artist.sql in the Supabase SQL editor.");
        }
        throw new Error(message || "Upload failed.");
    }
    const { data } = supabase.storage.from(ARTIST_MEDIA_BUCKET).getPublicUrl(path);
    return { path, url: data?.publicUrl || "" };
}
