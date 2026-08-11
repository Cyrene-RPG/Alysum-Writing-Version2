/**
 * Bulk-encode existing public library chapter HTML with ShieldFont (alpha).
 *
 * Prerequisites:
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env or site/.env
 *
 * Usage (from site/):
 *   node shield-library-backfill.mjs --dry-run
 *   node shield-library-backfill.mjs
 *   node shield-library-backfill.mjs --limit=50
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { encodeHtml } from "./vendor/shieldfont/core/dist/html.js";
import alpha from "./vendor/shieldfont/core/dist/mappings/alpha.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(1, parseInt(limitArg.slice("--limit=".length), 10) || 500) : 500;

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const SHIELD_META = {
    shielded: true,
    shieldMapping: "alpha",
    shieldVersion: "0.3.2",
};

function isShielded(payload) {
    return !!(payload && (payload.shielded === true || payload.shieldMapping === "alpha"));
}

function encodePayload(payload) {
    const data = payload && typeof payload === "object" ? { ...payload } : {};
    if (isShielded(data)) return { payload: data, didEncode: false };
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    data.chapters = chapters.map((ch) => {
        const item = ch && typeof ch === "object" ? { ...ch } : {};
        item.content = encodeHtml(String(item.content || ""), alpha);
        if (item.authorNotes != null && String(item.authorNotes).trim()) {
            item.authorNotes = encodeHtml(String(item.authorNotes), alpha);
        }
        if (item.author_notes != null && String(item.author_notes).trim()) {
            item.author_notes = encodeHtml(String(item.author_notes), alpha);
        }
        return item;
    });
    Object.assign(data, SHIELD_META);
    data.updated = Date.now();
    return { payload: data, didEncode: true };
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log(`ShieldFont library backfill ${DRY_RUN ? "(dry-run) " : ""}limit=${LIMIT}`);

    const { data: rows, error } = await supabase.from("library").select("id, data").limit(LIMIT);
    if (error) throw error;

    let checked = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows || []) {
        checked += 1;
        const payload = row?.data && typeof row.data === "object" ? row.data : {};
        if (isShielded(payload)) {
            skipped += 1;
            continue;
        }
        const chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
        if (!chapters.length) {
            skipped += 1;
            continue;
        }

        const { payload: next, didEncode } = encodePayload(payload);
        if (!didEncode) {
            skipped += 1;
            continue;
        }

        console.log(`  shield ${row.id} (${chapters.length} chapters)`);
        if (!DRY_RUN) {
            const { error: upErr } = await supabase.from("library").update({ data: next }).eq("id", row.id);
            if (upErr) throw upErr;
        }
        updated += 1;
    }

    console.log(JSON.stringify({ checked, updated, skipped, dryRun: DRY_RUN }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
