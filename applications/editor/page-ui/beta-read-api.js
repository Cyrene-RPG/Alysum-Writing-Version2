/** Beta Read client adapter. Kept separate from existing excerpt links. */
export function createBetaReadApi(supabase, { origin = location.origin } = {}) {
    async function requireSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session?.access_token) throw new Error("Sign in to manage beta reads.");
        return data.session.access_token;
    }
    async function request(action, payload = {}) {
        const token = await requireSession();
        const response = await fetch(origin + "/api/beta-reads", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action, ...payload }),
            cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Beta Read request failed.");
        return data;
    }
    return Object.freeze({
        create: (snapshot) => request("create", { snapshot }),
        list: () => request("list"),
        close: (id) => request("close", { id }),
        delete: (id, confirmTitle) => request("delete", { id, confirmTitle }),
        threads: (id) => request("threads", { id }),
        snapshot: (id) => request("snapshot", { id }),
        moderate: (id, threadId, operation) => request("moderate", { id, threadId, operation }),
        reviewSuggestion: (id, suggestionId, status) => request("review-suggestion", { id, suggestionId, status }),
    });
}
