const SLUG_MAX = 64;

export function slugifyCharacterName(name) {
    const base = String(name ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, SLUG_MAX);
    return base || "character";
}

export function newCharacterId() {
    const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    return `chr_${hex}`;
}
