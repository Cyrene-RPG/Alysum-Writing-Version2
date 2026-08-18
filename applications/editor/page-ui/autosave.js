/**
 * Debounced book save. One request at a time; flush waits for the in-flight write.
 * Status is "saving" | "saved" | "error".
 */
export function createAutosave({ delay = 400, save } = {}) {
    let timer = 0;
    let pending = null;
    let inFlight = null;
    let status = "saved";
    let generation = 0;

    async function pump() {
        if (inFlight) return inFlight;
        const payload = pending;
        if (!payload) return status;
        pending = null;
        const token = ++generation;
        status = "saving";
        inFlight = (async () => {
            try {
                await save(payload, token);
                if (token === generation && !pending) status = "saved";
            } catch {
                if (token === generation && !pending) status = "error";
            } finally {
                inFlight = null;
            }
            if (pending) return pump();
            return status;
        })();
        return inFlight;
    }

    return {
        getStatus() {
            return status;
        },
        schedule(book) {
            pending = book;
            status = "saving";
            clearTimeout(timer);
            timer = window.setTimeout(() => {
                void pump();
            }, delay);
        },
        async flush() {
            clearTimeout(timer);
            if (!pending && !inFlight) return status;
            return pump();
        },
    };
}
