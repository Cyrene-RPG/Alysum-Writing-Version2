/**
 * Reputation levels 1–50. Cumulative to 50 = 15,190.
 * threshold[n] = round(6.076 * n * n)
 */

const REP_MAX = 50;

function buildThresholds() {
    const out = [0];
    for (let n = 1; n <= REP_MAX; n += 1) {
        out[n] = Math.round(6.076 * n * n);
    }
    return Object.freeze(out);
}

export const REP_THRESHOLDS = buildThresholds();
export const REP_MAX_LEVEL = REP_MAX;

const GEM_COLORS = Object.freeze([
    "",
    "gray", "gray", "gray", "gray", "gray",
    "green", "green", "green", "green", "green",
    "blue", "blue", "blue", "blue", "blue",
    "purple", "purple", "purple", "purple", "purple",
    "yellow", "yellow", "yellow", "yellow", "yellow",
    "orange", "orange", "orange", "orange", "orange",
    "teal", "teal", "teal", "teal", "teal",
    "red", "red", "red", "red", "red",
    "diamond", "diamond", "diamond", "diamond", "diamond",
    "royal", "royal", "royal", "royal", "royal"
]);

export function levelFromRep(rep) {
    const n = Math.max(0, Math.floor(Number(rep) || 0));
    let level = 0;
    for (let i = 1; i <= REP_MAX; i += 1) {
        if (n >= REP_THRESHOLDS[i]) level = i;
        else break;
    }
    return level;
}

export function gemColorForLevel(level) {
    const n = Math.floor(Number(level) || 0);
    return GEM_COLORS[n] || "";
}

/** 1–5 inside a 5-level color band. Diamond 41–45 is facet steps, not round-to-cut. */
export function gemCutStep(level) {
    const n = Math.floor(Number(level) || 0);
    if (n < 1) return 0;
    return ((n - 1) % 5) + 1;
}

export function maxGivePerAction(totalRep) {
    const n = Math.max(0, Math.floor(Number(totalRep) || 0));
    if (n > 10000) return 6;
    if (n > 5000) return 5;
    if (n > 1000) return 4;
    if (n > 500) return 3;
    if (n > 200) return 2;
    return 1;
}

export function dailyGiveLimit(repLevel) {
    const n = Math.floor(Number(repLevel) || 0);
    if (n > 20) return n;
    return 20;
}

export function authorOwnFictionGiveLimit(totalRep) {
    const n = Math.max(0, Math.floor(Number(totalRep) || 0));
    return n >= 5000 ? 10 : 5;
}
