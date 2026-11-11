import {
    ARTIST_FOCUS_BOTH,
    ARTIST_FOCUS_OC,
    ARTIST_FOCUS_WRITER,
} from "./constants.js";

const FOCUS_IDS = new Set([ARTIST_FOCUS_OC, ARTIST_FOCUS_WRITER, ARTIST_FOCUS_BOTH]);

export function normalizeArtistFocus(raw) {
    const value = String(raw ?? "").trim().toLowerCase();
    return FOCUS_IDS.has(value) ? value : null;
}

export function normalizeCharacterFromRow(row) {
    if (!row || typeof row !== "object") return null;
    return {
        ownerId: row.owner_id,
        id: row.id,
        slug: row.slug,
        displayName: row.display_name,
        kind: row.kind,
        creatorId: row.creator_id,
        tradePolicy: row.trade_policy,
        termsText: row.terms_text,
        visibility: row.visibility,
        fields: row.fields && typeof row.fields === "object" ? row.fields : {},
        folderId: row.folder_id || null,
        sortKey: Number(row.sort_key) || 0,
        provenanceVerifiedAt: row.provenance_verified_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
