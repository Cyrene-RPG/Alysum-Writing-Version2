import { normalizeCharacterFromRow } from "./normalize.js";

export async function findUserByHandle(supabase, username) {
    const handle = String(username || "").trim();
    if (!handle) return null;
    const { data, error } = await supabase
        .from("users")
        .select("id, username, display_name, profile_image_url, artist_bio, artist_focus, account_type")
        .ilike("username", handle)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        id: data.id,
        username: data.username || "",
        displayName: data.display_name || data.username || "Artist",
        imageUrl: data.profile_image_url || "",
        artistBio: data.artist_bio || "",
        artistFocus: data.artist_focus || null,
    };
}

export async function findUserById(supabase, userId) {
    const id = String(userId || "").trim();
    if (!id) return null;
    const { data, error } = await supabase
        .from("users")
        .select("id, username, display_name, profile_image_url, artist_bio, artist_focus")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        id: data.id,
        username: data.username || "",
        displayName: data.display_name || data.username || "Artist",
        imageUrl: data.profile_image_url || "",
        artistBio: data.artist_bio || "",
        artistFocus: data.artist_focus || null,
    };
}

export function publicCharacterUrl(username, slug) {
    const handle = String(username || "").trim();
    const name = String(slug || "").trim();
    if (!handle || !name) return "/artist";
    return `/character?u=${encodeURIComponent(handle)}&slug=${encodeURIComponent(name)}`;
}

export function publicArtistUrl(username) {
    const handle = String(username || "").trim();
    if (!handle) return "/artist";
    return `/artist-profile?u=${encodeURIComponent(handle)}`;
}

export function publicGalleryUrl(username) {
    const handle = String(username || "").trim();
    if (!handle) return "/artist-shop";
    return `/artist-shop?u=${encodeURIComponent(handle)}`;
}

export async function getPublicCharacter(supabase, ownerId, slug) {
    const { data, error } = await supabase
        .from("artist_characters")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("slug", slug)
        .eq("visibility", "public")
        .maybeSingle();
    if (error) throw error;
    return normalizeCharacterFromRow(data);
}
