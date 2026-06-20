/**
 * Shared Story Bible UI utilities.
 */

export function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function normalizeText(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
}

export function getInitials(name) {
    const parts = normalizeText(name).split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0]?.[0] || "?").toUpperCase();
}

export function hashHue(str) {
    let h = 0;
    const s = normalizeText(str).toLowerCase();
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h) % 360;
}

export function avatarGradient(name) {
    const hue = hashHue(name);
    return `linear-gradient(135deg, hsl(${hue}, 58%, 48%), hsl(${(hue + 40) % 360}, 52%, 32%))`;
}

export function bookCoverGradient(title) {
    const hue = hashHue(title || "book");
    return `linear-gradient(145deg, hsl(${hue}, 45%, 28%) 0%, hsl(${(hue + 55) % 360}, 38%, 14%) 100%)`;
}

export function placeKindIcon(kind) {
    const map = {
        city: "🏙",
        town: "🏘",
        village: "🏡",
        region: "🗺",
        country: "🌍",
        building: "🏛",
        landmark: "⛰",
        fictional: "✦",
        world: "🌌",
        other: "📍"
    };
    return map[kind] || "📍";
}

export function statusLabel(status) {
    const s = normalizeText(status).toLowerCase();
    if (s === "deceased") return { text: "Deceased", cls: "is-dead" };
    if (s === "unknown") return { text: "Unknown", cls: "is-unknown" };
    return { text: "Alive", cls: "is-alive" };
}
