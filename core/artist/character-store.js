import { normalizeCharacterFromRow } from "./normalize.js";
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
                "Artist characters are not available on this database yet. Run the artist foundation migration on staging.",
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
                "Artist characters are not available on this database yet. Run the artist foundation migration on staging.",
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
        .select("artist_focus, artist_hub_ready, account_type")
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
    };
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
                "Artist focus is not available on this database yet. Run the artist foundation migration on staging.",
            );
        }
        throw error;
    }
}
