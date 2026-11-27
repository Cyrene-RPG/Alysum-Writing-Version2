/** Pointer sampling, pressure, and view-local coordinates for Draw. */

export function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Prefer coalesced samples so fast strokes keep stamp accuracy. */
export function pointerSamples(event) {
    try {
        const extra = event.getCoalescedEvents?.();
        if (extra?.length && extra.some((item) => item.clientX || item.clientY)) return extra;
    } catch { /* Use the pointer event itself. */ }
    return [event];
}

/**
 * Normalize pressure across mouse, touch, and stylus.
 * Treat missing pressure as a fallback; keep real near-zero pen values.
 */
export function pressureOf(event) {
    if (event.pointerType === "mouse") return 1;
    const raw = event.pressure;
    if (raw == null || Number.isNaN(raw)) {
        return event.pointerType === "pen" ? 0.35 : 0.75;
    }
    if (raw === 0 && event.buttons > 0) {
        // Some browsers report 0 until the first real sample lands.
        return event.pointerType === "pen" ? 0.2 : 0.55;
    }
    return Math.max(0.02, Math.min(1, raw));
}

/** Cache getBoundingClientRect; pointer storms must not force layout every move. */
export function createViewRectCache(element) {
    let rect = { left: 0, top: 0, width: 1, height: 1 };
    let stale = true;

    function sync() {
        if (!element) return rect;
        const next = element.getBoundingClientRect();
        rect = { left: next.left, top: next.top, width: next.width || 1, height: next.height || 1 };
        stale = false;
        return rect;
    }

    return {
        invalidate() { stale = true; },
        read() { return stale ? sync() : rect; },
        sync,
        localPoint(event, cssW = 0, cssH = 0) {
            const box = stale ? sync() : rect;
            const scaleX = cssW > 0 ? cssW / box.width : 1;
            const scaleY = cssH > 0 ? cssH / box.height : 1;
            return {
                x: (event.clientX - box.left) * scaleX,
                y: (event.clientY - box.top) * scaleY,
            };
        },
        clientToLocal(clientX, clientY, cssW = 0, cssH = 0) {
            const box = stale ? sync() : rect;
            const scaleX = cssW > 0 ? cssW / box.width : 1;
            const scaleY = cssH > 0 ? cssH / box.height : 1;
            return {
                x: (clientX - box.left) * scaleX,
                y: (clientY - box.top) * scaleY,
            };
        },
    };
}
