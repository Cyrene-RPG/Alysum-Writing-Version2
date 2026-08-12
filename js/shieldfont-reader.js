/**
 * Client helpers for Alysum's ShieldFont reader integration.
 * Decoded words appear only via the Optik face — never re-encode here.
 */

const SHIELD_CLASS_RE = /\btk9(?:-[a-z]+)?\b/g;

/**
 * @param {unknown} shield
 * @returns {{ enabled: boolean, variant: string, className: string, fontFamily: string } | null}
 */
export function normalizeShieldMeta(shield) {
    if (!shield || typeof shield !== "object") return null;
    const enabled = shield.enabled !== false;
    if (!enabled) return null;
    const variant = String(shield.variant || "a").toLowerCase();
    const className =
        String(shield.className || "").trim() ||
        (variant === "b" ? "tk9-b" : variant === "c" ? "tk9-c" : "tk9");
    const fontFamily =
        String(shield.fontFamily || "").trim() ||
        (variant === "b" ? "Optik Beta" : variant === "c" ? "Optik Gamma" : "Optik");
    return { enabled: true, variant, className, fontFamily };
}

/**
 * @param {HTMLElement | null} el
 * @param {{ className: string, fontFamily: string } | null} shield
 * @param {{ fontSizePx?: string | number } | null} [typography]
 */
export function applyShieldToContent(el, shield, typography = null) {
    if (!el) return;
    el.className = String(el.className || "")
        .replace(SHIELD_CLASS_RE, "")
        .replace(/\balysum-shielded\b/g, "")
        .replace(/\balysum-shield-unavailable\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!shield) {
        el.removeAttribute("aria-hidden");
        el.style.removeProperty("font-family");
        return;
    }

    el.classList.add("alysum-shielded", shield.className);
    el.setAttribute("aria-hidden", "true");
    el.style.fontFamily = `"${shield.fontFamily}", Georgia, serif`;
    el.style.fontWeight = "400";
    el.style.fontSynthesis = "none";

    const size = typography && typography.fontSizePx;
    if (size) {
        el.style.fontSize = `${size}px`;
        el.style.lineHeight = "1.7";
    }
}

/**
 * Fail loud if the protection face never loads — never leave decoy prose on screen.
 * @param {string} fontFamily
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function waitForShieldFont(fontFamily, timeoutMs = 4000) {
    const family = String(fontFamily || "Optik").trim() || "Optik";
    const probe = `400 24px "${family}"`;
    try {
        if (document.fonts && typeof document.fonts.load === "function") {
            await Promise.race([
                document.fonts.load(probe),
                new Promise((_, reject) => {
                    window.setTimeout(() => reject(new Error("font-timeout")), timeoutMs);
                }),
            ]);
            if (typeof document.fonts.check === "function" && !document.fonts.check(probe)) {
                return false;
            }
            return true;
        }
    } catch {
        return false;
    }
    return true;
}

/**
 * @param {HTMLElement | null} el
 */
export function markShieldUnavailable(el) {
    if (!el) return;
    el.classList.add("alysum-shield-unavailable");
    el.classList.remove("alysum-shielded");
    el.removeAttribute("aria-hidden");
    el.style.removeProperty("font-family");
    el.innerHTML =
        "<p>Content unavailable. The reading face failed to load — refresh the page or try another browser.</p>";
    console.error("[alysum] ShieldFont face failed to load; refusing to show decoy chapter text.");
}
