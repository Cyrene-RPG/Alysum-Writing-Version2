export async function fetchReplyCounts(supabase) {
    const counts = new Map();
    const { data, error } = await supabase.from("roadmap_replies").select("bug_stub");
    if (error) throw error;
    for (const row of data || []) {
        const stub = Number(row.bug_stub);
        counts.set(stub, (counts.get(stub) || 0) + 1);
    }
    return counts;
}

export async function fetchReplies(supabase, stub) {
    const { data, error } = await supabase
        .from("roadmap_replies")
        .select("author_username, body, created_at")
        .eq("bug_stub", Number(stub))
        .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => ({
        authorUsername: row.author_username || "",
        body: row.body || "",
        createdAt: row.created_at || "",
    }));
}

export async function postReply(supabase, { stub, userId, username, body }) {
    const text = String(body || "").trim();
    if (!userId) throw new Error("Sign in to reply.");
    if (text.length < 1 || text.length > 2000) {
        throw new Error("Reply must be 1–2000 characters.");
    }
    const { error } = await supabase.from("roadmap_replies").insert({
        bug_stub: Number(stub),
        author_id: userId,
        author_username: username || "user",
        body: text,
    });
    if (error) throw error;
}
