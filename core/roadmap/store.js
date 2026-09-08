import { isReportQuotaOpen } from "./quotas.js";
import { folderName } from "./slug.js";

function schemaMissingMessage(err) {
    const code = err?.code || "";
    const msg = String(err?.message || "");
    if (code === "PGRST202" || code === "PGRST205" || /schema cache/i.test(msg)) {
        return "Roadmap tables are missing on the live database. Run supabase/live-site/supabase-roadmap.sql in the Supabase SQL Editor.";
    }
    return "";
}

function rowToPending(row) {
    return {
        stub: Number(row.stub),
        title: row.title || "",
        body: row.body || "",
        severity: row.severity || "",
        status: row.status || "",
        authorUsername: row.author_username || "",
        authorUserId: row.author_id || "",
        createdAt: row.created_at || "",
        folderName: row.folder_name || "",
        files: Array.isArray(row.files) ? row.files : [],
    };
}

export async function currentRoadmapUser(supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data?.session;
    const userId = session?.user?.id;
    if (!userId) return null;
    const { data: profile } = await supabase
        .from("users")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
    return {
        userId,
        username: String(profile?.username || "").trim() || "user",
        accessToken: session.access_token || "",
    };
}

export async function fetchPendingReports(supabase) {
    const { data, error } = await supabase
        .from("roadmap_reports")
        .select("stub, title, body, severity, status, author_id, author_username, folder_name, files, created_at")
        .order("stub", { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToPending);
}

export async function fetchPendingSuggestions(supabase) {
    const { data, error } = await supabase
        .from("roadmap_suggestions")
        .select("stub, title, body, status, author_id, author_username, folder_name, files, created_at")
        .order("stub", { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToPending);
}

function isApiMissing(res, body) {
    if (res.status === 404 || res.status === 405 || res.status === 501) return true;
    return !res.ok && !body.error;
}

async function insertFiling(supabase, user, payload) {
    const kind = payload.kind === "suggestion" ? "suggestion" : "report";
    const title = String(payload.title || "").trim();
    const bodyText = String(payload.body || "").trim();
    const table = kind === "report" ? "roadmap_reports" : "roadmap_suggestions";

    if (!(kind === "report" && isReportQuotaOpen(user.username))) {
        const rpcName = kind === "report" ? "roadmap_report_quota" : "roadmap_suggestion_quota";
        const { data: quota } = await supabase.rpc(rpcName);
        if (quota && Number(quota.used) >= Number(quota.limit)) {
            throw new Error("LIMIT REACHED");
        }
    }

    const { data: existing } = await supabase.from(table).select("stub").ilike("title", title).limit(1);
    if (existing?.length) {
        throw new Error("duplicate title — edit the existing report instead");
    }

    const { data: stubRaw, error: stubErr } = await supabase.rpc("next_roadmap_stub");
    if (stubErr) throw new Error(schemaMissingMessage(stubErr) || stubErr.message || "Could not allocate a report number.");
    const stub = Number(stubRaw);
    if (!Number.isFinite(stub)) throw new Error("Could not allocate a report number.");

    const folder = folderName(stub, title);
    const row = {
        stub,
        title,
        body: bodyText,
        author_id: user.userId,
        author_username: user.username,
        folder_name: folder,
        files: (payload.files || []).map((file) => ({
            name: file.name,
            staging_path: file.stagingPath || file.staging_path || "",
        })),
    };
    if (kind === "report") {
        row.severity = ["minor", "normal", "major"].includes(payload.severity)
            ? payload.severity
            : "normal";
        row.status = "open";
    } else {
        row.status = "under-review";
    }

    const { error } = await supabase.from(table).insert(row);
    if (error) throw new Error(schemaMissingMessage(error) || error.message || "Could not save the filing.");
    return { stub, folderName: folder, committed: false };
}

async function postSubmit(supabase, user, payload) {
    let res;
    try {
        res = await fetch("/api/roadmap-submit", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${user.accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    } catch {
        return insertFiling(supabase, user, payload);
    }
    let body = {};
    try {
        body = await res.json();
    } catch {
        body = {};
    }
    if (isApiMissing(res, body)) {
        return insertFiling(supabase, user, payload);
    }
    if (!res.ok) {
        throw new Error(body.error || `Could not submit. (${res.status})`);
    }
    return {
        stub: Number(body.stub),
        folderName: body.folderName || "",
        committed: Boolean(body.committed),
    };
}

export async function submitReport(supabase, payload) {
    const user = await currentRoadmapUser(supabase);
    if (!user?.accessToken) throw new Error("Sign in to submit.");
    return postSubmit(supabase, user, { kind: "report", ...payload });
}

export async function submitSuggestion(supabase, payload) {
    const user = await currentRoadmapUser(supabase);
    if (!user?.accessToken) throw new Error("Sign in to submit.");
    return postSubmit(supabase, user, { kind: "suggestion", ...payload });
}
