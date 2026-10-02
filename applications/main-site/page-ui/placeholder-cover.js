/**
 * Abstract placeholder art for books that have no cover image yet.
 * One design per book (seeded by its id), coloured by its main genre.
 */

const PALETTE = {
    fantasy: ["#4c2a9e", "#f5d489"],
    isekai: ["#7a1f73", "#7dd3fc"],
    litrpg: ["#6b3350", "#a3e635"],
    scifi: ["#23236b", "#67e8f9"],
    romance: ["#a4295e", "#fecdd3"],
    horror: ["#1d1a24", "#dc2626"],
    mystery: ["#40306e", "#c4b5fd"],
    slice: ["#8a6420", "#fef3c7"],
    action: ["#8c2346", "#fb923c"],
    drama: ["#5b2585", "#f9a8d4"],
    adventure: ["#3f4a2c", "#fcd34d"],
};
const FALLBACKS = Object.values(PALETTE);

function hashText(text) {
    let h = 2166136261;
    for (const ch of String(text || "")) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
}

function seededRandom(seed) {
    let s = (seed % 2147483646) + 1;
    const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
    next(); next(); next();
    return next;
}

function paletteFor(genreKey, seed) {
    return PALETTE[genreKey] || FALLBACKS[seed % FALLBACKS.length];
}

/** @returns {string} an <svg> string that fills its box */
export function placeholderCoverSvg(genreKey, seedText) {
    const seed = hashText(seedText);
    const [base, hi] = paletteFor(genreKey, seed);
    const r = seededRandom(seed);
    const id = `pc${seed.toString(36)}`;
    const kind = Math.floor(r() * 5);
    let shapes = "";
    if (kind === 0) {
        const cy = 120 + r() * 60;
        shapes = `<circle cx="${60 + r() * 80}" cy="${cy}" r="${40 + r() * 30}" fill="${hi}" opacity=".85"/><rect y="${cy + 20}" width="200" height="200" fill="#0b0912" opacity=".55"/>`;
    } else if (kind === 1) {
        for (let i = 0; i < 7; i += 1) shapes += `<rect x="${-60 + i * 44}" y="-40" width="18" height="420" fill="${hi}" opacity="${0.15 + r() * 0.5}" transform="rotate(28 100 150)"/>`;
    } else if (kind === 2) {
        const cx = 40 + r() * 120;
        for (let i = 6; i > 0; i -= 1) shapes += `<circle cx="${cx}" cy="300" r="${i * 34}" fill="none" stroke="${hi}" stroke-width="${2 + r() * 6}" opacity="${0.2 + i * 0.08}"/>`;
    } else if (kind === 3) {
        shapes = `<path d="M0 300 L${50 + r() * 40} ${130 + r() * 60} L${110 + r() * 30} 220 L${150 + r() * 30} ${110 + r() * 60} L200 300Z" fill="${hi}" opacity=".75"/><path d="M0 300 L70 230 L130 270 L200 210 L200 300Z" fill="#0b0912" opacity=".6"/>`;
    } else {
        for (let y = 0; y < 8; y += 1) {
            for (let x = 0; x < 6; x += 1) {
                if (r() > 0.45) shapes += `<rect x="${x * 34 + 8}" y="${y * 38 + 10}" width="${14 + r() * 16}" height="${14 + r() * 16}" rx="3" fill="${hi}" opacity="${0.2 + r() * 0.6}"/>`;
            }
        }
    }
    return `<svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="#0b0912"/></linearGradient></defs><rect width="200" height="300" fill="url(#${id})"/>${shapes}</svg>`;
}
