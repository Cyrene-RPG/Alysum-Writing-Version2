function mapArtwork(row) {
    if (!row) return null;
    return {
        ownerId: row.owner_id,
        id: row.id,
        characterId: row.character_id || null,
        storagePath: row.storage_path || "",
        publicUrl: row.public_url || "",
        caption: row.caption || "",
        visibility: row.visibility,
        protectionDeclared: row.protection_declared || null,
        createdAt: row.created_at,
    };
}

export async function listArtworks(supabase, ownerId, characterId = "") {
    let query = supabase.from("artist_artworks").select("*").eq("owner_id", ownerId);
    if (characterId) query = query.eq("character_id", characterId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapArtwork).filter(Boolean);
}

export async function listPublicArtworks(supabase, ownerId, characterId = "") {
    let query = supabase
        .from("artist_artworks")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("visibility", "public");
    if (characterId) query = query.eq("character_id", characterId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapArtwork).filter(Boolean);
}

export async function addArtwork(supabase, ownerId, input) {
    const visibility = input.visibility || "private";
    const protection = input.protectionDeclared || null;
    if (visibility === "public" && !protection) {
        throw new Error("Public images must be a Glaze and/or Nightshade export. Check the protection box first.");
    }
    const id = `art_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const row = {
        owner_id: ownerId,
        id,
        character_id: input.characterId || null,
        storage_path: input.storagePath || "",
        public_url: input.publicUrl || "",
        caption: String(input.caption || "").slice(0, 2000),
        visibility,
        protection_declared: protection,
        updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("artist_artworks").insert(row).select("*").single();
    if (error) throw error;
    return mapArtwork(data);
}

export async function deleteArtwork(supabase, ownerId, artworkId) {
    const { error } = await supabase
        .from("artist_artworks")
        .delete()
        .eq("owner_id", ownerId)
        .eq("id", artworkId);
    if (error) throw error;
}
