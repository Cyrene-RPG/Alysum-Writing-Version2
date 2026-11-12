import { gallerySchemaMissing } from "./offers.js";

function profileEntry(row, adoptableCount) {
    const id = String(row?.id || "").trim();
    const username = String(row?.username || "").trim();
    const commissionsOpen = Boolean(row?.commission_open ?? row?.commissionOpen);
    if (!id || !username || (!commissionsOpen && adoptableCount < 1)) return null;
    return {
        id,
        username,
        displayName: String(row.display_name || row.displayName || username).trim() || username,
        imageUrl: String(row.profile_image_url || row.imageUrl || "").trim(),
        bio: String(row.artist_bio || row.bio || "").trim(),
        commissionsOpen,
        adoptableCount,
    };
}

/** Artists a writer or reader can open: commissions on, or at least one public adoptable. */
export function buildOpenArtistList(profiles, adoptableOwnerIds = []) {
    const counts = new Map();
    for (const ownerId of adoptableOwnerIds) {
        const id = String(ownerId || "").trim();
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    const seen = new Set();
    const entries = [];
    for (const row of profiles || []) {
        const id = String(row?.id || "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const entry = profileEntry(row, counts.get(id) || 0);
        if (entry) entries.push(entry);
    }
    entries.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
    return entries;
}

async function adoptableOwnerIds(supabase) {
    const { data, error } = await supabase
        .from("artist_characters")
        .select("owner_id")
        .eq("visibility", "public")
        .eq("offer_kind", "adopt")
        .neq("offer_status", "closed");
    if (error) {
        if (gallerySchemaMissing(error)) return [];
        throw error;
    }
    return (data || []).map((row) => row.owner_id).filter(Boolean);
}

async function commissionProfiles(supabase) {
    const { data, error } = await supabase
        .from("users")
        .select("id, username, display_name, profile_image_url, artist_bio, commission_open")
        .eq("commission_open", true);
    if (error) {
        if (gallerySchemaMissing(error)) return [];
        throw error;
    }
    return data || [];
}

async function profilesById(supabase, ids) {
    const rows = [];
    for (let index = 0; index < ids.length; index += 80) {
        const chunk = ids.slice(index, index + 80);
        const { data, error } = await supabase
            .from("users")
            .select("id, username, display_name, profile_image_url, artist_bio")
            .in("id", chunk);
        if (error) throw error;
        rows.push(...(data || []));
    }
    return rows;
}

export async function loadOpenArtists(supabase) {
    if (!supabase) return [];
    const [owners, commissions] = await Promise.all([
        adoptableOwnerIds(supabase),
        commissionProfiles(supabase),
    ]);
    const known = new Set(commissions.map((row) => row.id));
    const missing = [...new Set(owners.map((id) => String(id)))].filter((id) => id && !known.has(id));
    const extras = missing.length ? await profilesById(supabase, missing) : [];
    return buildOpenArtistList([...commissions, ...extras], owners);
}
