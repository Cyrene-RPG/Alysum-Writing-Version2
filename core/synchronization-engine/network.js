/**
 * Reachability hints. navigator.onLine is not proof the site is up —
 * a failed fetch still means offline.
 */

export function isProbablyOnline() {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine !== false;
}

export function withTimeout(promise, ms, label = "timeout") {
    const limit = Number(ms);
    if (!Number.isFinite(limit) || limit <= 0) return promise;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error(label)), limit);
        }),
    ]);
}

/**
 * @param {() => void | Promise<void>} fn
 * @returns {() => void} unsubscribe
 */
export function onReconnect(fn) {
    if (typeof window === "undefined") return () => {};
    let running = false;
    const run = () => {
        if (!isProbablyOnline() || running) return;
        running = true;
        Promise.resolve()
            .then(() => fn())
            .catch(() => {})
            .finally(() => {
                running = false;
            });
    };
    const onVisible = () => {
        if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
        window.removeEventListener("online", run);
        document.removeEventListener("visibilitychange", onVisible);
    };
}
