/**
 * Cloudflare Pages Function: POST /api/language-tool.
 *
 * Same behaviour as core/server/http-handlers/language-tool.js (the Vercel version),
 * rewritten for Cloudflare's Request/Response style. Keep the two in sync until
 * Vercel is switched off, then delete the Vercel copy and api/.
 *
 * Needs the SUPABASE_SERVICE_ROLE_KEY secret in the Pages project settings.
 */

const SUPABASE_URL = "https://jrfxgpkpbacajhcwimgz.supabase.co";
const ANON_KEY = "sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE";
const LANGUAGE_TOOL_URL = "https://api.languagetool.org/v2/check";
const MAX_SENTENCES = 60;
const MAX_TEXT_BYTES = 18000;

// --- inlined from core/statistics/grammar-check.js (kept in sync, kept small) ---
const SEVERE = new Set(["GRAMMAR", "TYPOS", "CONFUSED_WORDS", "COLLOCATIONS", "SEMANTICS", "MISC"]);
function categoryId(match) {
    return String(match?.rule?.category?.id || match?.rule?.issueType || "").toUpperCase();
}
function startsWithCapital(text) {
    const t = String(text || "").trim().replace(/^["'“‘]+/, "");
    const ch = t.charAt(0);
    return ch !== "" && ch === ch.toUpperCase() && /[A-Za-z]/.test(ch);
}
function verdictFor(text, matches, isDialogue) {
    let severe = 0;
    let soft = 0;
    for (const m of matches || []) {
        const c = categoryId(m);
        if (SEVERE.has(c)) severe += 1;
        else if (c) soft += 1;
    }
    if (severe > 0) return "reject";
    if (isDialogue) return "pass";
    if (!startsWithCapital(text) || soft > 0) return "needs_ai";
    return "pass";
}

function packSentences(texts) {
    const sep = "\n\n";
    let cursor = 0;
    const spans = [];
    for (const part of texts) {
        spans.push({ start: cursor, end: cursor + part.length });
        cursor += part.length + sep.length;
    }
    return { packed: texts.join(sep), spans };
}

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
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

async function writeGrammarRows(serviceKey, rows) {
    if (!serviceKey || !rows.length) return;
    await fetch(`${SUPABASE_URL}/rest/v1/sentence_grammar?on_conflict=user_id,sentence_hash`, {
        method: "POST",
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
    });
}

export async function onRequestPost({ request, env }) {
    const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!serviceKey) return json(503, { error: "not_configured" });

    const auth = String(request.headers.get("authorization") || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await userIdFromToken(token);
    if (!userId) return json(401, { error: "unauthorized" });

    let body = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }
    const items = Array.isArray(body?.sentences) ? body.sentences.slice(0, MAX_SENTENCES) : [];
    const clean = items
        .map((it) => ({
            hash: String(it?.hash || "").slice(0, 64),
            text: String(it?.text || "").slice(0, 600),
            isDialogue: Boolean(it?.isDialogue),
        }))
        .filter((it) => it.hash && it.text);

    if (!clean.length) return json(200, { verdicts: {} });

    const { packed, spans } = packSentences(clean.map((it) => it.text));
    if (new TextEncoder().encode(packed).length > MAX_TEXT_BYTES) {
        return json(413, { error: "batch_too_large" });
    }

    let matches = [];
    try {
        const ltRes = await fetch(LANGUAGE_TOOL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({ text: packed, language: "en-US", enabledOnly: "false" }),
        });
        if (!ltRes.ok) throw new Error(`lt_${ltRes.status}`);
        const ltData = await ltRes.json();
        matches = Array.isArray(ltData?.matches) ? ltData.matches : [];
    } catch {
        // Fail closed: no verdicts written, the client keeps the sentences unmarked.
        return json(502, { error: "languagetool_unavailable" });
    }

    const verdicts = {};
    const rows = [];
    clean.forEach((it, i) => {
        const span = spans[i];
        const own = matches.filter((m) => {
            const off = Number(m?.offset) || 0;
            return off >= span.start && off < span.end;
        });
        const v = verdictFor(it.text, own, it.isDialogue);
        verdicts[it.hash] = v;
        rows.push({ user_id: userId, sentence_hash: it.hash, verdict: v });
    });

    try {
        await writeGrammarRows(serviceKey, rows);
    } catch {
        /* the verdicts are still returned; a re-check will retry the write */
    }

    return json(200, { verdicts });
}

export function onRequest() {
    return new Response("Method Not Allowed", { status: 405 });
}
