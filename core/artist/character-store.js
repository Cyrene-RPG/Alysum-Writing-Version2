import { normalizeCharacterFromRow } from "./normalize.js";
import { offerPatch, rethrowGallery } from "./offers.js";
import { newCharacterId, slugifyCharacterName } from "./slug.js";

function missingTableError(error) {
    const message = String(error?.message || "");
    return /artist_characters|artist_focus|schema cache/i.test(message)
        && /does not exist|schema cache/i.test(message);
}

export async function listMyCharacters(supabase, ownerId) {
    const id = String(ownerId || "").trim();
    if (!supabase || !id) return [];
    const { data, error } = await supabase
        .from("artist_characters")
        .select("*")
        .eq("owner_id", id)
        .order("updated_at", { ascending: false });
    if (error) {
        if (missingTableError(error)) {
            throw new Error(
                "Artist characters are not on this database yet. Run supabase/live-site/supabase-artist.sql in the Supabase SQL editor.",
            );
        }
        throw error;
    }
    return (data || []).map(normalizeCharacterFromRow).filter(Boolean);
}

export async function createCharacter(supabase, ownerId, { displayName, kind = "oc" } = {}) {
    const id = String(ownerId || "").trim();
    const name = String(displayName ?? "").trim();
    if (!supabase || !id) throw new Error("Sign in to create a character.");
    if (!name) throw new Error("Enter a character name.");
    const characterId = newCharacterId();
    let slug = slugifyCharacterName(name);
    const now = new Date().toISOString();
    const row = {
        owner_id: id,
        id: characterId,
        slug,
        display_name: name,
        kind,
        creator_id: id,
        trade_policy: "none",
        terms_text: "",
        visibility: "private",
        summary: "",
        portrait_url: "",
        updated_at: now,
    };
    const { data, error } = await supabase.from("artist_characters").insert(row).select("*").single();
    if (error) {
        if (error.code === "23505") {
            slug = `${slug}-${characterId.slice(-4)}`;
            const retry = await supabase
                .from("artist_characters")
                .insert({ ...row, slug })
                .select("*")
                .single();
            if (retry.error) throw retry.error;
            return normalizeCharacterFromRow(retry.data);
        }
        if (missingTableError(error)) {
            throw new Error(
                "Artist characters are not on this database yet. Run supabase/live-site/supabase-artist.sql in the Supabase SQL editor.",
            );
        }
        throw error;
    }
    return normalizeCharacterFromRow(data);
}

export async function fetchArtistHubProfile(supabase, userId) {
    const id = String(userId || "").trim();
    if (!supabase || !id) return { artistFocus: null, artistHubReady: false };
    const { data, error } = await supabase
        .from("users")
        .select("artist_focus, artist_hub_ready, account_type, username, display_name, profile_image_url, artist_bio")
        .eq("id", id)
        .maybeSingle();
    if (error) {
        if (missingTableError(error)) {
            return { artistFocus: null, artistHubReady: false, accountType: null };
        }
        throw error;
    }
    return {
        artistFocus: data?.artist_focus ?? null,
        artistHubReady: Boolean(data?.artist_hub_ready),
        accountType: data?.account_type ?? null,
        username: data?.username ?? "",
        displayName: data?.display_name ?? "",
        imageUrl: data?.profile_image_url ?? "",
        artistBio: data?.artist_bio ?? "",
    };
}

export async function saveArtistBio(supabase, userId, bio) {
    const id = String(userId || "").trim();
    const text = String(bio ?? "").trim().slice(0, 2000);
    const { error } = await supabase.from("users").update({ artist_bio: text }).eq("id", id);
    if (error) throw error;
}

export async function getCharacter(supabase, ownerId, characterId) {
    const { data, error } = await supabase
        .from("artist_characters")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("id", characterId)
        .maybeSingle();
    if (error) throw error;
    return normalizeCharacterFromRow(data);
}

export async function updateCharacter(supabase, ownerId, characterId, patch) {
    const row = { updated_at: new Date().toISOString() };
    if (patch.displayName != null) {
        const name = String(patch.displayName).trim();
        if (!name) throw new Error("Enter a character name.");
        row.display_name = name;
        row.slug = slugifyCharacterName(name);
    }
    if (patch.kind != null) row.kind = patch.kind;
    if (patch.tradePolicy != null) row.trade_policy = patch.tradePolicy;
    if (patch.termsText != null) row.terms_text = String(patch.termsText).slice(0, 8000);
    if (patch.visibility != null) row.visibility = patch.visibility;
    if (patch.summary != null) row.summary = String(patch.summary).slice(0, 500);
    if (patch.portraitUrl != null) row.portrait_url = String(patch.portraitUrl);
    if (patch.fields != null) row.fields = patch.fields;
    Object.assign(row, offerPatch(patch));
    const { data, error } = await supabase
        .from("artist_characters")
        .update(row)
        .eq("owner_id", ownerId)
        .eq("id", characterId)
        .select("*")
        .single();
    if (error) rethrowGallery(error);
    return normalizeCharacterFromRow(data);
}

export async function deleteCharacter(supabase, ownerId, characterId) {
    const { error } = await supabase
        .from("artist_characters")
        .delete()
        .eq("owner_id", ownerId)
        .eq("id", characterId);
    if (error) throw error;
}

export async function listPublicCharacters(supabase, ownerId) {
    const { data, error } = await supabase
        .from("artist_characters")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("visibility", "public")
        .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeCharacterFromRow).filter(Boolean);
}

export async function saveArtistFocus(supabase, userId, focus) {
    const id = String(userId || "").trim();
    if (!supabase || !id) throw new Error("Sign in to save your artist focus.");
    const { error } = await supabase
        .from("users")
        .update({
            artist_focus: focus,
            artist_hub_ready: true,
        })
        .eq("id", id);
    if (error) {
        if (missingTableError(error)) {
            throw new Error(
                "Artist focus is not on this database yet. Run supabase/live-site/supabase-artist.sql in the Supabase SQL editor.",
            );
        }
        throw error;
    }
}
