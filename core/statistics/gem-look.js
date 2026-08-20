/**
 * Rep level → CSS class names for the gem in the bottom-center of the XP border.
 * Diamond (41–45): facets/corners, not round-to-cut. Royal (46–50): multicolor wash.
 */

import { gemColorForLevel, gemCutStep } from "./rep-levels.js";

export function gemLook(level) {
    const n = Math.floor(Number(level) || 0);
    if (n < 1) {
        return { color: "", cut: 0, className: "gem gem--hidden" };
    }
    const color = gemColorForLevel(n);
    const cut = gemCutStep(n);
    const kind = n >= 46 ? "royal" : n >= 41 ? "diamond" : "band";
    return {
        color,
        cut,
        kind,
        className: `gem gem--${color} gem--cut-${cut} gem--${kind}`
    };
}

export function borderLook(xpLevel, metal) {
    const n = Math.floor(Number(xpLevel) || 0);
    if (n < 1) return { className: "badge-border badge-border--none" };
    const band = metal || "iron";
    const step = ((n - 1) % 5) + 1;
    return {
        className: `badge-border badge-border--${band} badge-border--step-${step}`
    };
}
