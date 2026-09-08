/**
 * POST /api/roadmap-submit
 * Auth: Bearer access token. Body is JSON (no raw files).
 */

const SUPABASE_URL = "https://jrfxgpkpbacajhcwimgz.supabase.co";
const ANON_KEY = "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";
const { DEFAULT_REPO, DEFAULT_BRANCH, folderName, writeSubmission } = require("./github-write.js");
const { sanitizeFileName } = require("./readable-source.js");

const MAX_BODY = 200 * 1024;
const MAX_TITLE = 120;
const MAX_TEXT = 8000;
const MAX_FILES = 5;

async function readBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) return null;
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
        return {};
    }
}

async function userIdFromToken(token) {
    if (!token) return null;
    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.id || null;
    } catch {
        return null;
    }
}

function restHeaders(token) {
    return {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
}

async function rest(token, path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: { ...restHeaders(token), ...(options.headers || {}) },
    });
    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    return { ok: res.ok, status: res.status, data };
}

async function rpc(token, name) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: restHeaders(token),
        body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
}

function schemaMissingMessage(data) {
    const code = data && data.code;
    const msg = String(data?.message || "");
    if (code === "PGRST202" || code === "PGRST205" || /schema cache/i.test(msg)) {
        return "Roadmap tables are missing on the live database. Run supabase/live-site/supabase-roadmap.sql in the Supabase SQL Editor.";
    }
    return "";
}

function json(res, status, body) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
    }

    const rawAuth = String(req.headers.authorization || "");
    const token = rawAuth.startsWith("Bearer ") ? rawAuth.slice(7).trim() : "";
    const userId = await userIdFromToken(token);
    if (!userId) {
        json(res, 401, { error: "Sign in to submit." });
        return;
    }

    const body = await readBody(req);
    if (body == null) {
        json(res, 400, { error: "Request too large." });
        return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        json(res, 400, { error: "Invalid JSON" });
        return;
    }

    const kind = body.kind === "suggestion" ? "suggestion" : body.kind === "report" ? "report" : "";
    if (!kind) {
        json(res, 400, { error: "kind must be report or suggestion." });
        return;
    }

    const title = String(body.title || "").trim();
    const bodyText = String(body.body || "").trim();
    if (title.length < 1 || title.length > MAX_TITLE) {
        json(res, 400, { error: "Title is required (max 120 characters)." });
        return;
    }
    if (bodyText.length > MAX_TEXT) {
        json(res, 400, { error: "Description is too long." });
        return;
    }
    if (kind === "report" && bodyText.length < 1) {
        json(res, 400, { error: "Description is required." });
        return;
    }

    const severity = ["minor", "normal", "major"].includes(body.severity) ? body.severity : "normal";
    const filesIn = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
    const files = [];
    for (const file of filesIn) {
        const name = sanitizeFileName(file?.name);
        const stagingPath = String(file?.stagingPath || "");
        if (!stagingPath.startsWith(`${userId}/`)) continue;
        const publicUrl =
            file?.publicUrl ||
            `${SUPABASE_URL}/storage/v1/object/public/roadmap-attachments/${stagingPath}`;
        files.push({ name, stagingPath, publicUrl });
    }

    const profile = await rest(token, `users?id=eq.${userId}&select=username`);
    const username =
        String((Array.isArray(profile.data) ? profile.data[0] : profile.data)?.username || "").trim() ||
        "user";

    const quotaOpen = kind === "report" && username.replace(/^@/, "").toLowerCase() === "lewstar";
    const quotaName = kind === "report" ? "roadmap_report_quota" : "roadmap_suggestion_quota";
    const quota = quotaOpen ? { ok: true, data: { used: 0, limit: 9999 } } : await rpc(token, quotaName);
    if (quota.ok && Number(quota.data?.used) >= Number(quota.data?.limit)) {
        json(res, 429, { error: "LIMIT REACHED", resetAt: quota.data?.reset_at || "" });
        return;
    }

    const table = kind === "report" ? "roadmap_reports" : "roadmap_suggestions";
    const dup = await rest(
        token,
        `${table}?title=ilike.${encodeURIComponent(title)}&select=stub`
    );
    if (dup.ok && Array.isArray(dup.data) && dup.data.length) {
        json(res, 409, { error: "duplicate title — edit the existing report instead" });
        return;
    }

    const stubRes = await rpc(token, "next_roadmap_stub");
    const stub = Number(stubRes.data);
    if (!stubRes.ok || !Number.isFinite(stub)) {
        json(res, 500, {
            error: schemaMissingMessage(stubRes.data) || "Could not allocate a report number.",
        });
        return;
    }

    const createdAt = new Date().toISOString();
    const folder = folderName(stub, title);
    const row = {
        stub,
        title,
        body: bodyText,
        author_id: userId,
        author_username: username,
        folder_name: folder,
        files: files.map((f) => ({ name: f.name, staging_path: f.stagingPath })),
        created_at: createdAt,
    };
    if (kind === "report") {
        row.severity = severity;
        row.status = "open";
    } else {
        row.status = "under-review";
    }

    const inserted = await rest(token, table, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(row),
    });
    if (!inserted.ok) {
        json(res, 500, {
            error: schemaMissingMessage(inserted.data) || "Could not save the filing.",
        });
        return;
    }

    const ghToken = String(process.env.GITHUB_TOKEN || "").trim();
    if (!ghToken) {
        json(res, 201, { stub, folderName: folder, committed: false });
        return;
    }

    try {
        await writeSubmission({
            token: ghToken,
            repo: String(process.env.GITHUB_REPO || DEFAULT_REPO).trim() || DEFAULT_REPO,
            branch: String(process.env.GITHUB_BRANCH || DEFAULT_BRANCH).trim() || DEFAULT_BRANCH,
            entry: {
                stub,
                kind: kind === "report" ? "bug" : "suggestion",
                title,
                body: bodyText,
                severity,
                status: kind === "report" ? "open" : "under-review",
                authorUsername: username,
                authorUserId: userId,
                createdAt,
                files,
            },
            stagingFiles: files,
        });
        json(res, 201, { stub, folderName: folder, committed: true });
    } catch (err) {
        console.error("roadmap-submit github", err);
        json(res, 201, {
            stub,
            folderName: folder,
            committed: false,
            error: "queued — folder not in repo yet",
        });
    }
};
