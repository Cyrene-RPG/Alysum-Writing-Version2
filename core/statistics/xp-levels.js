/**
 * User XP levels 1–30. Below 100 XP is level 0 (no XP border).
 * Level is the highest n where xp >= threshold[n].
 */

export const XP_THRESHOLDS = Object.freeze([
    0,
    100, 250, 600, 1300, 2700,
    4300, 6300, 8700, 12000, 16300,
    21000, 26200, 31900, 38100, 44900,
    52200, 60000, 68800, 79200, 91800,
    104200, 119100, 135500, 153500, 173000,
    194000, 217000, 245000, 275000, 308000
]);

const METALS = Object.freeze([
    "",
    "iron", "iron", "iron", "iron", "iron",
    "bronze", "bronze", "bronze", "bronze", "bronze",
    "silver", "silver", "silver", "silver", "silver",
    "gold", "gold", "gold", "gold", "gold",
    "platinum", "platinum", "platinum", "platinum", "platinum",
    "diamond", "diamond", "diamond", "diamond", "diamond"
]);

export const XP_MAX_LEVEL = 30;

export function levelFromXp(xp) {
    const n = Math.max(0, Math.floor(Number(xp) || 0));
    let level = 0;
    for (let i = 1; i <= XP_MAX_LEVEL; i += 1) {
        if (n >= XP_THRESHOLDS[i]) level = i;
        else break;
    }
    return level;
}

export function metalForLevel(level) {
    const n = Math.floor(Number(level) || 0);
    return METALS[n] || "";
}

export function bandStepForLevel(level) {
    const n = Math.floor(Number(level) || 0);
    if (n < 1) return 0;
    return ((n - 1) % 5) + 1;
}

export function xpIntoLevel(xp) {
    const n = Math.max(0, Math.floor(Number(xp) || 0));
    const level = levelFromXp(n);
    const start = XP_THRESHOLDS[level] || 0;
    const next = level >= XP_MAX_LEVEL ? null : XP_THRESHOLDS[level + 1];
    const span = next == null ? 0 : next - start;
    const into = n - start;
    const ratio = span > 0 ? Math.min(1, Math.max(0, into / span)) : 1;
    return { level, start, next, into, span, ratio };
}

/** 6 columns × 5 rows, column-major: L1 top-left, L2 under it, L6 starts column 2. */
export function borderGridCell(level) {
    const n = Math.floor(Number(level) || 0);
    if (n < 1 || n > XP_MAX_LEVEL) return null;
    const col = Math.floor((n - 1) / 5);
    const row = (n - 1) % 5;
    return { col, row, level: n };
}
