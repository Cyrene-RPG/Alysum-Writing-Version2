import { sanitizeFileName } from "./slug.js";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "video/mp4",
    "video/quicktime",
];

const BUCKET = "roadmap-attachments";

export function assertAttachment(file) {
    if (!file) throw new Error("Missing file.");
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        throw new Error("Use png, jpg, gif, mp4, or mov — 25MB each.");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error("Each file must be 25MB or smaller.");
    }
}

export function isAttachmentBucketMissing(error) {
    const msg = String(error?.message || error || "").toLowerCase();
    return msg.includes("bucket") && (msg.includes("not found") || msg.includes("does not exist") || msg.includes("not exist"));
}

export async function uploadStagingAttachment(supabase, userId, tempId, file) {
    assertAttachment(file);
    const name = sanitizeFileName(file.name);
    const stagingPath = `${userId}/${tempId}/${name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(stagingPath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
    });
    if (error) throw new Error(error.message || "Could not upload that file.");
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(stagingPath);
    return {
        name,
        stagingPath,
        publicUrl: data?.publicUrl || "",
    };
}
