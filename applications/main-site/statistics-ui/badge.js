/**
 * Badge wrap: XP border + rep gem. Fill in later with 30 border styles.
 */
import { metalForLevel, bandStepForLevel } from "@alysum/statistics/xp-levels.js";
import { gemLook, borderLook } from "@alysum/statistics/gem-look.js";

export function paintBadge(wrap, { xpLevel = 0, repLevel = 0 } = {}) {
    if (!wrap) return;
    const metal = metalForLevel(xpLevel);
    const border = borderLook(xpLevel, metal);
    const gem = gemLook(repLevel);
    wrap.className = `ov-avatar-wrap ${border.className}`.trim();
    let gemEl = wrap.querySelector(".gem");
    if (xpLevel < 1 && repLevel < 1) {
        gemEl?.remove();
        return;
    }
    if (!gemEl) {
        gemEl = document.createElement("span");
        wrap.appendChild(gemEl);
    }
    gemEl.className = gem.className;
    gemEl.dataset.cut = String(gem.cut || bandStepForLevel(xpLevel) || "");
}
