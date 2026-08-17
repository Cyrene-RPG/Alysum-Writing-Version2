/**
 * Debounced book save. Status is "saving" | "saved" | "error".
 */
export function createAutosave({ delay = 400, save } = {}) {
    let timer = 0;
    let pending = null;
    let status = "saved";
    let generation = 0;

    async function run(book) {
        const token = ++generation;
        status = "saving";
        try {
            await save(book);
            if (token === generation && !pending) status = "saved";
        } catch {
            if (token === generation) status = "error";
        }
        return status;
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
                const payload = pending;
                pending = null;
                if (payload) void run(payload);
            }, delay);
        },
        async flush() {
            clearTimeout(timer);
            const payload = pending;
            pending = null;
            if (!payload) return status;
            return run(payload);
        },
    };
}
