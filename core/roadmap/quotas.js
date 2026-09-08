export function isReportQuotaOpen(username) {
    const handle = String(username || "").trim().replace(/^@/, "").toLowerCase();
    return handle === "lewstar";
}

function asQuota(row) {
    const data = row && typeof row === "object" ? row : {};
    return {
        used: Number(data.used) || 0,
        limit: Number(data.limit) || 0,
        resetAt: data.reset_at || data.resetAt || "",
    };
}

export async function fetchReportQuota(supabase) {
    const { data, error } = await supabase.rpc("roadmap_report_quota");
    if (error) throw error;
    return asQuota(data);
}

export async function fetchSuggestionQuota(supabase) {
    const { data, error } = await supabase.rpc("roadmap_suggestion_quota");
    if (error) throw error;
    return asQuota(data);
}
